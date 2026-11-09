const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-task-test-secret';

const { app } = require('../dist/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return (await res.json()).token;
}

async function request(path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test('manager performs task CRUD and assignment while non-managers are blocked', async () => {
  const managerToken = await login('manager@emak.ca', 'manager123');
  const memberToken = await login('member@emak.ca', 'member123');
  const clientToken = await login('client@emak.ca', 'client123');

  const membersRes = await request('/api/users/members', managerToken);
  assert.equal(membersRes.response.status, 200);
  assert.equal(membersRes.body.members[0].id, 2);

  const projectRes = await request('/api/projects', managerToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Website Redesign',
      clientId: 3,
      startDate: '2026-11-01',
      targetCompletionDate: '2026-12-31',
      status: 'Active',
      milestones: []
    })
  });
  const projectId = projectRes.body.project.id;

  const taskInput = {
    projectId,
    assignedTo: 2,
    title: 'Design wireframes',
    description: 'Create homepage wireframes',
    priority: 'High',
    dueDate: '2026-11-20'
  };

  for (const token of [memberToken, clientToken]) {
    const forbidden = await request('/api/tasks', token, { method: 'POST', body: JSON.stringify(taskInput) });
    assert.equal(forbidden.response.status, 403);
  }

  const created = await request('/api/tasks', managerToken, { method: 'POST', body: JSON.stringify(taskInput) });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.task.title, 'Design wireframes');
  const taskId = created.body.task.id;

  const projectTasks = await request(`/api/projects/${projectId}/tasks`, managerToken);
  assert.equal(projectTasks.response.status, 200);
  assert.equal(projectTasks.body.tasks.length, 1);

  const updated = await request(`/api/tasks/${taskId}`, managerToken, {
    method: 'PUT',
    body: JSON.stringify({ ...taskInput, title: 'Finalize wireframes', priority: 'Urgent' })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.task.title, 'Finalize wireframes');

  const deleted = await request(`/api/tasks/${taskId}`, managerToken, { method: 'DELETE' });
  assert.equal(deleted.response.status, 204);
});

test('rejects invalid task creation inputs', async () => {
  const managerToken = await login('manager@emak.ca', 'manager123');
  const projectRes = await request('/api/projects', managerToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Validation Project',
      clientId: 3,
      startDate: '2026-11-01',
      targetCompletionDate: '2026-12-31',
      status: 'Planning',
      milestones: []
    })
  });
  const base = {
    projectId: projectRes.body.project.id,
    assignedTo: 2,
    title: 'Valid Task',
    description: 'Details',
    priority: 'Medium',
    dueDate: '2026-11-25'
  };

  for (const invalid of [
    { ...base, title: '  ' },
    { ...base, projectId: 999 },
    { ...base, assignedTo: 3 },
    { ...base, priority: 'Invalid' },
    { ...base, dueDate: 'not-a-date' }
  ]) {
    const res = await request('/api/tasks', managerToken, { method: 'POST', body: JSON.stringify(invalid) });
    assert.equal(res.response.status, 400);
  }
});
