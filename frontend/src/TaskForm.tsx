
import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  Project,
  TaskInput,
  TaskPriority,
  TeamMemberSummary
} from './types';

interface TaskFormProps {
  projects: Project[];
  teamMembers: TeamMemberSummary[];
  onTaskCreated: (input: TaskInput) => Promise<void>;
  onCancel?: () => void;
}

export function TaskForm({
  projects,
  teamMembers,
  onTaskCreated,
  onCancel
}: TaskFormProps) {
  const [projectId, setProjectId] = useState(0);
  const [assignedTo, setAssignedTo] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!projectId || !assignedTo || !title.trim() || !dueDate) {
      setError('Please complete all required fields.');
      return;
    }

    try {
      setLoading(true);

      await onTaskCreated({
        projectId,
        assignedTo,
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate
      });

      setTitle('');
      setDescription('');
      setPriority('Medium');
      setDueDate('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to create task.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <h3>Create New Task</h3>

      {error && <p className="error">{error}</p>}

      <label htmlFor="task-project">Project</label>
      <select
        id="task-project"
        value={projectId}
        onChange={(e) => setProjectId(Number(e.target.value))}
        required
      >
        <option value={0}>Select project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <label htmlFor="task-member">Assign Team Member</label>
      <select
        id="task-member"
        value={assignedTo}
        onChange={(e) => setAssignedTo(Number(e.target.value))}
        required
      >
        <option value={0}>Select team member</option>
        {teamMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>

      <label htmlFor="task-title">Task Title</label>
      <input
        id="task-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <label htmlFor="task-description">Description</label>
      <textarea
        id="task-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />

      <label htmlFor="task-priority">Priority</label>
      <select
        id="task-priority"
        value={priority}
        onChange={(e) =>
          setPriority(e.target.value as TaskPriority)
        }
      >
        <option value="Low">Low</option>
        <option value="Medium">Medium</option>
        <option value="High">High</option>
        <option value="Urgent">Urgent</option>
      </select>

      <label htmlFor="task-due-date">Due Date</label>
      <input
        id="task-due-date"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        required
      />

      <div className="actions">
        <button
          type="submit"
          disabled={loading || !projects.length || !teamMembers.length}
        >
          {loading ? 'Creating...' : 'Create Task'}
        </button>

        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
