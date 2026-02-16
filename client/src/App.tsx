import React, { useState, useEffect, useRef } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { GameCanvas } from './components/GameCanvas';
import { LiveBets } from './components/LiveBets';
import { useAccount, useConnect, useDisconnect, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { parseEther as viemParseEther, createWalletClient, custom } from 'viem';
import { VAULT_ADDRESS, VAULT_ABI, PORTAL_ADDRESS, PORTAL_ABI } from './contract';
import { motion, AnimatePresence } from 'framer-motion';
// No Settings import needed, using material-symbols

const App: React.FC = () => {
  const { address } = useAccount();
  const {
    multiplier, status, history, nextRoundIn, gameBalance, transactions, betHistory,
    placeBet, cashOut, cancelBet, requestBalance, requestTransactions, requestBetHistory,
    hasActiveBet, activeBetAmount, ethPrice, liveBets
  } = useGameSocket(address);
  const [betAmount, setBetAmount] = useState('0.1'); // Bet amount is now in ETH
  const [isMuted, setIsMuted] = useState(false);
  const { isConnected, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContract, isPending } = useWriteContract();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('0.1');
  const [isAutoCashOut, setIsAutoCashOut] = useState(false);
  const [autoCashOutMultiplier, setAutoCashOutMultiplier] = useState('2.0');

  // Audio References
  const sounds = useRef<{ [key: string]: HTMLAudioElement }>({});
  const prevActiveBet = useRef(false);

  useEffect(() => {
    sounds.current = {
      countdown: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
      bet: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
      cashout: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
      crash: new Audio('https://assets.mixkit.co/active_storage/sfx/2534/2534-preview.mp3')
    };

    // Configure sounds
    sounds.current.countdown.loop = true;
    sounds.current.countdown.volume = 0.3;

    // Preload all
    Object.values(sounds.current).forEach(s => s.load());
  }, []);

  // Global Mute Handler
  useEffect(() => {
    Object.values(sounds.current).forEach(s => {
      s.muted = isMuted;
    });
  }, [isMuted]);

  // Countdown Sound
  useEffect(() => {
    if (status === 'waiting' && nextRoundIn > 0 && !isMuted) {
      sounds.current.countdown?.play().catch(() => { });
    } else {
      sounds.current.countdown?.pause();
      if (sounds.current.countdown) sounds.current.countdown.currentTime = 0;
    }
  }, [status, nextRoundIn, isMuted]);

  // Game Event Sounds (Triggers on state changes)
  useEffect(() => {
    if (!prevActiveBet.current && hasActiveBet) {
      sounds.current.bet?.play().catch(() => { });
    }
    if (prevActiveBet.current && !hasActiveBet && status === 'in-progress') {
      sounds.current.cashout?.play().catch(() => { });
    }
    prevActiveBet.current = hasActiveBet;
  }, [hasActiveBet, status]);

  // Crash Sound
  useEffect(() => {
    if (status === 'crashed') {
      sounds.current.crash?.play().catch(() => { });
    }
  }, [status]);

  // Data Fetching
  useEffect(() => {
    if (isConnected && address) {
      const timer = setTimeout(() => {
        requestBalance(address);
        requestTransactions(address);
        requestBetHistory(address);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, address, requestBalance, requestTransactions, requestBetHistory]);

  useEffect(() => {
    if (isDepositModalOpen && address) {
      requestTransactions(address);
    }
  }, [isDepositModalOpen, address, requestTransactions]);

  const isWrongChain = isConnected && chainId !== baseSepolia.id;

  const handleBet = async () => {
    if (!isConnected) {
      connect({ connector: connectors[0] });
      return;
    }

    if (isWrongChain) {
      switchChain({ chainId: baseSepolia.id });
      return;
    }

    const ethAmount = parseFloat(betAmount);
    if (isNaN(ethAmount) || ethAmount <= 0) return;

    const usdAmount = ethAmount * ethPrice;
    if (usdAmount < 1 || usdAmount > 100) {
      alert(`Bet amount must be between $1 and $100 (Current: $${usdAmount.toFixed(2)})`);
      return;
    }

    if (parseFloat(gameBalance) < ethAmount) {
      alert("Insufficient game balance. Please deposit ETH first.");
      setIsDepositModalOpen(true);
      return;
    }

    if (status === 'waiting') {
      if (hasActiveBet) {
        cancelBet();
      } else {
        const autoMulti = isAutoCashOut ? parseFloat(autoCashOutMultiplier) : undefined;
        placeBet(ethAmount, address!, autoMulti);
      }
    } else if (status === 'in-progress' && hasActiveBet) {
      cashOut();
    }
  };

  const handleDeposit = async () => {
    if (!address || !fundingAmount) return;

    if (isWrongChain) {
      switchChain({ chainId: baseSepolia.id });
      return;
    }

    try {
      const amountToDeposit = parseFloat(fundingAmount);
      if (isNaN(amountToDeposit) || amountToDeposit <= 0) {
        alert("Please enter a valid deposit amount.");
        return;
      }

      writeContract({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'deposit',
        value: viemParseEther(fundingAmount),
      });

      // No need to call requestBalance here immediately as backend polling will pick it up
      // and emit balance-update which we already listen to.
      setFundingAmount("0.1");
    } catch (error) {
      console.error("Deposit failed:", error);
    }
  };

  const handleWithdraw = async () => {
    if (!address || !fundingAmount) return;

    if (isWrongChain) {
      switchChain({ chainId: baseSepolia.id });
      return;
    }

    try {
      const amountToWithdraw = parseFloat(fundingAmount);
      if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
        alert("Please enter a valid withdrawal amount.");
        return;
      }

      if (amountToWithdraw > parseFloat(gameBalance)) {
        alert("Cannot withdraw more than your game balance.");
        return;
      }

      writeContract({
        address: PORTAL_ADDRESS as `0x${string}`,
        abi: PORTAL_ABI,
        functionName: 'withdraw',
        args: [viemParseEther(fundingAmount)],
      });
      requestBalance(address);
    } catch (error) {
      console.error("Withdraw failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#101622] text-white font-display overflow-x-hidden" style={{ zoom: 0.9 }}>
      {/* Top Navigation */}
      <header className="flex items-center justify-between border-b border-primary/20 bg-[#101622]/80 px-6 py-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="text-primary hover:rotate-12 transition-transform cursor-pointer">
            <span className="material-symbols-outlined text-4xl">rocket_launch</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-black tracking-tighter uppercase leading-none">Pilot</h2>
            <span className="text-[10px] font-black text-primary tracking-[0.3em] uppercase opacity-60">Control Center</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {isConnected && (
            <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
              <div className="flex flex-col items-start px-1 sm:px-2 border-r border-white/10">
                <span className="hidden xs:block text-[8px] font-black text-slate-500 uppercase">Game Balance</span>
                <span className={`text-[10px] sm:text-xs font-black ${parseFloat(gameBalance) > 0 ? 'text-primary' : 'text-slate-400'}`}>
                  ${(parseFloat(gameBalance) * ethPrice).toFixed(2)}
                  <span className="hidden xs:inline ml-1.5 opacity-40 text-[9px] font-bold tracking-widest">{parseFloat(gameBalance).toFixed(4)} Ξ</span>
                </span>
              </div>
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="size-7 sm:size-8 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all"
                title="Manage Game Balance"
              >
                <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="size-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-slate-400"
              title={isMuted ? "Unmute" : "Mute"}
            >
              <span className="material-symbols-outlined hover:scale-110 transition-transform">
                {isMuted ? 'volume_off' : 'volume_up'}
              </span>
            </button>
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="flex items-center gap-3 rounded-[1.2rem] h-12 px-8 bg-primary text-white font-black uppercase text-xs tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_30px_rgba(37,106,244,0.4)] group"
              >
                <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">account_balance_wallet</span>
                Connect Wallet
              </button>
            ) : (
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="flex flex-col items-end">
                  <span className="hidden sm:block text-[10px] uppercase text-slate-500 font-bold tracking-widest">Active Pilot</span>
                  <span className="text-[10px] sm:text-xs font-black text-primary">{address?.slice(0, 4)}...{address?.slice(-2)}</span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="size-12 flex items-center justify-center rounded-2xl bg-slate-900 border border-white/5 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 transition-all shadow-xl group"
                >
                  <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">power_settings_new</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Center Game Area - First on mobile, second on desktop */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-10 order-1 lg:order-2">
          {/* Game Canvas */}
          <div className="relative">
            {status === 'waiting' && nextRoundIn > 0 && (
              <div className="absolute top-20 sm:top-32 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
                <div className="bg-[#1a2333]/90 border border-white/10 text-white px-5 py-2 rounded-2xl backdrop-blur-xl shadow-2xl flex items-center gap-5 border-b-primary/50">
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-primary/70 mb-1">Flight Status</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Preparing</span>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10" />
                  <div className="flex flex-col items-end leading-none">
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Launch In</span>
                    <span className="text-xl sm:text-2xl font-black italic tracking-tighter text-primary">
                      {(nextRoundIn / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
                <div className="w-40 sm:w-56 h-[3px] bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: `${(nextRoundIn / 10000) * 100}%` }}
                    transition={{ duration: 0.1, ease: "linear" }}
                    className="h-full bg-primary shadow-[0_0_15px_rgba(37,106,244,0.8)]"
                  />
                </div>
              </div>
            )}
            <GameCanvas multiplier={multiplier} status={status} />

            {/* Compact Fleet History Bar */}
            <div className="absolute bottom-6 left-0 right-0 z-20 px-6 sm:px-12 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar-hide max-w-full pointer-events-auto pb-2">
                {history.map((h, i) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={i}
                    className={`flex-shrink-0 min-w-[50px] sm:min-w-[70px] h-8 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl border transition-all cursor-default text-[10px] sm:text-[11px] font-black italic tracking-tighter backdrop-blur-xl ${h >= 3.5
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                      : h >= 1.5
                        ? 'bg-primary/20 border-primary/30 text-primary shadow-[0_0_20px_rgba(37,106,244,0.2)]'
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.1)]'
                      }`}
                    title={`Round #${history.length - i}: ${h.toFixed(2)}x`}
                  >
                    {h.toFixed(2)}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Refined Compact Betting Controls */}
          <div className="glass-panel rounded-[2rem] p-6 shadow-2xl border border-white/10">
            <div className="flex flex-col gap-6">
              {/* Main Input Row */}
              <div className="flex items-stretch gap-3">
                <div className="relative flex-1 group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-700">Ξ</div>
                  <input
                    type="number"
                    value={betAmount}
                    step="0.01"
                    min="0.01"
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-xl font-black focus:outline-none focus:border-primary/50 transition-all group-hover:bg-slate-950 text-white"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <button
                      onClick={() => setBetAmount(prev => (Math.max(0.01, parseFloat(prev) / 2)).toFixed(2).toString())}
                      className="px-2 py-1 text-[8px] font-black bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-all uppercase"
                    >
                      1/2
                    </button>
                    <button
                      onClick={() => setBetAmount(prev => (parseFloat(prev) * 2).toFixed(2).toString())}
                      className="px-2 py-1 text-[8px] font-black bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-all uppercase"
                    >
                      2x
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleBet}
                  disabled={status === 'crashed' || (status === 'in-progress' && (!hasActiveBet || multiplier === 1.0))}
                  className={`px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center min-w-[140px] ${!isConnected ? 'bg-indigo-600' :
                    isWrongChain ? 'bg-red-600' :
                      (status === 'waiting' && hasActiveBet) ? 'bg-red-500 hover:bg-red-600' :
                        status === 'waiting' ? 'bg-primary' :
                          (status === 'in-progress' && hasActiveBet) ? 'bg-orange-600 animate-pulse' : 'bg-slate-800 opacity-50'
                    }`}
                >
                  <span className="leading-none">
                    {isWrongChain ? 'SWITCH' : isPending ? 'PENDING' : (status === 'waiting' && hasActiveBet) ? 'CANCEL' : (status === 'in-progress' && hasActiveBet ? 'CASH OUT' : 'PLACE BET')}
                  </span>
                  {status === 'in-progress' && hasActiveBet && (
                    <span className="text-[10px] mt-1 font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                      +${(parseFloat(betAmount) * multiplier * ethPrice).toFixed(2)}
                      <span className="ml-2 opacity-40 text-[8px] font-bold italic tracking-tighter">({(parseFloat(betAmount) * multiplier).toFixed(4)} Ξ)</span>
                    </span>
                  )}
                </button>
              </div>

              {/* Bottom Row: Quick Select & Auto Cashout */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5">
                {/* Compact Recommended Bets */}
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 5, 10, 25, 50, 100].map((usdAmount) => {
                    const ethEquivalent = (usdAmount / ethPrice).toFixed(4);
                    return (
                      <button
                        key={usdAmount}
                        onClick={() => setBetAmount(ethEquivalent)}
                        className={`px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-wider transition-all hover:bg-white/10 ${betAmount === ethEquivalent ? 'border-primary/50 bg-primary/10 text-primary' : 'text-slate-500'}`}
                        title={`≈ ${ethEquivalent} ETH`}
                      >
                        ${usdAmount}{usdAmount === 100 ? ' (MAX)' : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Simplified Auto Cashout */}
                <div className="flex items-center gap-4 bg-slate-950/50 px-4 py-2 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsAutoCashOut(!isAutoCashOut)}
                      className={`relative w-10 h-5 rounded-full transition-all flex items-center px-1 ${isAutoCashOut ? 'bg-primary' : 'bg-slate-800'}`}
                    >
                      <motion.div animate={{ x: isAutoCashOut ? 20 : 0 }} className="w-3 h-3 bg-white rounded-full shadow-lg" />
                    </button>
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Auto Cash-out</span>
                  </div>
                  {isAutoCashOut && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black text-slate-500">x</span>
                      <input
                        type="number"
                        value={autoCashOutMultiplier}
                        onChange={(e) => setAutoCashOutMultiplier(e.target.value)}
                        className="w-12 bg-transparent border-none text-xs font-black focus:outline-none text-white text-center"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Status & USD */}
              <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-2 opacity-60">
                  <span className="material-symbols-outlined text-xs text-primary">verified_user</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {status === 'waiting' ? "READY" : "IN FLIGHT"}
                  </span>
                </div>
                <span className="text-[9px] font-black text-primary/70 uppercase tracking-widest">
                  ≈ ${(parseFloat(betAmount) * ethPrice).toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Stats Sidebar - Second on mobile, first on desktop */}
        <aside className="lg:col-span-5 xl:col-span-4 flex flex-col order-2 lg:order-1 lg:h-[calc(100vh-160px)] gap-10 sticky lg:top-32">
          {/* Live Bets Panel */}
          <div className="h-[400px] shrink-0">
            <LiveBets bets={liveBets} ethPrice={ethPrice} status={status} />
          </div>

          {/* Personal Missions Panel */}
          <div className="glass-panel rounded-[2.5rem] p-8 flex flex-col flex-1 min-h-[500px] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-xl">person</span>
                  <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Personal Missions</h3>
                </div>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Your track record</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-4 -mr-4">
              {betHistory.length > 0 ? betHistory.map((bet, i) => (
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  key={bet.id || i}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-default shadow-sm ${bet.result === 'win'
                    ? 'bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30'
                    : 'bg-rose-500/5 border-rose-500/10 hover:border-rose-500/30'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-1.5 rounded-lg ${bet.result === 'win' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
                      <span className="material-symbols-outlined text-sm">
                        {bet.result === 'win' ? 'receipt_long' : 'close_fullscreen'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-white tracking-tight">{bet.multiplier.toFixed(2)}x</span>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                        Ξ{bet.amount} <span className="opacity-40 ml-1">(${(bet.amount * ethPrice).toFixed(2)})</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-black italic tracking-tighter ${bet.result === 'win' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {bet.result === 'win' ? '+' : ''}{bet.profit.toFixed(4)} Ξ
                    </span>
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-0.5">
                      (${(bet.profit * ethPrice).toFixed(2)}) • {new Date(bet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              )) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-20 py-10">
                  <span className="material-symbols-outlined text-5xl">inventory_2</span>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-center">No mission logs found</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Deposit/Withdraw Modal */}
      <AnimatePresence>
        {isDepositModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDepositModalOpen(false)}
              className="absolute inset-0 bg-[#0a0f18]/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-[#1a2333] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-3xl">account_balance_wallet</span>
                    <h3 className="text-xl font-black uppercase tracking-tight">Game Balance</h3>
                  </div>
                  <button
                    onClick={() => setIsDepositModalOpen(false)}
                    className="size-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-all text-slate-400"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available for Instant Play</span>
                      <span className="text-xs font-black text-primary">SYNCED</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-black text-slate-500 uppercase">Ξ</span>
                      <span className="text-4xl font-black text-white italic tracking-tighter">
                        {parseFloat(gameBalance).toFixed(6)}
                      </span>
                      <span className="text-xs font-black text-slate-500/60 uppercase tracking-widest ml-1">
                        ≈ ${(parseFloat(gameBalance) * ethPrice).toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="relative group">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3 px-1">Funding Amount (ETH)</label>
                      <div className="relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-lg font-black text-slate-700">Ξ</div>
                        <input
                          type="number"
                          value={fundingAmount}
                          step="0.01"
                          min="0.001"
                          onChange={(e) => setFundingAmount(e.target.value)}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-2xl py-4 pl-10 pr-5 font-black text-white focus:outline-none focus:border-primary/50 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={handleDeposit}
                        disabled={isPending || !isConnected}
                        className="py-5 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">add_box</span>
                        {isPending ? 'Processing...' : 'Add Funds'}
                      </button>
                      <button
                        onClick={handleWithdraw}
                        disabled={isPending || parseFloat(gameBalance) <= 0}
                        className="py-5 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black uppercase text-xs tracking-[0.2em] hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        Withdraw
                      </button>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-white/5 border border-white/5 mb-8">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary/60 text-sm">info</span>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed uppercase tracking-widest">
                        Funds in your game balance are managed off-chain for zero-latency betting. You can withdraw your full balance at any time.
                      </p>
                    </div>
                  </div>

                  {/* Transaction History Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Pipeline Activity</h4>
                      <span className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                        <span className="size-1 bg-primary rounded-full animate-ping"></span>
                        Live
                      </span>
                    </div>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {transactions.length > 0 ? transactions.map((tx: any) => (
                        <div key={tx.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 border-l-2 border-l-primary/30">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                              <span className="material-symbols-outlined text-xl">
                                {tx.type === 'deposit' ? 'south_west' : 'north_east'}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-white uppercase tracking-tight">
                                {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                              </span>
                              <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                                {new Date(tx.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                          <div className={`text-sm font-black italic flex flex-col items-end ${tx.type === 'deposit' ? 'text-emerald-500' : 'text-slate-100'}`}>
                            <span>{tx.type === 'deposit' ? '+' : '-'} {parseFloat(tx.amount).toFixed(4)} Ξ</span>
                            <span className="text-[9px] opacity-40 not-italic">(${(parseFloat(tx.amount) * ethPrice).toFixed(2)})</span>
                          </div>
                        </div>
                      )) : (
                        <div className="py-16 flex flex-col items-center justify-center gap-4 opacity-20">
                          <span className="material-symbols-outlined text-6xl">database_off</span>
                          <span className="text-[9px] font-black uppercase tracking-[0.4em]">No activity detected</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
