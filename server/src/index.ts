import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectWithRetry } from './db';

// Route modules
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import feedbackRoutes from './routes/feedback';
import notificationRoutes from './routes/notifications';
import planRoutes from './routes/plans';
import healthRoutes from './routes/health';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Bind to 0.0.0.0 in production (Render), 127.0.0.1 in development
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
}));
app.use(express.json({ limit: '10mb' })); // Allow large payloads for screenshots

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/plans', planRoutes);
app.use('/api', planRoutes);          // mounts /api/projects/:id/plan-status & /api/projects/:id/usage
app.use('/health', healthRoutes);

// Start server
const startServer = async () => {
    await connectWithRetry();
    app.listen(PORT as number, HOST, () => {
        console.log(`Server is running on http://${HOST}:${PORT}`);
    });
};

startServer();
