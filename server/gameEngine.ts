import { Server, Socket } from 'socket.io';
import type { GameState, Bet } from './types.js';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const CONTRACT_ADDRESSES = {
    DepositVault: "0xb2E0b7c0eEe0092a833c4368C0ac74a155DEA8ed",
    GameLogic: "0x3e2b634F2A95A69D279d78c7d4959930f2A4786a",
    WithdrawalPortal: "0xcf4A07b24aAef8a513eA2794309083D6e3AB6427"
};

const ABIS = {
    DepositVault: [
        "event Deposited(address indexed user, uint256 amount)",
        "event FundsWithdrawn(address indexed user, uint256 amount)",
        "function userBalances(address) view returns (uint256)"
    ],
    GameLogic: [
        "function startNewRound(bytes32 _commitment) external",
        "function finalizeRound(uint256 _crashPoint, string memory _salt) external",
        "function settleBatch(address[] calldata _players, int256[] calldata _netChanges) external"
    ]
};

export class GameEngine {
    private io!: Server;
    private state: GameState = {
        multiplier: 1.0,
        status: 'waiting',
        startTime: Date.now(),
        crashPoint: 0,
        history: []
    };
    private activeBets: Bet[] = [];
    private ethPrice: number = 2500; // Default fallback
    private lastPriceFetch: number = 0;
    private readonly MIN_BET_USD = 0.01;
    private readonly MAX_BET_USD = 100.0;
    private readonly PRICE_FETCH_INTERVAL = 60000; // 1 minute

    private tickRate = 100; // ms
    private waitingTime = 10000; // ms
    private historyFile = path.resolve(process.cwd(), 'history.json');
    private balancesFile = path.resolve(process.cwd(), 'balances.json');
    private stateFile = path.resolve(process.cwd(), 'server_state.json');
    private transactionsFile = path.resolve(process.cwd(), 'transactions.json');
    private betHistoryFile = path.resolve(process.cwd(), 'bet_history.json');
    private balances: Record<string, string> = {}; // Address -> Balance (string for precision)
    private socketToWallet: Map<string, string> = new Map(); // socket.id -> walletAddress
    private transactions: any[] = [];
    private betHistory: any[] = [];
    private lastBlockProcessed: number = 0;
    private provider!: ethers.JsonRpcProvider;
    private wallet!: ethers.Wallet;
    private vaultContract!: ethers.Contract;
    private logicContract!: ethers.Contract;

    constructor(io: Server) {
        this.io = io;
        this.loadHistory();
        this.loadBalances();
        this.loadTransactions();
        this.loadBetHistory();
        this.loadServerState();

        const rpcUrl = "https://sepolia.base.org";
        const privateKey = process.env.PRIVATE_KEY;

        if (!privateKey) {
            console.warn('SERVER_PRIVATE_KEY not found in .env, blockchain payouts will fail');
        }

        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(privateKey || ethers.ZeroAddress, this.provider);
        this.vaultContract = new ethers.Contract(CONTRACT_ADDRESSES.DepositVault, ABIS.DepositVault, this.wallet);
        this.logicContract = new ethers.Contract(CONTRACT_ADDRESSES.GameLogic, ABIS.GameLogic, this.wallet);

        this.setupEventListeners();
        this.syncMissedDeposits();

        // Initial round after initialization
        this.startNewRound();

        this.io.on('connection', (socket: Socket) => {
            // Initial sync for late joiners
            socket.emit('history-sync', {
                history: this.state.history,
                status: this.state.status,
                multiplier: this.state.multiplier
            });

            if (this.state.status === 'waiting') {
                const elapsed = Date.now() - this.state.startTime;
                socket.emit('game-waiting', {
                    nextRoundIn: Math.max(0, this.waitingTime - elapsed),
                    history: this.state.history
                });
            }

            socket.on('get-balance', (address: string) => {
                const balance = this.balances[address.toLowerCase()] || "0";
                console.log(`Balance requested for ${address}: ${balance}`);
                socket.emit('balance-update', { address, balance });
            });

            socket.on('get-transactions', (address: string) => {
                const userAddress = address.toLowerCase();
                const history = this.transactions.filter(tx => tx.address.toLowerCase() === userAddress);
                console.log(`Transactions requested for ${address}: ${history.length} found`);
                socket.emit('transaction-history', history);
            });

            socket.on('get-bet-history', (address: string) => {
                const userAddress = address.toLowerCase();
                const history = this.betHistory.filter(bet => bet.address.toLowerCase() === userAddress);
                console.log(`Bet history requested for ${address}: ${history.length} found`);
                socket.emit('bet-history', history);
            });

            // Emit current ETH price on connection
            socket.emit('eth-price-update', { price: this.ethPrice });
            // Emit active bets
            socket.emit('active-bets-sync', this.activeBets);

            socket.on('disconnect', () => {
                this.socketToWallet.delete(socket.id);
            });
        });

        // Periodic price update
        this.updateEthPrice();
        setInterval(() => this.updateEthPrice(), this.PRICE_FETCH_INTERVAL);
    }

    private async updateEthPrice() {
        try {
            // Using a simple public API
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
            const data = await response.json() as any;

            if (data?.ethereum?.usd) {
                this.ethPrice = data.ethereum.usd;
                this.lastPriceFetch = Date.now();
                this.io.emit('eth-price-update', { price: this.ethPrice });
                console.log(`Updated ETH price: $${this.ethPrice}`);
            }
        } catch (error) {
            console.error('Failed to fetch ETH price:', error);
        }
    }

    public placeBet(bet: Bet) {
        if (!bet.amount || !Number.isFinite(bet.amount) || bet.amount <= 0) {
            return { success: false, message: "Invalid bet amount. Must be a positive number." };
        }

        if (this.state.status === 'waiting') {
            const usdValue = bet.amount * this.ethPrice;
            if (usdValue < this.MIN_BET_USD || usdValue > this.MAX_BET_USD) {
                return { success: false, message: `Bet must be between $${this.MIN_BET_USD} and $${this.MAX_BET_USD} (Current: $${usdValue.toFixed(2)})` };
            }

            const addr = bet.walletAddress.toLowerCase();

            // Security: Blind socket to wallet address on first bet
            if (this.socketToWallet.has(bet.userId)) {
                if (this.socketToWallet.get(bet.userId) !== addr) {
                    return { success: false, message: "Unauthorized wallet change. Please reconnect." };
                }
            } else {
                this.socketToWallet.set(bet.userId, addr);
            }

            const currentBalance = parseFloat(this.balances[addr] || "0");

            if (currentBalance < bet.amount) {
                return { success: false, message: "Insufficient off-chain balance. Please deposit more ETH." };
            }

            // Deduct immediately
            this.balances[addr] = (currentBalance - bet.amount).toFixed(18);
            this.saveBalances();
            this.io.emit('balance-update', { address: bet.walletAddress, balance: this.balances[addr] });

            this.activeBets.push(bet);
            this.io.emit('bet-placed', bet);
            return { success: true };
        }
        return { success: false, message: "Round already started" };
    }

    private async syncMissedDeposits() {
        try {
            const currentBlock = await this.provider.getBlockNumber();
            const startBlock = this.lastBlockProcessed > 0 ? this.lastBlockProcessed + 1 : currentBlock - 1000;

            if (startBlock > currentBlock) return;

            console.log(`Syncing missed deposits from block ${startBlock} to ${currentBlock}...`);

            const filter = this.vaultContract.filters.Deposited();
            const logs = await this.vaultContract.queryFilter(filter, startBlock, currentBlock);

            let updated = false;
            for (const log of logs) {
                const event = this.vaultContract.interface.parseLog(log);
                if (event) {
                    const { user, amount } = event.args;
                    const addr = user.toLowerCase();
                    console.log(`Catch-up: ${user} deposited ${ethers.formatEther(amount)} ETH`);

                    const currentBalance = ethers.parseEther(this.balances[addr] || "0");
                    const newBalance = currentBalance + amount;
                    this.balances[addr] = ethers.formatEther(newBalance);

                    this.recordTransaction(addr, 'deposit', ethers.formatEther(amount));
                    updated = true;
                }
            }

            // Also sync withdrawals
            const withdrawFilter = this.vaultContract!.filters.FundsWithdrawn();
            const withdrawLogs = await this.vaultContract!.queryFilter(withdrawFilter, startBlock, currentBlock);
            for (const log of withdrawLogs) {
                const event = this.vaultContract.interface.parseLog(log);
                if (event) {
                    const { user, amount } = event.args;
                    this.recordTransaction(user.toLowerCase(), 'withdrawal', ethers.formatEther(amount));
                }
            }

            if (updated) {
                this.saveBalances();
            }

            this.lastBlockProcessed = currentBlock;
            this.saveServerState();
        } catch (error) {
            console.error("Failed to sync missed events:", error);
        }
    }

    private recordTransaction(address: string, type: 'deposit' | 'withdrawal', amount: string) {
        const tx = {
            id: ethers.hexlify(ethers.randomBytes(16)),
            address,
            type,
            amount,
            timestamp: Date.now()
        };

        // Avoid duplicates if syncing
        const exists = this.transactions.some(t => t.address === address && t.type === type && t.amount === amount && Math.abs(t.timestamp - tx.timestamp) < 60000);
        if (!exists) {
            this.transactions.push(tx);
            this.saveTransactions();
            this.io.emit('transaction-update', tx);
        }
    }

    private setupEventListeners() {
        // Polling loop for events is more stable than contract.on with public RPCs
        setInterval(() => {
            this.syncMissedDeposits();
        }, 30000); // Check every 30 seconds
    }

    private loadServerState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf-8');
                const state = JSON.parse(data);
                this.lastBlockProcessed = state.lastBlockProcessed || 0;
            }
        } catch (error) {
            console.error('Failed to load server state:', error);
        }
    }

    private saveServerState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify({
                lastBlockProcessed: this.lastBlockProcessed
            }, null, 2));
        } catch (error) {
            console.error('Failed to save server state:', error);
        }
    }

    private loadTransactions() {
        try {
            if (fs.existsSync(this.transactionsFile)) {
                const data = fs.readFileSync(this.transactionsFile, 'utf-8');
                this.transactions = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load transactions:', error);
            this.transactions = [];
        }
    }

    private saveTransactions() {
        try {
            fs.writeFileSync(this.transactionsFile, JSON.stringify(this.transactions.slice(-100), null, 2)); // Keep last 100
        } catch (error) {
            console.error('Failed to save transactions:', error);
        }
    }

    private loadBetHistory() {
        try {
            if (fs.existsSync(this.betHistoryFile)) {
                const data = fs.readFileSync(this.betHistoryFile, 'utf-8');
                this.betHistory = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load bet history:', error);
            this.betHistory = [];
        }
    }

    private saveBetHistory() {
        try {
            fs.writeFileSync(this.betHistoryFile, JSON.stringify(this.betHistory.slice(-200), null, 2)); // Keep last 200
        } catch (error) {
            console.error('Failed to save bet history:', error);
        }
    }

    private recordBetResult(address: string, amount: number, multiplier: number, profit: number, result: 'win' | 'loss') {
        if (address === "0x0000000000000000000000000000000000000000") return;

        const betResult = {
            id: ethers.hexlify(ethers.randomBytes(16)),
            address: address.toLowerCase(),
            amount,
            multiplier,
            profit,
            result,
            timestamp: Date.now()
        };
        this.betHistory.push(betResult);
        this.saveBetHistory();
        this.io.emit('bet-update', betResult);
    }

    private loadBalances() {
        try {
            if (fs.existsSync(this.balancesFile)) {
                const data = fs.readFileSync(this.balancesFile, 'utf-8');
                this.balances = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load balances:', error);
            this.balances = {};
        }
    }

    private saveBalances() {
        try {
            fs.writeFileSync(this.balancesFile, JSON.stringify(this.balances, null, 2));
        } catch (error) {
            console.error('Failed to save balances:', error);
        }
    }

    private loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf-8');
                this.state.history = JSON.parse(data);
            } else {
                this.state.history = [2.50, 1.25, 4.80, 1.10, 3.20, 1.85, 9.40, 1.05, 2.15, 1.40];
                this.saveHistory();
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            this.state.history = [2.50, 1.25, 4.80, 1.10, 3.20, 1.85, 9.40, 1.05, 2.15, 1.40];
        }
    }

    private saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.state.history.slice(0, 50), null, 2));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    private async startNewRound() {
        this.state.status = 'waiting';
        this.state.multiplier = 1.0;
        this.state.startTime = Date.now();
        this.state.crashPoint = this.generateCrashPoint();
        this.activeBets = [];
        this.io.emit('active-bets-sync', []);

        // Generate simulated bets during waiting phase
        this.generateSimulatedBets();

        // On-chain: Start new round
        try {
            const crashPointInt = Math.floor(this.state.crashPoint * 100);
            const dummyCommitment = ethers.solidityPackedKeccak256(["uint256", "string"], [crashPointInt, "salt"]);
            const tx = await this.logicContract.startNewRound(dummyCommitment);
            process.stdout.write(`Waiting for round ${this.state.crashPoint} start TX: ${tx.hash}... `);
            await tx.wait();
            console.log('Confirmed!');
        } catch (error) {
            console.error('Failed to start round on-chain:', error);
        }

        this.io.emit('game-waiting', {
            nextRoundIn: this.waitingTime,
            history: this.state.history
        });

        setTimeout(() => {
            this.startGame();
        }, this.waitingTime);
    }

    private generateCrashPoint(): number {
        const r = Math.random();
        let crashPoint: number;

        // User Requested Probabilities:
        // - 10% crash exactly at 1.00x (Instant Crash)
        // - 70% crash below 2x
        // - 5% reach 5x
        // - 1% reach 10x
        // - 0.1% reach 50x

        if (r < 0.10) {
            // [1.00] -> 10% chance (Instant Crash)
            crashPoint = 1.00;
        } else if (r < 0.70) {
            // [1.01 - 1.99] -> 60% chance (Total 70% below 2x)
            crashPoint = 1.01 + Math.random() * 0.98;
        } else if (r < 0.95) {
            // [2.00 - 4.99] -> 25% chance (Cumulative 95%)
            crashPoint = 2.0 + Math.random() * 2.99;
        } else if (r < 0.99) {
            // [5.00 - 9.99] -> 4% chance (Cumulative 99%)
            crashPoint = 5.0 + Math.random() * 4.99;
        } else if (r < 0.999) {
            // [10.00 - 49.99] -> 0.9% chance (Cumulative 99.9%)
            crashPoint = 10.0 + Math.random() * 39.99;
        } else {
            // [50.00 - 250.00] -> 0.1% chance
            crashPoint = 50.0 + Math.random() * 200.0;
        }

        return Math.floor(crashPoint * 100) / 100;
    }

    private generateSimulatedBets() {
        const botNames = [
            "Arjun", "Rahul", "Priya", "Ananya", "Vikram", "Sneha", "Ishaan", "Kavya", "Rohan", "Meera",
            "Aditya", "Aisha", "Kabir", "Zara", "Aryan", "Diya", "Vihaan", "Myra", "Advait", "Anvi",
            "Reyansh", "Shanaya", "Aarav", "Saanvi", "Kian", "Inaya", "Vedant", "Aarya", "Atharv", "Pari",
            "Rudra", "Gauri", "Ayaan", "Siya", "Shaurya", "Avni", "Vivaan", "Amaira", "Krishna", "Anika",
            "Sai", "Kyra", "Hriday", "Parth", "Navya", "Dev", "Ira", "Shlok", "Jiya", "Tanishq",
            "Siddharth", "Ishani", "Yash", "Riya", "Dhruv", "Zoya", "Manan", "Kiara", "Kunal", "Tanya"
        ];

        // Shuffle and pick 25-35 unique bots
        const numBots = Math.floor(Math.random() * 11) + 25; // 25 to 35 bots
        console.log(`[BOTS] Scheduled ${numBots} bots for this round.`);
        const selectedNames = [...botNames].sort(() => 0.5 - Math.random()).slice(0, numBots);

        selectedNames.forEach((name, index) => {
            const delay = 1500 + Math.random() * 6500; // Grace period + random spread
            setTimeout(() => {
                if (this.state.status !== 'waiting') {
                    console.log(`[BOTS] Skip bot ${name} - game already started.`);
                    return;
                }

                const amountUsd = Math.random() * (this.MAX_BET_USD - this.MIN_BET_USD) + this.MIN_BET_USD;
                const amountEth = amountUsd / this.ethPrice;

                const botBet: Bet = {
                    userId: `bot_${name}_${Math.random().toString(36).substr(2, 5)}`,
                    username: name,
                    amount: parseFloat(amountEth.toFixed(4)),
                    walletAddress: "0x0000000000000000000000000000000000000000",
                    isSimulated: true,
                    timestamp: Date.now()
                };

                // Add to active bets
                this.activeBets.push(botBet);
                this.io.emit('bet-placed', botBet);
                // console.log(`[BOTS] Bot ${name} placed bet.`);

                // Setup random auto-cashout for bots
                const r = Math.random();
                if (r < 0.9) {
                    botBet.autoCashOut = parseFloat((1.1 + Math.random() * 1.9).toFixed(2));
                } else {
                    if (Math.random() > 0.5) {
                        botBet.autoCashOut = parseFloat((3.0 + Math.random() * 5.0).toFixed(2));
                    }
                }
            }, delay);
        });
    }

    private startGame() {
        this.state.status = 'in-progress';
        this.state.startTime = Date.now();
        this.io.emit('game-start', { startTime: this.state.startTime });

        const interval = setInterval(() => {
            const elapsed = (Date.now() - this.state.startTime) / 1000;
            this.state.multiplier = Math.floor(Math.pow(1.07, elapsed) * 100) / 100;

            // Process auto-cashouts
            this.activeBets.forEach(bet => {
                if (!bet.cashOutMultiplier && bet.autoCashOut && this.state.multiplier >= bet.autoCashOut) {
                    console.log(`Auto-cashout triggered for ${bet.userId} at ${bet.autoCashOut}x`);
                    this.cashOut(bet.userId);
                }
            });

            if (this.state.multiplier >= this.state.crashPoint) {
                clearInterval(interval);
                this.crashGame();
            } else {
                this.io.emit('multiplier-update', { multiplier: this.state.multiplier });
            }
        }, this.tickRate);
    }

    private async crashGame() {
        this.state.status = 'crashed';
        this.state.history.unshift(this.state.crashPoint);
        if (this.state.history.length > 50) this.state.history.pop();
        this.saveHistory();

        // On-chain: Finalize round
        try {
            const crashPointInt = Math.floor(this.state.crashPoint * 100);
            const tx = await this.logicContract.finalizeRound(crashPointInt, "salt");
            console.log(`On-chain round finalized: ${tx.hash}`);
        } catch (error) {
            console.error('Failed to finalize round on-chain:', error);
        }

        this.io.emit('game-crashed', { crashPoint: this.state.crashPoint });

        // Settle round results on-chain
        this.settleRoundResults();

        setTimeout(() => {
            this.startNewRound();
        }, 3000); // 3 seconds delay after crash before countdown starts
    }

    private async settleRoundResults() {
        if (this.activeBets.length === 0) return;

        const players: string[] = [];
        const netChanges: bigint[] = [];

        for (const bet of this.activeBets) {
            if (bet.isSimulated) continue;

            players.push(bet.walletAddress);

            if (bet.payout && bet.payout > 0) {
                // Winner (Already recorded in cashOut, but we need it for on-chain settlement)
                const netWin = bet.payout - bet.amount;
                netChanges.push(ethers.parseEther(netWin.toFixed(18)));
            } else {
                // Loser
                const netLoss = -bet.amount;
                netChanges.push(ethers.parseEther(netLoss.toFixed(18)));

                // Record loss in history
                this.recordBetResult(bet.walletAddress, bet.amount, this.state.crashPoint, netLoss, 'loss');
            }
        }

        try {
            const tx = await this.logicContract.settleBatch(players, netChanges);
            console.log(`Batch settlement TX sent: ${tx.hash}`);
            await tx.wait();
            console.log('Batch settlement confirmed');
        } catch (error) {
            console.error('Failed to settle batch on-chain:', error);
        }
    }


    public cancelBet(userId: string) {
        if (this.state.status === 'waiting') {
            const betIndex = this.activeBets.findIndex(b => b.userId === userId);
            if (betIndex !== -1) {
                const bet = this.activeBets[betIndex];
                const addr = bet.walletAddress.toLowerCase();

                // Refund amount
                const currentBalance = parseFloat(this.balances[addr] || "0");
                this.balances[addr] = (currentBalance + bet.amount).toFixed(18);
                this.saveBalances();

                // Remove from active bets
                this.activeBets.splice(betIndex, 1);

                this.io.emit('balance-update', { address: bet.walletAddress, balance: this.balances[addr] });
                this.io.emit('bet-cancelled', { userId: bet.userId, address: bet.walletAddress });

                return { success: true };
            }
            return { success: false, message: "No active bet found" };
        }
        return { success: false, message: "Cannot cancel after round starts" };
    }

    public async cashOut(userId: string) {
        console.log(`Cash-out requested off-chain: ${userId}`);
        const walletAddr = this.socketToWallet.get(userId);

        if (this.state.status === 'in-progress') {
            const bet = this.activeBets.find(b => b.userId === userId && !b.cashOutMultiplier);

            // Security Check: Ownership verification
            if (bet && !bet.isSimulated) {
                if (!walletAddr || bet.walletAddress.toLowerCase() !== walletAddr.toLowerCase()) {
                    console.warn(`[SECURITY] Unauthorized cash-out attempt rejected for socket ${userId}`);
                    return { success: false, message: "Unauthorized: Wallet mismatch" };
                }
            }

            if (bet) {
                bet.cashOutMultiplier = this.state.multiplier;
                bet.payout = bet.amount * bet.cashOutMultiplier;

                // Record win in history
                if (!bet.isSimulated) {
                    // Credit balance off-chain instantly
                    const addr = bet.walletAddress.toLowerCase();
                    const currentBalance = parseFloat(this.balances[addr] || "0");
                    this.balances[addr] = (currentBalance + bet.payout).toFixed(18);
                    this.saveBalances();
                    this.io.emit('balance-update', { address: bet.walletAddress, balance: this.balances[addr] });

                    this.recordBetResult(bet.walletAddress, bet.amount, bet.cashOutMultiplier, bet.payout - bet.amount, 'win');
                }

                this.io.emit('bet-cashed-out', bet);
                return { success: true, payout: bet.payout };
            }
        }
        return { success: false, message: "Cannot cash out now" };
    }
}
