import { io, Socket } from 'socket.io-client';
import { useState, useEffect, useCallback } from 'react';

const SOCKET_URL = 'https://pilotgame.onrender.com';

export const useGameSocket = (userAddress?: string) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [multiplier, setMultiplier] = useState(1.0);
    const [status, setStatus] = useState<'waiting' | 'in-progress' | 'crashed'>('waiting');
    const [history, setHistory] = useState<number[]>([]);
    const [nextRoundIn, setNextRoundIn] = useState(0);
    const [gameBalance, setGameBalance] = useState<string>("0");
    const [transactions, setTransactions] = useState<any[]>([]);
    const [betHistory, setBetHistory] = useState<any[]>([]);
    const [hasActiveBet, setHasActiveBet] = useState(false);
    const [activeBetAmount, setActiveBetAmount] = useState<number | null>(null);
    const [ethPrice, setEthPrice] = useState(2500);
    const [liveBets, setLiveBets] = useState<any[]>([]);

    useEffect(() => {
        const s = io(SOCKET_URL);
        setSocket(s);

        s.on('multiplier-update', (data: { multiplier: number }) => {
            setMultiplier(data.multiplier);
            setStatus('in-progress');
        });

        s.on('history-sync', (data: { history: number[], status: any, multiplier: number }) => {
            setHistory(data.history);
            setStatus(data.status);
            setMultiplier(data.multiplier);
        });

        s.on('game-waiting', (data: { nextRoundIn: number, history: number[] }) => {
            setStatus('waiting');
            setNextRoundIn(data.nextRoundIn);
            setHistory(data.history);
            setMultiplier(1.0);
            setHasActiveBet(false);
            setActiveBetAmount(null);
            setLiveBets([]); // Clear live bets for a fresh round
        });

        s.on('game-start', () => {
            setStatus('in-progress');
            setNextRoundIn(0);
        });

        s.on('game-crashed', (data: { crashPoint: number }) => {
            setStatus('crashed');
            setMultiplier(data.crashPoint);
            setHasActiveBet(false);
            setActiveBetAmount(null);
        });

        s.on('balance-update', (data: { address: string, balance: string, isBot?: boolean }) => {
            // Only update if it's the connected user's balance and not a bot
            if (userAddress && data.address.toLowerCase() === userAddress.toLowerCase() && !data.isBot) {
                setGameBalance(data.balance);
            }
        });

        s.on('transaction-history', (data: any[]) => {
            setTransactions(data.sort((a, b) => b.timestamp - a.timestamp));
        });

        s.on('transaction-update', (data: any) => {
            setTransactions(prev => [data, ...prev].slice(0, 50));
        });

        s.on('bet-history', (data: any[]) => {
            setBetHistory(data.sort((a, b) => b.timestamp - a.timestamp));
        });

        s.on('bet-update', (data: any) => {
            // Only add to PERSONAL mission history if it's the user's bet
            if (userAddress && data.address.toLowerCase() === userAddress.toLowerCase()) {
                setBetHistory(prev => [data, ...prev].slice(0, 50));
            }
        });

        s.on('bet-placed', (data: any) => {
            setLiveBets(prev => [...prev, data]);
            if (s.id === data.userId || (data.walletAddress && data.walletAddress === s.id)) { // Note: s.id might not be the same as userId if userId is address
                setHasActiveBet(true);
                setActiveBetAmount(data.amount);
            }
        });

        s.on('bet-cashed-out', (data: any) => {
            setLiveBets(prev => prev.map(bet => bet.userId === data.userId ? data : bet));
            if (s.id === data.userId) {
                setHasActiveBet(false);
                setActiveBetAmount(null);
            }
        });

        s.on('bet-cancelled', (data: any) => {
            setLiveBets(prev => prev.filter(bet => bet.userId !== data.userId));
            if (s.id === data.userId) {
                setHasActiveBet(false);
                setActiveBetAmount(null);
            }
        });

        s.on('eth-price-update', (data: { price: number }) => {
            setEthPrice(data.price);
        });

        s.on('active-bets-sync', (data: any[]) => {
            setLiveBets(data);
        });

        return () => {
            s.disconnect();
        };
    }, []);

    useEffect(() => {
        if (status === 'waiting' && nextRoundIn > 0) {
            const timer = setInterval(() => {
                setNextRoundIn(prev => Math.max(0, prev - 100));
            }, 100);
            return () => clearInterval(timer);
        }
    }, [status, nextRoundIn]);

    const placeBet = useCallback((amount: number, address?: string, autoCashOut?: number) => {
        socket?.emit('place-bet', { amount, address, autoCashOut });
    }, [socket]);

    const cashOut = useCallback(() => {
        socket?.emit('cash-out');
    }, [socket]);

    const cancelBet = useCallback(() => {
        socket?.emit('cancel-bet');
    }, [socket]);

    const requestBalance = useCallback((address: string) => {
        socket?.emit('get-balance', address);
    }, [socket]);

    const requestTransactions = useCallback((address: string) => {
        socket?.emit('get-transactions', address);
    }, [socket]);

    const requestBetHistory = useCallback((address: string) => {
        socket?.emit('get-bet-history', address);
    }, [socket]);

    return {
        multiplier, status, history, nextRoundIn, gameBalance, transactions, betHistory,
        hasActiveBet, activeBetAmount, ethPrice, liveBets,
        placeBet, cashOut, cancelBet, requestBalance, requestTransactions, requestBetHistory
    };
};
