import { Project, ProjectReport, Task, TaskStatus } from './types';

export function buildProjectReport(project: Project, tasks: Task[], now = new Date()): ProjectReport {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const tasksByStatus: Record<TaskStatus, number> = {
    Pending: 0,
    'To Do': 0,
    'In Progress': 0,
    Review: 0,
    Completed: 0
  };
  let totalProgress = 0;
  let overdueTasks = 0;

  for (const task of tasks) {
    tasksByStatus[task.status]++;
    totalProgress += task.progress;
    if (task.status !== 'Completed' && task.dueDate !== null && task.dueDate < today) {
      overdueTasks++;
    }
  }

  return {
    project,
    tasks,
    summary: {
      totalTasks: tasks.length,
      completedTasks: tasksByStatus.Completed,
      completionPercentage: tasks.length === 0 ? 0 : Math.round(tasksByStatus.Completed / tasks.length * 10000) / 100,
      pendingTasks: tasks.length - tasksByStatus.Completed,
      overdueTasks,
      averageProgress: tasks.length === 0 ? 0 : Math.round(totalProgress / tasks.length * 100) / 100,
      tasksByStatus
    }
  };
}
