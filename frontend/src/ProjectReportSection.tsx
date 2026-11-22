import { FormEvent, useEffect, useState } from 'react';
import { getProjectReportRequest, listProjectsRequest } from './api';
import { useAuth } from './auth';
import { Project, ProjectReport } from './types';

function formatReportText(report: ProjectReport): string {
  const { project, summary, milestones, upcomingDeadlines, tasks, activity } = report;
  const lines = [
    `PROJECT STATUS REPORT: ${project.name}`,
    `Client: ${project.clientName}`,
    `Dates: ${project.startDate} to ${project.targetCompletionDate}`,
    `Status: ${project.status}`,
    '',
    'TASK SUMMARY',
    `Total tasks: ${summary.totalTasks}`,
    `Completed tasks: ${summary.completedTasks}`,
    `Pending tasks: ${summary.pendingTasks}`,
    `Overdue tasks: ${summary.overdueTasks}`,
    `Completion rate: ${summary.completionPercentage}%`,
    `Average progress: ${summary.averageProgress}%`,
    '',
    'MILESTONES',
    ...(milestones.length
      ? milestones.map((m) => `- ${m.title}${m.dueDate ? ` (Due: ${m.dueDate})` : ''} [${m.status}]`)
      : ['None']),
    '',
    'UPCOMING DEADLINES',
    ...(upcomingDeadlines.length
      ? upcomingDeadlines.map((d) => `- [${d.type}] ${d.title} - ${d.dueDate}`)
      : ['None']),
    '',
    'TASKS',
    ...(tasks.length
      ? tasks.map((t) => `- ${t.title} | ${t.status} (${t.progress}%) | Priority: ${t.priority} | Due: ${t.dueDate || 'No due date'}`)
      : ['No tasks']),
    '',
    'PROJECT ACTIVITY',
    ...(activity.length
      ? activity.map((a) => `- [${a.createdAt}] ${a.action} by ${a.changedByName || 'Manager'}: ${a.details}`)
      : ['No activity recorded'])
  ];
  return lines.join('\n');
}

export default function ProjectReportSection({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(0);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || user?.role !== 'Manager') return;
    listProjectsRequest(token)
      .then((list) => {
        setProjects(list);
        setSelectedProjectId((current) => (list.some((p) => p.id === current) ? current : list[0]?.id || 0));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load projects.'));
  }, [token, user?.role, refreshVersion]);

  async function handleGenerateReport(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedProjectId) return;
    setLoading(true);
    setError('');
    try {
      setReport(await getProjectReportRequest(token, selectedProjectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate project report.');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!report) return;
    const blob = new Blob([formatReportText(report)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-report-${report.project.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (user?.role !== 'Manager') return null;

  return (
    <section className="projects" aria-labelledby="project-reports-heading">
      <h2 id="project-reports-heading">Project Status Reports</h2>
      {error && <p className="error" role="alert">{error}</p>}

      <form className="project-form" onSubmit={handleGenerateReport}>
        <h3>Generate Report</h3>
        <label htmlFor="report-project">Select project</label>
        <select
          id="report-project"
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(Number(event.target.value))}
          required
        >
          <option value={0}>Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <div className="actions">
          <button type="submit" disabled={loading || !selectedProjectId}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          {report && (
            <>
              <button type="button" onClick={() => window.print()}>Print Report</button>
              <button type="button" onClick={handleDownload}>Download Report</button>
            </>
          )}
        </div>
      </form>

      {report && (
        <article className="project-card">
          <h3>{report.project.name} — Status Report</h3>
          <p><strong>Client:</strong> {report.project.clientName}</p>
          <p><strong>Dates:</strong> {report.project.startDate} to {report.project.targetCompletionDate}</p>
          <p><strong>Status:</strong> {report.project.status}</p>

          <h4>Task Summary & Completion Rate</h4>
          <p><strong>Completion Rate:</strong> {report.summary.completionPercentage}% ({report.summary.completedTasks} of {report.summary.totalTasks} completed)</p>
          <p><strong>Average Task Progress:</strong> {report.summary.averageProgress}%</p>
          <p><strong>Pending Tasks:</strong> {report.summary.pendingTasks} | <strong>Overdue Tasks:</strong> {report.summary.overdueTasks}</p>

          <h4>Milestones</h4>
          {report.milestones.length ? (
            <ul>
              {report.milestones.map((milestone) => (
                <li key={milestone.id}>
                  {milestone.title}{milestone.dueDate ? ` - ${milestone.dueDate}` : ''} ({milestone.status})
                </li>
              ))}
            </ul>
          ) : <p>None</p>}

          <h4>Upcoming Deadlines</h4>
          {report.upcomingDeadlines.length ? (
            <ul>
              {report.upcomingDeadlines.map((deadline) => (
                <li key={`${deadline.type}-${deadline.id}`}>
                  <strong>{deadline.type}:</strong> {deadline.title} — {deadline.dueDate}
                </li>
              ))}
            </ul>
          ) : <p>None</p>}

          <h4>Project Activity</h4>
          {report.activity.length ? (
            <ul>
              {report.activity.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong> by {entry.changedByName || 'Manager'} ({entry.createdAt}): {entry.details}
                </li>
              ))}
            </ul>
          ) : <p>No activity recorded.</p>}
        </article>
      )}
    </section>
  );
}
