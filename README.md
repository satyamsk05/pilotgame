# Pilot Game

Pilot Game is a futuristic, high-stakes Web3 betting game where players experience the thrill of a flight launch. Bet ETH, watch the multiplier rise, and cash out before the jet crashes!

## Features

- **Real-time Gameplay**: Powered by Socket.io for low-latency multiplier updates and game state.
- **Web3 Integration**: Seamless wallet connection using wagmi and viem on Base Sepolia.
- **Dynamic UI**: Stunning visuals with Framer Motion, tailored for both mobile and desktop.
- **Live Betting**: See other players' bets and cash-outs in real-time.
- **Personal Mission Logs**: Track your betting history and performance.
- **Smart Contract Vault**: Securely deposit and withdraw ETH for gaming.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion, Wagmi, Viem.
- **Backend**: Node.js, Express, Socket.io.
- **Blockchain**: Base Sepolia, Solidity (Hardhat).

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- MetaMask or any Web3 wallet (connected to Base Sepolia)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/satyamsk05/pilotgame.git
   cd pilotgame
   ```

2. **Install Client Dependencies:**
   ```bash
   cd client
   npm install
   ```

3. **Install Server Dependencies:**
   ```bash
   cd ../server
   npm install
   ```

### Running the Application

1. **Start the Server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Start the Client:**
   ```bash
   cd ../client
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

## Deployment

The application is configured for deployment on Vercel (Frontend) and Render/Vercel (Backend).

## License

MIT
