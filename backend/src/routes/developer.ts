import { Router, Response } from 'express';
import { prepare } from '../database/schema';
import { authenticate, authorizeAdminOrDev, AuthRequest } from '../middleware/auth';
import { listPublicTables, truncateTables } from '../utils/dbAdmin';
import { resetMirrorAndQueue } from '../database/sync';

const router = Router();

// Clean all data except admin users - DANGER OPERATION
router.delete('/clean-all-data', authenticate, authorizeAdminOrDev, async (req: AuthRequest, res: Response) => {
  try {
    // Delete everything except the users/profiles of admins
    const adminProfiles = await prepare('SELECT p.user_id FROM profiles p WHERE p.access_level = 1 OR p.role = ?').all('admin') as any[];
    if (adminProfiles.length === 0) {
      return res.status(400).json({ error: 'No admin user found. Cannot clean data.' });
    }
    const adminIds = adminProfiles.map((r: any) => r.user_id);
    const ph = adminIds.map(() => '?').join(', ');

    const tables = await listPublicTables();
    const protectedTables = new Set(['users', 'profiles']);
    await truncateTables(tables.filter((t) => !protectedTables.has(t.toLowerCase())));

    await prepare(`DELETE FROM profiles WHERE user_id NOT IN (${ph})`).run(...adminIds);
    await prepare(`DELETE FROM users WHERE id NOT IN (${ph})`).run(...adminIds);
    await resetMirrorAndQueue();

    // Log this action
    try {
      await prepare(`INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)`)
        .run(req.user!.profile_id, 'clean_all_data', 'system', 'Cleaned all data except admin users');
    } catch (logError) {
      console.error('Error logging cleanup action:', logError);
    }

    res.json({ success: true, message: 'All data cleaned successfully. Only admin users preserved.' });
  } catch (err: any) {
    console.error('Clean all data error:', err);
    res.status(500).json({ error: 'Failed to clean all data.' });
  }
});

export default router;
