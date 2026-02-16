import fs from "fs";
import path from "path";
import solc from "solc";
import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

function getImportPath(importPath) {
    if (importPath.startsWith("@openzeppelin/")) {
        return path.resolve("node_modules", importPath);
    }
    return path.resolve("..", "contracts", importPath);
}

function findImports(importPath) {
    try {
        const fullPath = getImportPath(importPath);
        const content = fs.readFileSync(fullPath, "utf8");
        return { contents: content };
    } catch (e) {
        return { error: "File not found: " + importPath };
    }
}

async function compile(fileNames) {
    const sources = {};
    for (const fileName of fileNames) {
        const contractPath = path.resolve("..", "contracts", fileName);
        sources[fileName] = { content: fs.readFileSync(contractPath, "utf8") };
    }

    const input = {
        language: "Solidity",
        sources: sources,
        settings: {
            optimizer: { enabled: true, runs: 200 },
            outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
        },
    };

    console.log("Compiling contracts...");
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach((err) => {
            console.error(err.formattedMessage);
            if (err.severity === "error") hasError = true;
        });
        if (hasError) process.exit(1);
    }
    return output.contracts;
}

async function main() {
    if (!PRIVATE_KEY) {
        console.error("Please provide a PRIVATE_KEY in the .env file.");
        process.exit(1);
    }

    const contracts = await compile(["DepositVault.sol", "GameLogic.sol", "WithdrawalPortal.sol"]);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const deployContract = async (name, fileName, args = []) => {
        const contractData = contracts[fileName][name];
        const factory = new ethers.ContractFactory(contractData.abi, contractData.evm.bytecode.object, wallet);
        console.log(`Deploying ${name}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();
        const address = await contract.getAddress();
        console.log(`${name} deployed at: ${address}`);
        return { address, abi: contractData.abi, contract };
    };

    // 1. Deploy DepositVault
    const vault = await deployContract("DepositVault", "DepositVault.sol", [wallet.address]);

    // 2. Deploy GameLogic
    const logic = await deployContract("GameLogic", "GameLogic.sol", [vault.address]);

    // 3. Deploy WithdrawalPortal
    const portal = await deployContract("WithdrawalPortal", "WithdrawalPortal.sol", [vault.address]);

    // 4. Setup Roles
    console.log("Setting up roles...");
    const LOGIC_ROLE = ethers.id("LOGIC_ROLE");
    const WITHDRAWAL_ROLE = ethers.id("WITHDRAWAL_ROLE");

    const vaultContract = vault.contract;

    console.log("Granting LOGIC_ROLE to GameLogic...");
    const tx1 = await vaultContract.grantRole(LOGIC_ROLE, logic.address);
    await tx1.wait();

    console.log("Granting WITHDRAWAL_ROLE to WithdrawalPortal...");
    const tx2 = await vaultContract.grantRole(WITHDRAWAL_ROLE, portal.address);
    await tx2.wait();

    console.log("Verification of Roles via direct calls...");
    const hasLogic = await vaultContract.hasRole(LOGIC_ROLE, logic.address);
    const hasWithdrawal = await vaultContract.hasRole(WITHDRAWAL_ROLE, portal.address);
    console.log("GameLogic has role:", hasLogic);
    console.log("WithdrawalPortal has role:", hasWithdrawal);

    // Save Deployment Data
    const deploymentData = {
        DepositVault: { address: vault.address, abi: vault.abi },
        GameLogic: { address: logic.address, abi: logic.abi },
        WithdrawalPortal: { address: portal.address, abi: portal.abi }
    };

    fs.writeFileSync(path.resolve("deployment-modular.json"), JSON.stringify(deploymentData, null, 2));
    console.log("Deployment data saved to deployment-modular.json");

    console.log("\n--- CONTRACT ADDRESSES ---");
    console.log("DepositVault:", vault.address);
    console.log("GameLogic:", logic.address);
    console.log("WithdrawalPortal:", portal.address);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
