const { after, before, beforeEach, mock, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = 'postgres://test:test@localhost/task-ownership-test';
process.env.JWT_SECRET = 'emak-task-test-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../dist/server');
const { pool } = require('../dist/db');
const { generateToken } = require('../dist/authMiddleware');

let server;
let baseUrl;
let database;

before(async () => {
  database = new PGlite();
  await database.exec(readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  await database.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (4, 'Second Member', 'second@example.test', 'unused', 'Team Member');
    INSERT INTO projects (name, client_id, start_date, target_completion_date, created_by)
    VALUES ('Test project', 3, '2026-11-01', '2026-12-01', 1);
    INSERT INTO tasks (project_id, assigned_to, title)
    VALUES (1, 2, 'First member task'), (1, 4, 'Second member task');
  `);
  mock.method(pool, 'query', database.query.bind(database));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await database.query("UPDATE tasks SET status = 'Pending', progress = 0");
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  await database?.close();
  await pool.end();
});

function tokenFor(id, role = 'Team Member') {
  return generateToken({
    id,
    name: 'Test Member',
    email: `member${id}@example.test`,
    role
  });
}

async function tasksFor(memberId, query = '') {
  const response = await fetch(`${baseUrl}/api/tasks${query}`, {
    headers: { Authorization: `Bearer ${tokenFor(memberId)}` }
  });
  assert.equal(response.status, 200);
  return (await response.json()).tasks;
}

test('members receive their own tasks and cannot see another member\'s tasks', async () => {
  assert.deepEqual((await tasksFor(2)).map((task) => task.id), [1]);
  assert.deepEqual((await tasksFor(4)).map((task) => task.id), [2]);
});

test('query parameters cannot request another member\'s tasks', async () => {
  const tasks = await tasksFor(2, '?assignedTo=4&assigned_to=4&userId=4');
  assert.deepEqual(tasks.map((task) => task.id), [1]);
});

const update = { status: 'In Progress', progress: 45 };

async function patchTask(id, token, input = update, query = '') {
  const response = await fetch(`${baseUrl}/api/tasks/${id}${query}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(input)
  });
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json() : await response.text();
  return { status: response.status, body };
}

async function storedTasks() {
  return (await database.query('SELECT * FROM tasks ORDER BY id')).rows;
}

test('members save status and progress changes that persist in their task lists', async () => {
  for (const [memberId, taskId, input] of [
    [2, 1, update],
    [4, 2, { status: 'Completed', progress: 100 }],
    [2, 1, { status: 'Pending', progress: 0 }]
  ]) {
    const saved = await patchTask(taskId, tokenFor(memberId), input);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.success, true);
    assert.equal(saved.body.task.id, taskId);
    assert.equal(saved.body.task.assignedTo, memberId);
    assert.equal(saved.body.task.status, input.status);
    assert.equal(saved.body.task.progress, input.progress);
    const tasks = await tasksFor(memberId);
    assert.deepEqual(tasks.map((task) => task.id), [taskId]);
    assert.equal(tasks[0].status, input.status);
    assert.equal(tasks[0].progress, input.progress);
  }
});

test('foreign and missing task updates return 404 without changing tasks', async () => {
  const initial = await storedTasks();
  for (const [memberId, taskId] of [[2, 2], [4, 1], [2, 999], [2, 2147483647]]) {
    const result = await patchTask(taskId, tokenFor(memberId));
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'Task not found.');
    assert.deepEqual(await storedTasks(), initial);
  }
});

test('invalid task IDs return 400 without changing tasks', async () => {
  const initial = await storedTasks();
  for (const id of ['0', '-1', '1.5', 'abc', '2147483648']) {
    assert.equal((await patchTask(id, tokenFor(2))).status, 400, `id ${id}`);
    assert.deepEqual(await storedTasks(), initial);
  }
});

test('invalid status and progress input returns 400 without changing tasks', async () => {
  const initial = await storedTasks();
  const invalid = [
    null, [], {}, { progress: 45 }, { status: 'In Progress' },
    { status: 'pending', progress: 45 }, { status: 'Unknown', progress: 45 },
    ...['45', null, 1.5, -1, 101].map((progress) => ({ status: 'In Progress', progress }))
  ];
  for (const input of invalid) {
    assert.equal((await patchTask(1, tokenFor(2), input)).status, 400, JSON.stringify(input));
    assert.deepEqual(await storedTasks(), initial);
  }
});

test('missing or invalid tokens and other roles cannot update tasks', async () => {
  const initial = await storedTasks();
  for (const [token, expected] of [
    [undefined, 401], ['invalid-token', 401],
    [tokenFor(1, 'Manager'), 403], [tokenFor(3, 'Client'), 403]
  ]) {
    assert.equal((await patchTask(1, token)).status, expected);
    assert.deepEqual(await storedTasks(), initial);
  }
});

test('supplied ownership fields cannot redirect or reassign task updates', async () => {
  const initial = await storedTasks();
  const token = tokenFor(2);
  const query = '?userId=4&assignedTo=4&assigned_to=4';
  const saved = await patchTask(1, token, {
    ...update, assignedTo: 4, assigned_to: 4, projectId: 999, id: 2
  }, query);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.task.id, 1);
  assert.equal(saved.body.task.assignedTo, 2);
  assert.equal(saved.body.task.projectId, 1);
  const expected = initial.map((task) => task.id === 1 ? { ...task, ...update } : task);
  assert.deepEqual(await storedTasks(), expected);
  assert.equal((await patchTask(2, token, { ...update, assignedTo: 2, id: 1 }, query)).status, 404);
  assert.deepEqual(await storedTasks(), expected);
});
