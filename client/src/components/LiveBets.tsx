import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Bet {
    userId: string;
    username: string;
    amount: number;
    walletAddress: string;
    cashOutMultiplier?: number;
    autoCashOut?: number;
    payout?: number;
    isSimulated?: boolean;
    timestamp: number;
}

interface LiveBetsProps {
    bets: Bet[];
    ethPrice: number;
    status: 'waiting' | 'in-progress' | 'crashed';
}

export const LiveBets: React.FC<LiveBetsProps> = ({ bets, ethPrice, status }) => {
    // Sort: cashed out first, then by amount
    const sortedBets = [...bets].sort((a, b) => {
        if (a.cashOutMultiplier && !b.cashOutMultiplier) return -1;
        if (!a.cashOutMultiplier && b.cashOutMultiplier) return 1;
        return b.amount - a.amount;
    });

    return (
        <div className="glass-panel rounded-[2rem] p-5 flex flex-col h-[400px] max-h-[400px] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10 shrink-0">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">groups</span>
                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Live Bets</h3>
                    </div>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Active participants</p>
                </div>
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                    <span className="text-[8px] text-primary font-black uppercase tracking-widest">{bets.length} PLR</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar-hide">
                <AnimatePresence initial={false}>
                    {sortedBets.length > 0 ? sortedBets.map((bet) => (
                        <motion.div
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={bet.userId}
                            className={`flex items-center justify-between p-2 rounded-xl border-[0.5px] transition-all cursor-default shadow-sm ${bet.cashOutMultiplier
                                ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                : status === 'crashed'
                                    ? 'bg-rose-500/5 border-rose-500/10 opacity-70'
                                    : 'bg-primary/5 border-primary/20'
                                }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="p-1 rounded-lg bg-primary/20 text-primary">
                                    <span className="material-symbols-outlined text-[12px]">
                                        person
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black tracking-tight leading-none text-white flex items-center gap-1.5">
                                        {(bet.username || bet.walletAddress.slice(0, 6))}
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${(status === 'crashed' && !bet.cashOutMultiplier) ? 'text-rose-500/80 transition-colors' : 'text-emerald-500/80 transition-colors'
                                            }`}>
                                            ${(bet.amount * ethPrice).toFixed(2)}
                                        </span>
                                        <span className="text-[7px] font-bold text-slate-700 tracking-widest leading-none opacity-40">
                                            {bet.amount.toFixed(4)} Ξ
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                {bet.cashOutMultiplier ? (
                                    <>
                                        <span className="text-[14px] font-black italic tracking-tighter text-emerald-500 leading-none drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                                            {bet.cashOutMultiplier.toFixed(2)}x
                                        </span>
                                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mt-1">
                                            +${((bet.payout! - bet.amount) * ethPrice).toFixed(2)} <span className="opacity-40 ml-0.5 text-[7px]">({(bet.payout! - bet.amount).toFixed(4)} Ξ)</span>
                                        </span>
                                    </>
                                ) : (
                                    <span className={`text-[8.5px] font-black uppercase tracking-widest ${status === 'crashed' ? 'text-rose-500/80' : 'text-slate-700'}`}>
                                        {status === 'crashed' ? 'Lost' : status === 'waiting' ? 'Ready' : 'Flying'}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-20 py-10">
                            <span className="material-symbols-outlined text-5xl">radar</span>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-center">Waiting for bets...</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
