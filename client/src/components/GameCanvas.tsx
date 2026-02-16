import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GameCanvasProps {
    multiplier: number;
    status: 'waiting' | 'in-progress' | 'crashed';
}

const ParticleSystem: React.FC<{ multiplier: number; status: string }> = ({ multiplier, status }) => {
    // Detect mobile for optimizations
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const particleCount = isMobile ? 8 : 20;

    const particles = useMemo(() => Array.from({ length: particleCount }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        width: Math.random() * 50 + 20,
        opacity: Math.random() * 0.3 + 0.1,
        duration: Math.random() * 2 + 0.5
    })), [particleCount]);

    if (status !== 'in-progress') return null;

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    initial={{ x: '100vw' }}
                    animate={{ x: '-20vw' }}
                    transition={{
                        duration: p.duration / (1 + (multiplier - 1) / 5),
                        repeat: Infinity,
                        ease: "linear",
                        delay: Math.random() * 2
                    }}
                    style={{
                        position: 'absolute',
                        top: p.top,
                        width: p.width,
                        height: '1px',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4))',
                        opacity: p.opacity,
                        willChange: 'transform',
                    }}
                />
            ))}
        </div>
    );
};

const JetHero: React.FC<{ color?: string }> = ({ color = "#256af4" }) => (
    <svg width="120" height="60" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_15px_rgba(37,106,244,0.6)] will-change-transform">
        <path d="M120 30L90 15L75 5L20 5L40 15L10 30L40 45L20 55L75 55L90 45L120 30Z" fill="url(#jet_grad)" />
        <path d="M115 30L90 18L45 18L40 30L45 42L90 42L115 30Z" fill="rgba(255,255,255,0.2)" />
        <path d="M85 30H45" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        <circle cx="10" cy="30" r="4" fill="#ff2d55" />
        <defs>
            <linearGradient id="jet_grad" x1="0" y1="30" x2="120" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1a1c2c" />
                <stop offset="0.5" stopColor="#256af4" />
                <stop offset="1" stopColor="#4de1ff" />
            </linearGradient>
        </defs>
    </svg>
);

export const GameCanvas = React.memo<GameCanvasProps>(({ multiplier, status }) => {
    const [shake, setShake] = useState(0);

    useEffect(() => {
        if (status === 'crashed') {
            setShake(10);
            const timer = setTimeout(() => setShake(0), 400);
            return () => clearTimeout(timer);
        }
    }, [status]);

    const position = useMemo(() => {
        const progress = Math.min(1 - Math.pow(0.2, (multiplier - 1) / 0.8), 0.98);
        const x = 5 + (progress * 85);
        const y = 15 + (progress * 70);
        const angle = -15 - (progress * 15);
        return { x: `${x}%`, y: `${y}%`, rotate: angle };
    }, [multiplier]);

    const intensity = useMemo(() => Math.min((multiplier - 1) * 10, 80), [multiplier]);

    return (
        <motion.div
            animate={shake ? {
                x: [0, -shake, shake, -shake, shake, 0],
                y: [0, shake, -shake, shake, -shake, 0]
            } : {}}
            transition={{ duration: 0.4 }}
            className="relative flex-1 min-h-[400px] md:min-h-[500px] bg-[#0b0f1a] rounded-[2rem] md:rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl"
        >
            <ParticleSystem multiplier={multiplier} status={status} />

            {/* Perspective Grid - Simplified on Mobile */}
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(#256af4 1px, transparent 1px), linear-gradient(90deg, #256af4 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(circle at 50% 50%, black, transparent 90%)'
                }}
            ></div>

            {/* Dynamic Glows - Reduced on Mobile */}
            <div className="absolute top-[-10%] left-[-10%] size-[600px] bg-primary/20 rounded-full blur-[140px] opacity-10 md:opacity-20 pointer-events-none"></div>

            {/* Center Multiplier Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={status === 'crashed' ? 'crashed' : 'active'}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.2 }}
                        className="flex flex-col items-center"
                    >
                        <motion.span
                            key={multiplier}
                            className={`text-[80px] md:text-[180px] font-black tracking-tighter leading-none select-none transition-colors duration-300 ${status === 'crashed' ? 'text-red-500' : 'text-white'}`}
                            style={{
                                textShadow: status === 'crashed'
                                    ? '0 0 40px rgba(239,68,68,0.7)'
                                    : `0 0 ${20 + (intensity / 2)}px rgba(37,106,244,0.4)`,
                                willChange: 'contents'
                            }}
                        >
                            {multiplier.toFixed(2)}<span className="text-[30px] md:text-[60px] opacity-30 ml-2 italic">x</span>
                        </motion.span>

                        <div className="mt-4 md:mt-6 px-6 md:px-8 py-2 md:py-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm md:backdrop-blur-xl flex items-center gap-3">
                            <div className={`size-2 md:size-3 rounded-full ${status === 'in-progress' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                            <span className="text-primary font-black uppercase tracking-[0.3em] md:tracking-[0.5em] text-[8px] md:text-[10px]">
                                {status === 'waiting' ? 'Ready for Takeoff' : status === 'crashed' ? 'Critical Failure' : 'Jet In Flight'}
                            </span>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Jet Visual */}
            <AnimatePresence>
                {status === 'in-progress' && (
                    <motion.div
                        initial={{ left: '0%', bottom: '5%', opacity: 0, scale: 0.5, rotate: -15 }}
                        animate={{
                            left: position.x,
                            bottom: position.y,
                            rotate: position.rotate,
                            opacity: 1,
                            scale: 1
                        }}
                        exit={{
                            scale: 1.5,
                            opacity: 0,
                            transition: { duration: 0.2 }
                        }}
                        transition={{ duration: 0.05, ease: 'linear' }}
                        className="absolute z-20 will-change-transform"
                    >
                        <div className="relative scale-75 md:scale-100">
                            <JetHero />
                            {/* Engine Exhaust - GPU promote */}
                            <motion.div
                                animate={{
                                    scaleX: [1, 1.3, 1],
                                    opacity: [0.6, 1, 0.6]
                                }}
                                transition={{ repeat: Infinity, duration: 0.1 }}
                                className="absolute top-[25px] right-[95%] w-12 md:w-16 h-4 bg-gradient-to-l from-cyan-400 via-blue-500 to-transparent blur-[8px] origin-right will-change-transform"
                            ></motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Crash Explosion Layer */}
            {status === 'crashed' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-40 bg-red-600/5 backdrop-blur-[1px]"
                >
                    <div className="absolute inset-0 border-[15px] md:border-[30px] border-red-500/10 rounded-[2rem] md:rounded-[2.5rem] animate-pulse"></div>
                </motion.div>
            )}

            {/* UI Elements */}
            <div className="absolute top-6 md:top-8 left-6 md:left-8 flex items-center gap-2 opacity-50">
                <span className="size-1.5 md:size-2 rounded-full bg-cyan-500"></span>
                <span className="text-[8px] md:text-[10px] font-bold text-slate-400 tracking-[0.2em] md:tracking-[0.3em] uppercase italic">Flight Link</span>
            </div>
        </motion.div>
    );
});
