import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getSyncStatus, replayPending } from '../database/sync';

const router = Router();

router.get('/status', authenticate, async (_req: any, res: any) => {
  try {
    res.json(getSyncStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read sync status.' });
  }
});

router.post('/replay', authenticate, authorize(1), async (_req: any, res: any) => {
  try {
    const result = await replayPending(true);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to run sync.' });
  }
});

export default router;
