import hre from "hardhat";

async function main() {
    console.log("Deploying PilotCrashGame...");

    const PilotCrashGame = await hre.ethers.getContractFactory("PilotCrashGame");
    const game = await PilotCrashGame.deploy();

    await game.waitForDeployment();

    const address = await game.getAddress();
    console.log(`PilotCrashGame deployed to: ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
