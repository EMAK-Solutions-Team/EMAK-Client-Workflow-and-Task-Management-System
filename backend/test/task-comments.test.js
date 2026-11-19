const { after, before, beforeEach, mock, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = 'postgres://isolated-task-comments-test';
process.env.JWT_SECRET = 'emak-task-comments-test-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../dist/server');
const { pool } = require('../dist/db');
const { generateToken } = require('../dist/authMiddleware');

const users = {
  1: { name: 'Kasper Luboinski', role: 'Manager' },
  2: { name: 'Mehak Gill', role: 'Team Member' },
  3: { name: 'Emilio Conde', role: 'Client' },
  4: { name: 'Second Member', role: 'Team Member' }
};

const tokenFor = (id, role = users[id].role) => generateToken({
  id,
  role,
  name: users[id]?.name || 'Unknown user',
  email: `user${id}@example.test`
});

let database;
let server;
let baseUrl;

before(async () => {
  database = new PGlite();
  await database.exec(readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  await database.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (4, 'Second Member', 'second@example.test', 'unused', 'Team Member');
    INSERT INTO projects (id, name, client_id, start_date, target_completion_date, created_by)
    VALUES (1, 'Comment project', 3, '2026-11-01', '2026-12-31', 1);
    INSERT INTO tasks (id, project_id, assigned_to, title)
    VALUES (1, 1, 2, 'First member task'), (2, 1, 4, 'Second member task');
  `);
  mock.method(pool, 'query', database.query.bind(database));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await database.query('DELETE FROM task_comments');
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  await database?.close();
  await pool.end();
});

async function request(route, token, method = 'GET', input) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(input === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) })
  });
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  return { status: response.status, body };
}

const commentsRoute = (taskId) => `/api/tasks/${taskId}/comments`;

test('assigned Team Members create persistent comments with author and timestamp', async () => {
  const created = await request(commentsRoute(1), tokenFor(2), 'POST', { comment: '  Initial design is ready.  ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.comment.taskId, 1);
  assert.equal(created.body.comment.authorId, 2);
  assert.equal(created.body.comment.authorName, 'Mehak Gill');
  assert.equal(created.body.comment.comment, 'Initial design is ready.');
  assert.equal(Number.isNaN(Date.parse(created.body.comment.createdAt)), false);

  const loaded = await request(commentsRoute(1), tokenFor(2));
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body.comments, [created.body.comment]);

  const stored = (await database.query(
    'SELECT task_id, author_id, comment_text FROM task_comments WHERE id = $1',
    [created.body.comment.id]
  )).rows[0];
  assert.deepEqual(stored, { task_id: 1, author_id: 2, comment_text: 'Initial design is ready.' });
});

test('Managers can post and read comments for any task in chronological order', async () => {
  const first = await request(commentsRoute(2), tokenFor(4), 'POST', { comment: 'Member update' });
  const second = await request(commentsRoute(2), tokenFor(1), 'POST', { comment: 'Manager response' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const loaded = await request(commentsRoute(2), tokenFor(1));
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body.comments.map(({ authorName, comment }) => ({ authorName, comment })), [
    { authorName: 'Second Member', comment: 'Member update' },
    { authorName: 'Kasper Luboinski', comment: 'Manager response' }
  ]);
});

test('unrelated Team Members cannot read or create comments on another member task', async () => {
  for (const method of ['GET', 'POST']) {
    const result = await request(
      commentsRoute(1),
      tokenFor(4),
      method,
      method === 'POST' ? { comment: 'Unauthorized comment' } : undefined
    );
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'Task not found.');
  }
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM task_comments')).rows[0].count, 0);
});

test('Clients are forbidden and missing or invalid tokens are rejected', async () => {
  for (const [token, expected] of [
    [tokenFor(3), 403],
    [undefined, 401],
    ['invalid-token', 401]
  ]) {
    assert.equal((await request(commentsRoute(1), token)).status, expected);
    assert.equal((await request(commentsRoute(1), token, 'POST', { comment: 'Blocked' })).status, expected);
  }
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM task_comments')).rows[0].count, 0);
});

test('invalid and missing task IDs cannot expose or create comments', async () => {
  for (const id of ['0', '-1', '1.5', 'abc', '2147483648']) {
    assert.equal((await request(commentsRoute(id), tokenFor(1))).status, 400, `id ${id}`);
    assert.equal((await request(commentsRoute(id), tokenFor(1), 'POST', { comment: 'Blocked' })).status, 400, `id ${id}`);
  }
  assert.equal((await request(commentsRoute(999), tokenFor(1))).status, 404);
  assert.equal((await request(commentsRoute(999), tokenFor(1), 'POST', { comment: 'Blocked' })).status, 404);
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM task_comments')).rows[0].count, 0);
});

test('empty, malformed and excessively long comments are rejected without writes', async () => {
  const invalid = [null, [], {}, { comment: '' }, { comment: '   ' }, { comment: 123 }, { comment: 'x'.repeat(2001) }];
  for (const input of invalid) {
    const result = await request(commentsRoute(1), tokenFor(2), 'POST', input);
    assert.equal(result.status, 400, JSON.stringify(input)?.slice(0, 80));
  }
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM task_comments')).rows[0].count, 0);
});

test('comments at the 2000-character limit are accepted', async () => {
  const text = '\u{1F3D7}'.repeat(2000);
  const created = await request(commentsRoute(1), tokenFor(2), 'POST', { comment: text });
  assert.equal(created.status, 201);
  assert.equal(Array.from(created.body.comment.comment).length, 2000);
});

test('deleting a task also deletes its stored comments', async () => {
  const inserted = await database.query(
    `INSERT INTO tasks (id, project_id, assigned_to, title)
     VALUES (10, 1, 2, 'Temporary comment task') RETURNING id`
  );
  const taskId = inserted.rows[0].id;
  assert.equal((await request(commentsRoute(taskId), tokenFor(2), 'POST', { comment: 'Remove with task' })).status, 201);

  const deleted = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenFor(1)}` }
  });
  assert.equal(deleted.status, 204);
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM task_comments WHERE task_id = $1', [taskId])).rows[0].count, 0);
});
