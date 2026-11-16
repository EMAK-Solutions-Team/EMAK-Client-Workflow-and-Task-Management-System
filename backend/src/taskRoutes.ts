import { Response, Router } from 'express';
import { authenticateJWT, AuthenticatedRequest, authorizeRoles } from './authMiddleware';
import { listTeamMemberUsers } from './db';
import { getProjectForUser } from './projectRepository';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasksForUser,
  updateTask,
  updateTaskForUser
} from './taskRepository';
import { TaskInput, TaskPriority, TaskStatus, TaskUpdateInput } from './types';

export const taskRouter = Router();
export const userRouter = Router();

const priorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
const statuses: TaskStatus[] = ['Pending', 'To Do', 'In Progress', 'Review', 'Completed'];

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

export function parseTaskUpdateInput(body: unknown): TaskUpdateInput | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Task update must be an object.';
  const { status, progress } = body as Record<string, unknown>;
  if (typeof status !== 'string' || !statuses.includes(status as TaskStatus)) {
    return 'Status must be Pending, In Progress, or Completed.';
  }
  if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    return 'Progress must be a whole number between 0 and 100.';
  }
  return { status: status as TaskStatus, progress };
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

taskRouter.get('/', authorizeRoles('Manager', 'Team Member'), async (req: AuthenticatedRequest, res) => {
  try {
    const tasks = await listTasksForUser(req.user!);
    res.json({ success: true, tasks });
  } catch (error) {
    serverError(res, error);
  }
});

taskRouter.get('/:id', authorizeRoles('Manager', 'Team Member'), async (req: AuthenticatedRequest, res) => {
  try {
    const task = await getTaskById(Number(req.params.id), req.user!);
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

taskRouter.patch('/:id', authorizeRoles('Team Member'), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      return void res.status(400).json({ success: false, error: 'A valid task ID is required.' });
    }
    const input = parseTaskUpdateInput(req.body);
    if (typeof input === 'string') return void res.status(400).json({ success: false, error: input });
    const task = await updateTaskForUser(id, input, req.user!);
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
