import { Router, Response } from 'express';
import { ROLES } from '../config/roles';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, (_req: AuthRequest, res: Response) => {
  res.json(ROLES);
});

export default router;
