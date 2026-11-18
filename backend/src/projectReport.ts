import { Project, ProjectReport, Task, TaskStatus } from './types';

export function buildProjectReport(project: Project, tasks: Task[]): ProjectReport {
  const tasksByStatus: Record<TaskStatus, number> = {
    Pending: 0,
    'To Do': 0,
    'In Progress': 0,
    Review: 0,
    Completed: 0
  };
  let totalProgress = 0;

  for (const task of tasks) {
    tasksByStatus[task.status]++;
    totalProgress += task.progress;
  }

  return {
    project,
    tasks,
    summary: {
      totalTasks: tasks.length,
      completedTasks: tasksByStatus.Completed,
      averageProgress: tasks.length === 0 ? 0 : Math.round(totalProgress / tasks.length * 100) / 100,
      tasksByStatus
    }
  };
}
