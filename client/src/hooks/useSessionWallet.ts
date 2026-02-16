import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, http, publicActions, parseEther, formatEther, type Address } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const SESSION_WALLET_KEY = 'pilot_session_wallet_pk';

export interface SessionWalletStatus {
    address: Address | null;
    balance: string;
    isConnected: boolean;
    isGenerating: boolean;
}

export const useSessionWallet = () => {
    const [status, setStatus] = useState<SessionWalletStatus>({
        address: null,
        balance: '0.0000',
        isConnected: false,
        isGenerating: false,
    });
    const [account, setAccount] = useState<ReturnType<typeof privateKeyToAccount> | null>(null);

    // Initialize public client for balance checks
    const publicClient = createWalletClient({
        chain: baseSepolia,
        transport: http()
    }).extend(publicActions);

    // Load wallet from localStorage on mount
    useEffect(() => {
        const savedPk = localStorage.getItem(SESSION_WALLET_KEY);
        if (savedPk) {
            try {
                const loadedAccount = privateKeyToAccount(savedPk as `0x${string}`);
                setAccount(loadedAccount);
                setStatus(prev => ({ ...prev, address: loadedAccount.address, isConnected: true }));
            } catch (e) {
                console.error("Failed to load session wallet:", e);
                localStorage.removeItem(SESSION_WALLET_KEY);
            }
        }
    }, []);

    // Update balance
    const updateBalance = useCallback(async () => {
        if (status.address) {
            try {
                const balance = await publicClient.getBalance({ address: status.address });
                setStatus(prev => ({ ...prev, balance: formatEther(balance) }));
            } catch (e) {
                console.error("Failed to fetch session wallet balance:", e);
            }
        }
    }, [status.address]);

    useEffect(() => {
        updateBalance();
        const interval = setInterval(updateBalance, 8000); // Poll balance
        return () => clearInterval(interval);
    }, [updateBalance]);

    const createWallet = useCallback(() => {
        setStatus(prev => ({ ...prev, isGenerating: true }));
        try {
            const privateKey = generatePrivateKey();
            localStorage.setItem(SESSION_WALLET_KEY, privateKey);
            const newAccount = privateKeyToAccount(privateKey);
            setAccount(newAccount);
            setStatus({
                address: newAccount.address,
                balance: '0.0000',
                isConnected: true,
                isGenerating: false,
            });
            return newAccount;
        } catch (e) {
            console.error("Failed to create session wallet:", e);
            setStatus(prev => ({ ...prev, isGenerating: false }));
            return null;
        }
    }, []);

    const disconnectWallet = useCallback(() => {
        localStorage.removeItem(SESSION_WALLET_KEY);
        setAccount(null);
        setStatus({
            address: null,
            balance: '0.0000',
            isConnected: false,
            isGenerating: false,
        });
    }, []);

    const exportPrivateKey = useCallback(() => {
        return localStorage.getItem(SESSION_WALLET_KEY);
    }, []);

    return {
        ...status,
        account,
        createWallet,
        disconnectWallet,
        exportPrivateKey,
        refreshBalance: updateBalance
    };
};
