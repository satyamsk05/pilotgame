export const VAULT_ADDRESS = "0xb2E0b7c0eEe0092a833c4368C0ac74a155DEA8ed";
export const LOGIC_ADDRESS = "0x3e2b634F2A95A69D279d78c7d4959930f2A4786a";
export const PORTAL_ADDRESS = "0xcf4A07b24aAef8a513eA2794309083D6e3AB6427";

export const VAULT_ABI = [
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Deposited",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "deposit",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "userBalances",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const LOGIC_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "_crashPoint", "type": "uint256" },
            { "internalType": "string", "name": "_salt", "type": "string" }
        ],
        "name": "finalizeRound",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address[]", "name": "_players", "type": "address[]" },
            { "internalType": "int256[]", "name": "_netChanges", "type": "int256[]" }
        ],
        "name": "settleBatch",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

export const PORTAL_ABI = [
    {
        "inputs": [{ "internalType": "uint256", "name": "_amount", "type": "uint256" }],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;
