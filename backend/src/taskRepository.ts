import { pool } from './db';
import { Task, TaskInput } from './types';

let nextTaskId = 1;
let memoryTasks: Task[] = [];

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
    t.created_by AS "createdBy",
    t.created_at::text AS "createdAt",
    t.updated_at::text AS "updatedAt"
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  JOIN users u ON u.id = t.assigned_to
`;

export async function listTasksByProject(projectId: number): Promise<Task[]> {
  if (!process.env.DATABASE_URL) {
    return memoryTasks.filter((t) => t.projectId === projectId).map((t) => ({ ...t }));
  }
  const res = await pool.query<Task>(`${taskSelect} WHERE t.project_id = $1 ORDER BY t.due_date ASC NULLS LAST, t.id ASC`, [projectId]);
  return res.rows;
}

export async function getTaskById(id: number): Promise<Task | null> {
  if (!process.env.DATABASE_URL) {
    const found = memoryTasks.find((t) => t.id === id);
    return found ? { ...found } : null;
  }
  const res = await pool.query<Task>(`${taskSelect} WHERE t.id = $1`, [id]);
  return res.rows[0] || null;
}

export async function createTask(input: TaskInput, createdBy: number, assignedToName = 'Mehak Gill', projectName = ''): Promise<Task> {
  if (!process.env.DATABASE_URL) {
    const now = new Date().toISOString();
    const task: Task = { ...input, id: nextTaskId++, assignedToName, projectName, status: 'To Do', createdBy, createdAt: now, updatedAt: now };
    memoryTasks.push(task);
    return { ...task };
  }
  const res = await pool.query<{ id: number }>(
    `INSERT INTO tasks (project_id, assigned_to, title, description, priority, due_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'To Do', $7) RETURNING id`,
    [input.projectId, input.assignedTo, input.title, input.description, input.priority, input.dueDate, createdBy]
  );
  return (await getTaskById(res.rows[0].id))!;
}

export async function updateTask(id: number, input: TaskInput, assignedToName = 'Mehak Gill'): Promise<Task | null> {
  if (!process.env.DATABASE_URL) {
    const idx = memoryTasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    memoryTasks[idx] = { ...memoryTasks[idx], ...input, assignedToName, updatedAt: new Date().toISOString() };
    return { ...memoryTasks[idx] };
  }
  const res = await pool.query(
    `UPDATE tasks SET project_id = $1, assigned_to = $2, title = $3, description = $4, priority = $5, due_date = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7`,
    [input.projectId, input.assignedTo, input.title, input.description, input.priority, input.dueDate, id]
  );
  return res.rowCount ? getTaskById(id) : null;
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
