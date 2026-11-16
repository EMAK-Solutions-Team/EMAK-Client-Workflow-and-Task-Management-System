const { after, before, mock, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = 'postgres://isolated-postgres-crud-test';
process.env.JWT_SECRET = 'emak-postgres-crud-test-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../dist/server');
const { pool } = require('../dist/db');
const { generateToken } = require('../dist/authMiddleware');

const tokenFor = (id, role = 'Team Member') => generateToken({ id, role, name: 'Test user', email: `user${id}@example.test` });
const manager = tokenFor(1, 'Manager');
let database;
let server;
let baseUrl;

before(async () => {
  database = new PGlite();
  await database.exec(readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  await database.exec(`INSERT INTO users (id, name, email, password_hash, role)
    VALUES (4, 'Second Member', 'second@example.test', 'unused', 'Team Member')`);
  mock.method(pool, 'query', database.query.bind(database));
  mock.method(pool, 'connect', async () => ({ query: database.query.bind(database), release() {} }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  mock.restoreAll();
  await database?.close();
  await pool.end();
});

async function request(route, token = manager, method = 'GET', input) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) })
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const projectInput = name => ({
  name, clientId: 3, startDate: '2026-11-01', targetCompletionDate: '2026-12-31', status: 'Active',
  milestones: [{ title: 'Concept approval', dueDate: '2026-11-30' }]
});

test('PostgreSQL project and task CRUD preserves assignment, progress, names, activity and cascade deletion', async () => {
  const source = await request('/api/projects', manager, 'POST', projectInput('SQL source project'));
  const destination = await request('/api/projects', manager, 'POST', projectInput('SQL destination project'));
  assert.equal(source.status, 201);
  assert.equal(destination.status, 201);
  assert.equal(source.body.project.milestones.length, 1);
  const sourceId = source.body.project.id;
  const destinationId = destination.body.project.id;
  const input = {
    projectId: sourceId, assignedTo: 2, title: 'SQL task', description: 'Verify PostgreSQL writes',
    priority: 'High', dueDate: '2026-12-01'
  };
  const created = await request('/api/tasks', manager, 'POST', input);
  assert.equal(created.status, 201);
  assert.equal(created.body.task.projectName, 'SQL source project');
  assert.equal(created.body.task.createdBy, 1);
  const taskId = created.body.task.id;

  assert.deepEqual((await request('/api/tasks', tokenFor(2))).body.tasks.map(task => task.id), [taskId]);
  assert.deepEqual((await request('/api/tasks', tokenFor(4))).body.tasks, []);
  assert.equal((await request(`/api/tasks/${taskId}`, tokenFor(4))).status, 404);

  const progressed = await request(`/api/tasks/${taskId}`, tokenFor(2), 'PATCH', { status: 'Review', progress: 90 });
  assert.equal(progressed.status, 200);
  assert.equal(progressed.body.task.progressPercentage, 90);
  const moved = await request(`/api/tasks/${taskId}`, manager, 'PUT', { ...input, projectId: destinationId, assignedTo: 4 });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.projectName, 'SQL destination project');
  assert.equal(moved.body.task.assignedToName, 'Second Member');
  assert.equal(moved.body.task.status, 'Review');
  assert.equal(moved.body.task.progress, 90);
  assert.equal((await request(`/api/tasks/${taskId}`, tokenFor(2), 'PATCH', { status: 'Completed', progress: 100 })).status, 404);
  assert.equal((await request(`/api/tasks/${taskId}`, tokenFor(4), 'PATCH', { status: 'Completed', progress: 100 })).status, 200);

  assert.deepEqual((await request(`/api/projects/${sourceId}/tasks`)).body.tasks, []);
  assert.deepEqual((await request(`/api/projects/${destinationId}/tasks`, tokenFor(4))).body.tasks.map(task => task.id), [taskId]);
  const renamed = await request(`/api/projects/${destinationId}`, manager, 'PUT', projectInput('Renamed SQL project'));
  assert.equal(renamed.status, 200);
  const loaded = await request(`/api/tasks/${taskId}`);
  assert.equal(loaded.body.task.projectName, 'Renamed SQL project');
  assert.equal(loaded.body.task.status, 'Completed');
  assert.equal(loaded.body.task.progress, 100);
  const activity = await request(`/api/projects/${destinationId}/activity`);
  assert.equal(activity.status, 200);
  assert.deepEqual(activity.body.activity.map(item => item.action), ['Updated', 'Created']);

  const extraTask = await request('/api/tasks', manager, 'POST', { ...input, title: 'Delete this task directly' });
  assert.equal(extraTask.status, 201);
  assert.equal((await request(`/api/tasks/${extraTask.body.task.id}`, manager, 'DELETE')).status, 204);
  assert.equal((await request(`/api/tasks/${extraTask.body.task.id}`)).status, 404);
  assert.equal((await request(`/api/projects/${destinationId}`, manager, 'DELETE')).status, 204);
  assert.equal((await request(`/api/tasks/${taskId}`)).status, 404);
  assert.deepEqual((await request('/api/tasks')).body.tasks, []);
  assert.equal((await request(`/api/projects/${sourceId}`, manager, 'DELETE')).status, 204);
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM tasks')).rows[0].count, 0);
  assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM milestones')).rows[0].count, 0);
});
