import { FormEvent, useEffect, useRef, useState } from 'react';
import { updateTaskRequest } from './api';
import { useAuth } from './auth';
import { Task } from './types';

export default function TaskCard({ task, onSaved }: { task: Task; onSaved: (task: Task) => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState(task.status);
  const [progress, setProgress] = useState(String(task.progress));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function clearFeedback() {
    setError('');
    setSaved(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!token || saving) return;
    clearFeedback();
    const percentage = Number(progress);
    if (progress.trim() === '' || !Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      setError('Progress must be a whole number between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTaskRequest(token, task.id, { status, progress: percentage });
      if (!active.current) return;
      onSaved(updated);
      setStatus(updated.status);
      setProgress(String(updated.progress));
      setSaved(true);
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Unable to save task.');
    } finally {
      if (active.current) setSaving(false);
    }
  }

  return (
    <article className="project-card">
      <h3>{task.title}</h3>
      <p><strong>Due:</strong> {task.dueDate
        ? <time dateTime={task.dueDate}>{task.dueDate}</time>
        : 'No due date'}</p>
      <form onSubmit={save} aria-label={`Update ${task.title}`}>
        <div className="form-row">
          <label>
            Status
            <select value={status} disabled={saving} onChange={(event) => {
              setStatus(event.target.value as Task['status']);
              clearFeedback();
            }}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </label>
          <label>
            Progress (%)
            <input type="number" min="0" max="100" step="1" required
              value={progress} disabled={saving} onChange={(event) => {
                setProgress(event.target.value);
                clearFeedback();
              }} />
          </label>
        </div>
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p role="status">Saved.</p>}
      </form>
    </article>
  );
}
