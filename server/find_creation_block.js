import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

async function findCreationBlock() {
    const rpcUrl = "https://sepolia.base.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contractAddress = "0xb2E0b7c0eEe0092a833c4368C0ac74a155DEA8ed";

    let highest = await provider.getBlockNumber();
    let lowest = 0;

    console.log(`Searching for creation block of ${contractAddress}...`);

    while (lowest <= highest) {
        let mid = Math.floor((lowest + highest) / 2);
        let code = await provider.getCode(contractAddress, mid);
        if (code !== '0x') {
            highest = mid - 1;
        } else {
            lowest = mid + 1;
        }
    }
    console.log(`Approximate creation block: ${lowest}`);
}

findCreationBlock();
