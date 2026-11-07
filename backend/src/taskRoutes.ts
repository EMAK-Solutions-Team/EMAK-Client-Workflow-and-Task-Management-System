import { Router } from 'express';
import { authenticateJWT, AuthenticatedRequest, authorizeRoles } from './authMiddleware';
import { listTasksForUser, updateTaskForUser } from './taskRepository';
import { parseTaskUpdateInput } from './taskValidation';

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

taskRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      res.status(400).json({ success: false, error: 'A valid task ID is required.' });
      return;
    }

    const input = parseTaskUpdateInput(req.body);
    if (typeof input === 'string') {
      res.status(400).json({ success: false, error: input });
      return;
    }

    const task = await updateTaskForUser(id, input, req.user!);
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found.' });
      return;
    }
    res.json({ success: true, task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Unable to update the task.' });
  }
});
