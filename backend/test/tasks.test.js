const { after, before, mock, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = 'postgres://test:test@localhost/task-ownership-test';
process.env.JWT_SECRET = 'emak-task-test-secret';

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

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  await database?.close();
  await pool.end();
});

async function tasksFor(memberId, query = '') {
  const token = generateToken({
    id: memberId,
    name: 'Test Member',
    email: `member${memberId}@example.test`,
    role: 'Team Member'
  });
  const response = await fetch(`${baseUrl}/api/tasks${query}`, {
    headers: { Authorization: `Bearer ${token}` }
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
