import { Response, Router } from 'express';
import { authenticateJWT, AuthenticatedRequest, authorizeRoles } from './authMiddleware';
import { listTeamMemberUsers } from './db';
import { getProjectForUser } from './projectRepository';
import { createTask, deleteTask, getTaskById, updateTask } from './taskRepository';
import { TaskInput, TaskPriority } from './types';

export const taskRouter = Router();
export const userRouter = Router();

const priorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function parseTaskInput(body: unknown): TaskInput | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Task payload must be an object.';
  const record = body as Record<string, unknown>;
  const projectId = Number(record.projectId);
  const assignedTo = Number(record.assignedTo);
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const priority = (record.priority === undefined ? 'Medium' : record.priority) as TaskPriority;
  const dueDate = record.dueDate === '' || record.dueDate === null || record.dueDate === undefined ? null : record.dueDate;

  if (!Number.isInteger(projectId) || projectId <= 0) return 'A valid project is required.';
  if (!Number.isInteger(assignedTo) || assignedTo <= 0) return 'A valid team member is required.';
  if (!title) return 'Task title is required.';
  if (typeof priority !== 'string' || !priorities.includes(priority)) return 'Task priority must be Low, Medium, High, or Urgent.';
  if (dueDate !== null && !validDate(dueDate)) return 'Task due date must be a valid YYYY-MM-DD date.';

  return { projectId, assignedTo, title, description, priority, dueDate };
}

function serverError(res: Response, error: unknown) {
  console.error(error);
  res.status(500).json({ success: false, error: 'Unable to complete the task request.' });
}

userRouter.use(authenticateJWT);
userRouter.get('/members', authorizeRoles('Manager'), async (_req, res) => {
  try {
    const members = await listTeamMemberUsers();
    res.json({ success: true, members, users: members });
  } catch (error) {
    serverError(res, error);
  }
});

taskRouter.use(authenticateJWT);

taskRouter.get('/:id', authorizeRoles('Manager', 'Team Member'), async (req, res) => {
  try {
    const task = await getTaskById(Number(req.params.id));
    if (!task) return void res.status(404).json({ success: false, error: 'Task not found.' });
    res.json({ success: true, task });
  } catch (error) {
    serverError(res, error);
  }
});

taskRouter.post('/', authorizeRoles('Manager'), async (req: AuthenticatedRequest, res) => {
  try {
    const input = parseTaskInput(req.body);
    if (typeof input === 'string') return void res.status(400).json({ success: false, error: input });
    const project = await getProjectForUser(input.projectId, req.user!);
    if (!project) return void res.status(400).json({ success: false, error: 'The selected project does not exist.' });
    const assignee = (await listTeamMemberUsers()).find((m) => m.id === input.assignedTo);
    if (!assignee) return void res.status(400).json({ success: false, error: 'The selected team member does not exist.' });

    const task = await createTask(input, req.user!.id, assignee.name, project.name);
    res.status(201).json({ success: true, task });
  } catch (error) {
    serverError(res, error);
  }
});

taskRouter.put('/:id', authorizeRoles('Manager'), async (req: AuthenticatedRequest, res) => {
  try {
    const input = parseTaskInput(req.body);
    if (typeof input === 'string') return void res.status(400).json({ success: false, error: input });
    const project = await getProjectForUser(input.projectId, req.user!);
    if (!project) return void res.status(400).json({ success: false, error: 'The selected project does not exist.' });
    const assignee = (await listTeamMemberUsers()).find((m) => m.id === input.assignedTo);
    if (!assignee) return void res.status(400).json({ success: false, error: 'The selected team member does not exist.' });

    const task = await updateTask(Number(req.params.id), input, assignee.name);
    if (!task) return void res.status(404).json({ success: false, error: 'Task not found.' });
    res.json({ success: true, task });
  } catch (error) {
    serverError(res, error);
  }
});

taskRouter.delete('/:id', authorizeRoles('Manager'), async (req, res) => {
  try {
    const deleted = await deleteTask(Number(req.params.id));
    if (!deleted) return void res.status(404).json({ success: false, error: 'Task not found.' });
    res.status(204).send();
  } catch (error) {
    serverError(res, error);
  }
});
