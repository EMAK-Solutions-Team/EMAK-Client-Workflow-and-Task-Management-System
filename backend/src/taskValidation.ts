import { TaskUpdateInput } from './types';

export function parseTaskUpdateInput(body: unknown): TaskUpdateInput | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Task update must be an object.';
  }

  const { status, progress } = body as Record<string, unknown>;
  if (status !== 'Pending' && status !== 'In Progress' && status !== 'Completed') {
    return 'Status must be Pending, In Progress, or Completed.';
  }
  if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    return 'Progress must be a whole number between 0 and 100.';
  }

  return { status, progress };
}
