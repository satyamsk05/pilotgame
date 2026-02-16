import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const VAULT_ADDRESS = "0xb2E0b7c0eEe0092a833c4368C0ac74a155DEA8ed";
const PORTAL_ADDRESS = "0xcf4A07b24aAef8a513eA2794309083D6e3AB6427";
const USER_ADDRESS = "0x075da9f0db9a4befaa09366fe7646f2c1c1a07a3";

const VAULT_ABI = [
    "function userBalances(address) view returns (uint256)",
    "function hasRole(bytes32, address) view returns (bool)",
    "function WITHDRAWAL_ROLE() view returns (bytes32)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

    console.log("--- Diagnostics ---");

    // 1. Check User Balance
    const balance = await vault.userBalances(USER_ADDRESS);
    console.log(`User On-chain Balance: ${ethers.formatEther(balance)} ETH (${balance.toString()} wei)`);

    // 2. Check Withdrawal Role
    const ROLE = await vault.WITHDRAWAL_ROLE();
    const hasRole = await vault.hasRole(ROLE, PORTAL_ADDRESS);
    console.log(`WithdrawalPortal (${PORTAL_ADDRESS}) has WITHDRAWAL_ROLE: ${hasRole}`);

    if (!hasRole) {
        console.log("CRITICAL: WithdrawalPortal does NOT have permission to withdraw from DepositVault.");
    }
}

main().catch(console.error);
