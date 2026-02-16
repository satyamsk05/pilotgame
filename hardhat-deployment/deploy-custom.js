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

async function main() {
    if (!PRIVATE_KEY) {
        console.error("Please provide a PRIVATE_KEY in the .env file.");
        process.exit(1);
    }

    const contractPath = path.resolve("..", "contracts", "PilotCrashGame.sol");
    const source = fs.readFileSync(contractPath, "utf8");

    const input = {
        language: "Solidity",
        sources: {
            "PilotCrashGame.sol": { content: source },
        },
        settings: {
            optimizer: { enabled: true, runs: 200 },
            outputSelection: {
                "*": {
                    "*": ["abi", "evm.bytecode"],
                },
            },
        },
    };

    console.log("Compiling contract...");
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach((err) => {
            console.error(err.formattedMessage);
            if (err.severity === "error") hasError = true;
        });
        if (hasError) process.exit(1);
    }

    const contractOutput = output.contracts["PilotCrashGame.sol"]["PilotCrashGame"];
    const abi = contractOutput.abi;
    const bytecode = contractOutput.evm.bytecode.object;

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log("Deploying contract to Base Sepolia...");
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();

    console.log("Waiting for deployment at:", await contract.getAddress());
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log("Contract deployed successfully at:", address);

    // Save ABI and Address for frontend use
    const deploymentData = {
        address: address,
        abi: abi
    };
    fs.writeFileSync(path.resolve("deployment.json"), JSON.stringify(deploymentData, null, 2));
    console.log("Deployment data saved to deployment.json");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
