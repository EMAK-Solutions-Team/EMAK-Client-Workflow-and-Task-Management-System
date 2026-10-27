import { FormEvent, useEffect, useState } from 'react';
import {
  createProjectRequest,
  deleteProjectRequest,
  listClientsRequest,
  listProjectsRequest,
  updateProjectRequest
} from './api';
import { useAuth } from './auth';
import { ClientSummary, MilestoneInput, Project, ProjectInput, ProjectStatus } from './types';

const emptyForm: ProjectInput = {
  name: '',
  clientId: 0,
  startDate: '',
  targetCompletionDate: '',
  status: 'Planning',
  milestones: []
};

export default function ProjectsSection() {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [form, setForm] = useState<ProjectInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadProjects() {
    if (!token) return;
    try {
      setProjects(await listProjectsRequest(token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
    if (token && user?.role === 'Manager') {
      listClientsRequest(token)
        .then((values) => {
          setClients(values);
          setForm((current) => ({
            ...current,
            clientId: current.clientId || values[0]?.id || 0
          }));
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load clients.'));
    }
  }, [token, user?.role]);

  function addMilestone() {
    const title = milestoneTitle.trim();
    if (!title) return;
    const milestone: MilestoneInput = { title, dueDate: milestoneDate || null };
    setForm((current) => ({ ...current, milestones: [...current.milestones, milestone] }));
    setMilestoneTitle('');
    setMilestoneDate('');
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, clientId: clients[0]?.id || 0 });
    setMilestoneTitle('');
    setMilestoneDate('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError('');
    try {
      if (editingId) {
        await updateProjectRequest(token, editingId, form);
      } else {
        await createProjectRequest(token, form);
      }
      resetForm();
      await loadProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the project.');
    }
  }

  function editProject(project: Project) {
    setEditingId(project.id);
    setForm({
      name: project.name,
      clientId: project.clientId,
      startDate: project.startDate,
      targetCompletionDate: project.targetCompletionDate,
      status: project.status,
      milestones: project.milestones.map(({ title, dueDate }) => ({ title, dueDate }))
    });
  }

  async function removeProject(id: number) {
    if (!token || !window.confirm('Delete this project?')) return;
    try {
      await deleteProjectRequest(token, id);
      await loadProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the project.');
    }
  }

  return (
    <section className="projects">
      <h2>Projects</h2>
      {error && <p className="error">{error}</p>}

      {user?.role === 'Manager' && (
        <form className="project-form" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Project' : 'Create Project'}</h3>
          <label htmlFor="project-name">Project name</label>
          <input
            id="project-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />

          <label htmlFor="project-client">Client</label>
          <select
            id="project-client"
            value={form.clientId}
            onChange={(event) => setForm({ ...form, clientId: Number(event.target.value) })}
            required
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name} ({client.email})</option>
            ))}
          </select>

          <div className="form-row">
            <label>
              Start date
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                required
              />
            </label>
            <label>
              Target completion
              <input
                type="date"
                value={form.targetCompletionDate}
                onChange={(event) => setForm({ ...form, targetCompletionDate: event.target.value })}
                required
              />
            </label>
          </div>

          <label htmlFor="project-status">Status</label>
          <select
            id="project-status"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}
          >
            <option>Planning</option>
            <option>Active</option>
            <option>On Hold</option>
            <option>Completed</option>
          </select>

          <h4>Milestones</h4>
          <div className="form-row milestone-entry">
            <input
              aria-label="Milestone title"
              placeholder="Milestone title"
              value={milestoneTitle}
              onChange={(event) => setMilestoneTitle(event.target.value)}
            />
            <input
              aria-label="Milestone due date"
              type="date"
              value={milestoneDate}
              onChange={(event) => setMilestoneDate(event.target.value)}
            />
            <button type="button" onClick={addMilestone}>Add</button>
          </div>
          <ul>
            {form.milestones.map((milestone, index) => (
              <li key={`${milestone.title}-${index}`}>
                {milestone.title}{milestone.dueDate ? ` - ${milestone.dueDate}` : ''}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setForm({
                    ...form,
                    milestones: form.milestones.filter((_, itemIndex) => itemIndex !== index)
                  })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="actions">
            <button type="submit">{editingId ? 'Save changes' : 'Create project'}</button>
            {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      )}

      {loading ? (
        <p>Loading projects...</p>
      ) : projects.length === 0 ? (
        <p>No projects are available.</p>
      ) : (
        <div className="project-list">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <h3>{project.name}</h3>
              <p><strong>Client:</strong> {project.clientName}</p>
              <p><strong>Dates:</strong> {project.startDate} to {project.targetCompletionDate}</p>
              <p><strong>Status:</strong> {project.status}</p>
              <h4>Milestones</h4>
              {project.milestones.length ? (
                <ul>
                  {project.milestones.map((milestone) => (
                    <li key={milestone.id}>
                      {milestone.title}{milestone.dueDate ? ` - ${milestone.dueDate}` : ''}
                    </li>
                  ))}
                </ul>
              ) : <p>None</p>}
              {user?.role === 'Manager' && (
                <div className="actions">
                  <button type="button" onClick={() => editProject(project)}>Edit</button>
                  <button type="button" onClick={() => removeProject(project.id)}>Delete</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
