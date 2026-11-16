import { pool } from './db';
import { JWTPayload, Task, TaskInput, TaskUpdateInput } from './types';

let nextTaskId = 1;
let memoryTasks: Task[] = [];

export function deleteMemoryTasksForProject(projectId: number): void {
  memoryTasks = memoryTasks.filter((task) => task.projectId !== projectId);
}

export function renameMemoryTaskProject(projectId: number, projectName: string): void {
  memoryTasks = memoryTasks.map((task) => task.projectId === projectId ? { ...task, projectName } : task);
}

const taskSelect = `
  SELECT
    t.id,
    t.project_id AS "projectId",
    p.name AS "projectName",
    t.assigned_to AS "assignedTo",
    u.name AS "assignedToName",
    t.title,
    t.description,
    t.priority,
    t.due_date::text AS "dueDate",
    t.status,
    t.progress,
    t.progress AS "progressPercentage",
    t.created_by AS "createdBy",
    t.created_at::text AS "createdAt",
    t.updated_at::text AS "updatedAt"
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  JOIN users u ON u.id = t.assigned_to
`;

export async function listTasksByProject(projectId: number, user?: JWTPayload): Promise<Task[]> {
  if (!process.env.DATABASE_URL) {
    return memoryTasks
      .filter((t) => t.projectId === projectId && (!user || user.role === 'Manager' || t.assignedTo === user.id))
      .map((t) => ({ ...t }));
  }
  const isManager = !user || user.role === 'Manager';
  const res = await pool.query<Task>(
    `${taskSelect} WHERE t.project_id = $1 AND ($2::boolean OR t.assigned_to = $3) ORDER BY t.due_date ASC NULLS LAST, t.id ASC`,
    [projectId, isManager, user?.id ?? 0]
  );
  return res.rows;
}

export async function listTasksForUser(user: JWTPayload): Promise<Task[]> {
  if (user.role !== 'Manager' && user.role !== 'Team Member') return [];
  if (!process.env.DATABASE_URL) {
    return memoryTasks
      .filter((t) => user.role === 'Manager' || t.assignedTo === user.id)
      .map((t) => ({ ...t }));
  }
  const res = await pool.query<Task>(
    `${taskSelect} WHERE ($1::boolean OR t.assigned_to = $2) ORDER BY t.due_date ASC NULLS LAST, t.id ASC`,
    [user.role === 'Manager', user.id]
  );
  return res.rows;
}

export async function getTaskById(id: number, user?: JWTPayload): Promise<Task | null> {
  if (!process.env.DATABASE_URL) {
    const found = memoryTasks.find((t) => t.id === id && (!user || user.role === 'Manager' || t.assignedTo === user.id));
    return found ? { ...found } : null;
  }
  const isManager = !user || user.role === 'Manager';
  const res = await pool.query<Task>(
    `${taskSelect} WHERE t.id = $1 AND ($2::boolean OR t.assigned_to = $3)`,
    [id, isManager, user?.id ?? 0]
  );
  return res.rows[0] || null;
}

export async function createTask(input: TaskInput, createdBy: number, assignedToName = 'Mehak Gill', projectName = ''): Promise<Task> {
  if (!process.env.DATABASE_URL) {
    const now = new Date().toISOString();
    const task: Task = {
      ...input,
      id: nextTaskId++,
      assignedToName,
      projectName,
      status: 'Pending',
      progress: 0,
      progressPercentage: 0,
      createdBy,
      createdAt: now,
      updatedAt: now
    };
    memoryTasks.push(task);
    return { ...task };
  }
  const res = await pool.query<{ id: number }>(
    `INSERT INTO tasks (project_id, assigned_to, title, description, priority, due_date, status, progress, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending', 0, $7) RETURNING id`,
    [input.projectId, input.assignedTo, input.title, input.description, input.priority, input.dueDate, createdBy]
  );
  return (await getTaskById(res.rows[0].id))!;
}

export async function updateTask(id: number, input: TaskInput, assignedToName = 'Mehak Gill', projectName?: string): Promise<Task | null> {
  if (!process.env.DATABASE_URL) {
    const idx = memoryTasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    memoryTasks[idx] = {
      ...memoryTasks[idx],
      ...input,
      assignedToName,
      projectName: projectName ?? memoryTasks[idx].projectName,
      updatedAt: new Date().toISOString()
    };
    return { ...memoryTasks[idx] };
  }
  const res = await pool.query(
    `UPDATE tasks SET project_id = $1, assigned_to = $2, title = $3, description = $4, priority = $5, due_date = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7`,
    [input.projectId, input.assignedTo, input.title, input.description, input.priority, input.dueDate, id]
  );
  return res.rowCount ? getTaskById(id) : null;
}

export async function updateTaskForUser(id: number, input: TaskUpdateInput, user: JWTPayload): Promise<Task | null> {
  if (user.role !== 'Team Member') return null;
  if (!process.env.DATABASE_URL) {
    const idx = memoryTasks.findIndex((t) => t.id === id && t.assignedTo === user.id);
    if (idx === -1) return null;
    memoryTasks[idx] = {
      ...memoryTasks[idx],
      status: input.status,
      progress: input.progress,
      progressPercentage: input.progress,
      updatedAt: new Date().toISOString()
    };
    return { ...memoryTasks[idx] };
  }
  const res = await pool.query(
    `UPDATE tasks SET status = $1, progress = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND assigned_to = $4`,
    [input.status, input.progress, id, user.id]
  );
  return res.rowCount ? getTaskById(id, user) : null;
}

export async function deleteTask(id: number): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    const len = memoryTasks.length;
    memoryTasks = memoryTasks.filter((t) => t.id !== id);
    return memoryTasks.length !== len;
  }
  const res = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return (res.rowCount || 0) > 0;
}
