import { pool } from './db';
import { JWTPayload, Task, TaskUpdateInput } from './types';

export async function listTasksForUser(user: JWTPayload): Promise<Task[]> {
  if ((user.role !== 'Team Member' && user.role !== 'Manager') || !process.env.DATABASE_URL) return [];

  const result = await pool.query<Task>(
    `SELECT id,
            project_id AS "projectId",
            assigned_to AS "assignedTo",
            title,
            due_date::text AS "dueDate",
            status,
            progress
     FROM tasks
     WHERE ($1::boolean OR assigned_to = $2)
     ORDER BY due_date ASC NULLS LAST, id`,
    [user.role === 'Manager', user.id]
  );
  return result.rows;
}

export async function updateTaskForUser(
  id: number,
  input: TaskUpdateInput,
  user: JWTPayload
): Promise<Task | null> {
  if (user.role !== 'Team Member' || !process.env.DATABASE_URL) return null;

  const result = await pool.query<Task>(
    `UPDATE tasks
     SET status = $1, progress = $2
     WHERE id = $3 AND assigned_to = $4
     RETURNING id,
               project_id AS "projectId",
               assigned_to AS "assignedTo",
               title,
               due_date::text AS "dueDate",
               status,
               progress`,
    [input.status, input.progress, id, user.id]
  );
  return result.rows[0] || null;
}
