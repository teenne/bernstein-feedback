import { Router } from 'express';
import { query } from '../db';

const router = Router();

router.get('/', async (_req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

export default router;
