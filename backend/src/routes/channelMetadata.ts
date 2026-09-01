import { Router, Response } from 'express';
import { prepare } from '../database/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitEvent } from '../socket';

const router = Router();

router.get('/', async (_req: AuthRequest, res: Response) => {
  const row = await prepare('SELECT * FROM channel_metadata WHERE id = 1').get();
  if (!row) return res.json({ channel_name: '', channel_display_name: '', website_url: '', editor_name: '', editor_position: '', subscribe_url: '' });
  res.json(row);
});

router.put('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || (!req.user.is_dev && req.user.access_level !== 1)) return res.status(403).json({ error: 'Admin only' });
  const { channel_name, channel_display_name, website_url, editor_name, editor_position, subscribe_url } = req.body;
  await prepare(`UPDATE channel_metadata SET channel_name = ?, channel_display_name = ?, website_url = ?, editor_name = ?, editor_position = ?, subscribe_url = ?, updated_at = datetime('now') WHERE id = 1`)
    .run(channel_name || '', channel_display_name || '', website_url || '', editor_name || '', editor_position || '', subscribe_url || '');
  const row = await prepare('SELECT * FROM channel_metadata WHERE id = 1').get();
  emitEvent('channel:updated', { channel_name: row?.channel_name || '', actor: req.user!.profile_id });
  res.json(row);
});

export default router;
