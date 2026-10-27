import { Response, Router } from 'express';
import { authenticateJWT, AuthenticatedRequest, authorizeRoles } from './authMiddleware';
import { listClientUsers } from './db';
import {
  createProject,
  deleteProject,
  getProjectForUser,
  listProjectsForUser,
  updateProject
} from './projectRepository';
import { MilestoneInput, ProjectInput, ProjectStatus } from './types';

export const projectRouter = Router();
const statuses: ProjectStatus[] = ['Planning', 'Active', 'On Hold', 'Completed'];

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseProjectInput(body: Record<string, unknown>): ProjectInput | string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const clientId = Number(body.clientId);
  const startDate = body.startDate;
  const targetCompletionDate = body.targetCompletionDate;
  const status = body.status;

  if (!name) return 'Project name is required.';
  if (!Number.isInteger(clientId) || clientId <= 0) return 'A valid client is required.';
  if (!validDate(startDate) || !validDate(targetCompletionDate)) return 'Valid start and completion dates are required.';
  if (targetCompletionDate < startDate) return 'Target completion must be on or after the start date.';
  if (typeof status !== 'string' || !statuses.includes(status as ProjectStatus)) return 'A valid project status is required.';

  const milestonesValue = body.milestones === undefined ? [] : body.milestones;
  if (!Array.isArray(milestonesValue)) return 'Milestones must be an array.';

  const milestones: MilestoneInput[] = [];
  for (const value of milestonesValue) {
    if (!value || typeof value !== 'object') return 'Each milestone must include a title.';
    const item = value as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const dueDate = item.dueDate === '' || item.dueDate === null || item.dueDate === undefined
      ? null
      : item.dueDate;
    if (!title) return 'Each milestone must include a title.';
    if (dueDate !== null && !validDate(dueDate)) return 'Milestone due dates must be valid dates.';
    milestones.push({ title, dueDate });
  }

  return {
    name,
    clientId,
    startDate,
    targetCompletionDate,
    status: status as ProjectStatus,
    milestones
  };
}

function serverError(res: Response, error: unknown) {
  console.error(error);
  res.status(500).json({ success: false, error: 'Unable to complete the project request.' });
}

projectRouter.use(authenticateJWT);

projectRouter.get('/clients', authorizeRoles('Manager'), async (_req, res) => {
  try {
    res.json({ success: true, clients: await listClientUsers() });
  } catch (error) {
    serverError(res, error);
  }
});

projectRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    res.json({ success: true, projects: await listProjectsForUser(req.user!) });
  } catch (error) {
    serverError(res, error);
  }
});

projectRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const project = await getProjectForUser(Number(req.params.id), req.user!);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found.' });
      return;
    }
    res.json({ success: true, project });
  } catch (error) {
    serverError(res, error);
  }
});

projectRouter.post('/', authorizeRoles('Manager'), async (req: AuthenticatedRequest, res) => {
  try {
    const input = parseProjectInput(req.body);
    if (typeof input === 'string') {
      res.status(400).json({ success: false, error: input });
      return;
    }

    const clients = await listClientUsers();
    if (!clients.some((client) => client.id === input.clientId)) {
      res.status(400).json({ success: false, error: 'The selected client does not exist.' });
      return;
    }

    const project = await createProject(input, req.user!.id);
    res.status(201).json({ success: true, project });
  } catch (error) {
    serverError(res, error);
  }
});

projectRouter.put('/:id', authorizeRoles('Manager'), async (req: AuthenticatedRequest, res) => {
  try {
    const input = parseProjectInput(req.body);
    if (typeof input === 'string') {
      res.status(400).json({ success: false, error: input });
      return;
    }

    const clients = await listClientUsers();
    if (!clients.some((client) => client.id === input.clientId)) {
      res.status(400).json({ success: false, error: 'The selected client does not exist.' });
      return;
    }

    const project = await updateProject(Number(req.params.id), input);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found.' });
      return;
    }
    res.json({ success: true, project });
  } catch (error) {
    serverError(res, error);
  }
});

projectRouter.delete('/:id', authorizeRoles('Manager'), async (req, res) => {
  try {
    const deleted = await deleteProject(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Project not found.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    serverError(res, error);
  }
});
