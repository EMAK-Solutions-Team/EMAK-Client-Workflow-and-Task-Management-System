import { pool } from './db';
import { JWTPayload, TaskComment } from './types';

let nextCommentId = 1;
let memoryComments: TaskComment[] = [];

const commentSelect = `
  SELECT
    c.id,
    c.task_id AS "taskId",
    c.author_id AS "authorId",
    u.name AS "authorName",
    c.comment_text AS comment,
    c.created_at::text AS "createdAt"
  FROM task_comments c
  JOIN users u ON u.id = c.author_id
`;

export function deleteMemoryCommentsForTask(taskId: number): void {
  memoryComments = memoryComments.filter((comment) => comment.taskId !== taskId);
}

export function deleteMemoryCommentsForTasks(taskIds: number[]): void {
  const deletedIds = new Set(taskIds);
  memoryComments = memoryComments.filter((comment) => !deletedIds.has(comment.taskId));
}

export async function listTaskComments(taskId: number): Promise<TaskComment[]> {
  if (!process.env.DATABASE_URL) {
    return memoryComments
      .filter((comment) => comment.taskId === taskId)
      .map((comment) => ({ ...comment }));
  }

  const result = await pool.query<TaskComment>(
    `${commentSelect} WHERE c.task_id = $1 ORDER BY c.created_at ASC, c.id ASC`,
    [taskId]
  );
  return result.rows;
}

export async function createTaskComment(
  taskId: number,
  author: JWTPayload,
  comment: string
): Promise<TaskComment> {
  if (!process.env.DATABASE_URL) {
    const saved: TaskComment = {
      id: nextCommentId++,
      taskId,
      authorId: author.id,
      authorName: author.name,
      comment,
      createdAt: new Date().toISOString()
    };
    memoryComments.push(saved);
    return { ...saved };
  }

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO task_comments (task_id, author_id, comment_text)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [taskId, author.id, comment]
  );
  const result = await pool.query<TaskComment>(
    `${commentSelect} WHERE c.id = $1`,
    [inserted.rows[0].id]
  );
  return result.rows[0];
}
