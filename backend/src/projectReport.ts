import { Project, ProjectActivity, ProjectDeadline, ProjectReport, Task, TaskStatus } from './types';

export function buildProjectReport(
  project: Project,
  tasks: Task[],
  now = new Date(),
  activity: ProjectActivity[] = []
): ProjectReport {
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
  const upcomingDeadlines: ProjectDeadline[] = [];
  let totalProgress = 0;
  let overdueTasks = 0;

  for (const task of tasks) {
    tasksByStatus[task.status]++;
    totalProgress += task.progress;
    if (task.status !== 'Completed' && task.dueDate !== null) {
      if (task.dueDate < today) {
        overdueTasks++;
      } else {
        upcomingDeadlines.push({ type: 'Task', id: task.id, title: task.title, dueDate: task.dueDate });
      }
    }
  }

  for (const milestone of project.milestones) {
    if (milestone.status !== 'Completed' && milestone.dueDate !== null && milestone.dueDate >= today) {
      upcomingDeadlines.push({ type: 'Milestone', id: milestone.id, title: milestone.title, dueDate: milestone.dueDate });
    }
  }

  if (project.status !== 'Completed' && project.targetCompletionDate >= today) {
    upcomingDeadlines.push({ type: 'Project', id: project.id, title: project.name, dueDate: project.targetCompletionDate });
  }
  upcomingDeadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.type.localeCompare(b.type) || a.id - b.id);

  return {
    project,
    tasks,
    milestones: project.milestones,
    upcomingDeadlines,
    activity,
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
