import { useEffect, useState } from 'react';
import { listTasksRequest } from './api';
import { useAuth } from './auth';
import TaskCard from './TaskCard';
import { Task } from './types';

export default function TasksSection() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    setTasks([]);
    listTasksRequest(token)
      .then((values) => {
        if (active) setTasks(values);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load tasks.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  return (
    <section className="projects" aria-labelledby="assigned-tasks-heading">
      <h2 id="assigned-tasks-heading">My assigned tasks</h2>
      {loading ? (
        <p role="status">Loading tasks...</p>
      ) : error ? (
        <p className="error" role="alert">{error}</p>
      ) : tasks.length === 0 ? (
        <p>No tasks are assigned to you.</p>
      ) : (
        <div className="project-list">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onSaved={(updated) => {
              setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
            }} />
          ))}
        </div>
      )}
    </section>
  );
}
