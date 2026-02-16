export interface GameState {
  multiplier: number;
  status: 'waiting' | 'in-progress' | 'crashed';
  startTime: number;
  crashPoint: number;
  history: number[];
}

export interface Bet {
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
