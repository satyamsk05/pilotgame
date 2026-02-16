import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { GameEngine } from './gameEngine.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const gameEngine = new GameEngine(io);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('place-bet', (data) => {
        const result = gameEngine.placeBet({
            userId: socket.id,
            username: data.username || `User_${socket.id.substring(0, 4)}`,
            amount: data.amount,
            walletAddress: data.address || "",
            autoCashOut: data.autoCashOut,
            timestamp: Date.now()
        });
        socket.emit('bet-result', result);
    });

    socket.on('cash-out', async () => {
        const result = await gameEngine.cashOut(socket.id);
        socket.emit('cash-out-result', result);
    });

    socket.on('cancel-bet', () => {
        const result = gameEngine.cancelBet(socket.id);
        socket.emit('cancel-bet-result', result);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
