import { FormEvent, useEffect, useState } from 'react';
import {
  createTaskCommentRequest,
  listTaskCommentsRequest
} from './api';
import { useAuth } from './auth';
import { TaskComment } from './types';

export default function TaskComments({ taskId }: { taskId: number }) {
  const { token } = useAuth();

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      if (!token) {
        setComments([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const result = await listTaskCommentsRequest(token, taskId);

        if (!cancelled) {
          setComments(result);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load comments.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadComments();

    return () => {
      cancelled = true;
    };
  }, [token, taskId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!token || saving) return;

    const text = comment.trim();

    if (!text) {
      setError('Please enter a comment.');
      return;
    }

    if (Array.from(text).length > 2000) {
      setError('Comment must be 2000 characters or fewer.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const newComment = await createTaskCommentRequest(
        token,
        taskId,
        text
      );

      setComments((current) => [...current, newComment]);
      setComment('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to post comment.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="task-comments">
      <h4>Comments</h4>

      {loading ? (
        <p>Loading comments...</p>
      ) : comments.length === 0 ? (
        <p>No comments yet.</p>
      ) : (
        <ul>
          {comments.map((item) => (
            <li key={item.id}>
              <p>
                <strong>{item.authorName}</strong>
                {' - '}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </p>

              <p>{item.comment}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit}>
        <label htmlFor={`comment-${taskId}`}>
          Add a comment
        </label>

        <textarea
          id={`comment-${taskId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Write a comment..."
          rows={3}
          maxLength={2000}
          disabled={saving}
          required
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Posting...' : 'Post Comment'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}