import { Router } from 'express';
import { authenticateJWT, AuthenticatedRequest, authorizeRoles } from './authMiddleware';
import { listTasksForUser } from './taskRepository';

export const taskRouter = Router();

taskRouter.use(authenticateJWT, authorizeRoles('Team Member'));

taskRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const tasks = await listTasksForUser(req.user!);
    res.json({ success: true, tasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Unable to load tasks.' });
  }
});
