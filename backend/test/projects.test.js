const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-project-test-secret';

const { app } = require('../dist/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return (await response.json()).token;
}

async function request(path, token, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test('manager completes project CRUD while other roles receive read-only access', async () => {
  const managerToken = await login('manager@emak.ca', 'manager123');
  const memberToken = await login('member@emak.ca', 'member123');
  const clientToken = await login('client@emak.ca', 'client123');

  const input = {
    name: 'Community Centre Renovation',
    clientId: 3,
    startDate: '2026-11-01',
    targetCompletionDate: '2027-03-31',
    status: 'Planning',
    milestones: [
      { title: 'Concept approval', dueDate: '2026-11-30' },
      { title: 'Construction drawings', dueDate: '2027-02-15' }
    ]
  };

  const forbidden = await request('/api/projects', clientToken, {
    method: 'POST',
    body: JSON.stringify(input)
  });
  assert.equal(forbidden.response.status, 403);

  const created = await request('/api/projects', managerToken, {
    method: 'POST',
    body: JSON.stringify(input)
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.project.name, input.name);
  assert.equal(created.body.project.milestones.length, 2);

  const projectId = created.body.project.id;
  const memberList = await request('/api/projects', memberToken);
  assert.equal(memberList.response.status, 200);
  assert.equal(memberList.body.projects.length, 1);

  const clientList = await request('/api/projects', clientToken);
  assert.equal(clientList.response.status, 200);
  assert.equal(clientList.body.projects[0].clientId, 3);

  const updated = await request(`/api/projects/${projectId}`, managerToken, {
    method: 'PUT',
    body: JSON.stringify({
      ...input,
      name: 'Community Centre Expansion',
      status: 'Active',
      milestones: [{ title: 'Concept approved', dueDate: '2026-11-30' }]
    })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.project.name, 'Community Centre Expansion');
  assert.equal(updated.body.project.status, 'Active');

  const deleted = await request(`/api/projects/${projectId}`, managerToken, { method: 'DELETE' });
  assert.equal(deleted.response.status, 204);
});

test('rejects invalid project dates', async () => {
  const managerToken = await login('manager@emak.ca', 'manager123');
  const result = await request('/api/projects', managerToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Invalid Project',
      clientId: 3,
      startDate: '2027-01-01',
      targetCompletionDate: '2026-01-01',
      status: 'Planning',
      milestones: []
    })
  });
  assert.equal(result.response.status, 400);
});
