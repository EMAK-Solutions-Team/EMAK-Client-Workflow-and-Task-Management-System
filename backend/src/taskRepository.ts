import { pool } from './db';
import { JWTPayload, Task } from './types';

export async function listTasksForUser(user: JWTPayload): Promise<Task[]> {
  if (user.role !== 'Team Member' || !process.env.DATABASE_URL) return [];

  const result = await pool.query<Task>(
    `SELECT id,
            project_id AS "projectId",
            assigned_to AS "assignedTo",
            title,
            due_date::text AS "dueDate",
            status,
            progress
     FROM tasks
     WHERE assigned_to = $1
     ORDER BY due_date ASC NULLS LAST, id`,
    [user.id]
  );
  return result.rows;
}
