const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-input-validation-test-secret';

const { app } = require('../dist/server');
const { generateToken } = require('../dist/authMiddleware');
const { validCalendarDate } = require('../dist/dateValidation');

const token = generateToken({ id: 1, name: 'Manager', email: 'manager@emak.ca', role: 'Manager' });
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function request(path, method = 'GET', input) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(input === undefined ? {} : { body: JSON.stringify(input) })
  });
  return { status: response.status, body: await response.json() };
}

const projectInput = {
  name: 'Calendar validation',
  clientId: 3,
  startDate: '2028-02-29',
  targetCompletionDate: '2028-03-31',
  status: 'Planning',
  milestones: [{ title: 'Leap day', dueDate: '2028-02-29' }]
};

test('calendar validation checks real days, leap years, and exact date format', () => {
  for (const value of ['2028-02-29', '2000-02-29', '2026-04-30', '0001-01-01', '9999-12-31']) {
    assert.equal(validCalendarDate(value), true, value);
  }
  for (const value of ['2026-02-31', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01', '2026-2-01', '2026-01-01T00:00:00Z', '', null, 20260101]) {
    assert.equal(validCalendarDate(value), false, String(value));
  }
});

test('project create and update reject invalid calendar dates and overlong names or milestones', async () => {
  const created = await request('/projects', 'POST', projectInput);
  assert.equal(created.status, 201);
  const path = `/projects/${created.body.project.id}`;
  const original = (await request(path)).body.project;

  for (const input of [
    { ...projectInput, name: 'p'.repeat(151) },
    { ...projectInput, startDate: '2026-02-31' },
    { ...projectInput, targetCompletionDate: '2028-04-31' },
    { ...projectInput, milestones: [{ title: 'm'.repeat(151), dueDate: null }] },
    { ...projectInput, milestones: [{ title: 'Invalid day', dueDate: '2026-02-29' }] }
  ]) {
    assert.equal((await request('/projects', 'POST', input)).status, 400);
    assert.equal((await request(path, 'PUT', input)).status, 400);
    assert.deepEqual((await request(path)).body.project, original);
  }
  assert.equal((await request('/projects')).body.projects.length, 1);
});

test('task create and update reject invalid dates and overlong titles without changing data', async () => {
  const project = await request('/projects', 'POST', projectInput);
  assert.equal(project.status, 201);
  const input = {
    projectId: project.body.project.id,
    assignedTo: 2,
    title: 'Valid task',
    description: '',
    priority: 'Medium',
    dueDate: '2028-02-29'
  };
  const created = await request('/tasks', 'POST', input);
  assert.equal(created.status, 201);
  const path = `/tasks/${created.body.task.id}`;
  const original = (await request(path)).body.task;
  for (const invalid of [
    { ...input, title: 't'.repeat(151) },
    { ...input, dueDate: '2026-02-31' },
    { ...input, dueDate: '2026-02-29' },
    { ...input, dueDate: '2028-04-31' }
  ]) {
    assert.equal((await request('/tasks', 'POST', invalid)).status, 400);
    assert.equal((await request(path, 'PUT', invalid)).status, 400);
    assert.deepEqual((await request(path)).body.task, original);
  }
  assert.equal((await request(`/projects/${input.projectId}/tasks`)).body.tasks.length, 1);
});

test('150-character Unicode names and titles and valid leap days are accepted', async () => {
  const boundary = '🏛'.repeat(150);
  const createdProject = await request('/projects', 'POST', {
    ...projectInput,
    name: boundary,
    milestones: [{ title: boundary, dueDate: '2028-02-29' }]
  });
  assert.equal(createdProject.status, 201);
  assert.equal(createdProject.body.project.name, boundary);
  const task = await request('/tasks', 'POST', {
    projectId: createdProject.body.project.id,
    assignedTo: 2,
    title: boundary,
    dueDate: '2028-02-29'
  });
  assert.equal(task.status, 201);
  assert.equal(task.body.task.title, boundary);
});
