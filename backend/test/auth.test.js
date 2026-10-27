const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-test-secret';

const { app } = require('../dist/server');
const { authenticateJWT, authorizeRoles } = require('../dist/authMiddleware');

app.get(
  '/api/test/manager',
  authenticateJWT,
  authorizeRoles('Manager'),
  (_req, res) => res.json({ success: true })
);

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
  const body = await response.json();
  return { response, body };
}

test('authenticates all supported roles and issues JWTs', async () => {
  const accounts = [
    ['manager@emak.ca', 'manager123', 'Manager'],
    ['member@emak.ca', 'member123', 'Team Member'],
    ['client@emak.ca', 'client123', 'Client']
  ];

  for (const [email, password, role] of accounts) {
    const { response, body } = await login(email, password);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.role, role);
    assert.equal(typeof body.token, 'string');
  }
});

test('blocks an invalid password', async () => {
  const { response, body } = await login('manager@emak.ca', 'incorrect');
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test('blocks access when a token is missing', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
});

test('returns the authenticated user for a valid token', async () => {
  const { body: loginBody } = await login('member@emak.ca', 'member123');
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.email, 'member@emak.ca');
  assert.equal(body.user.role, 'Team Member');
});

test('enforces role authorization', async () => {
  const { body: managerLogin } = await login('manager@emak.ca', 'manager123');
  const managerResponse = await fetch(`${baseUrl}/api/test/manager`, {
    headers: { Authorization: `Bearer ${managerLogin.token}` }
  });
  assert.equal(managerResponse.status, 200);

  const { body: clientLogin } = await login('client@emak.ca', 'client123');
  const clientResponse = await fetch(`${baseUrl}/api/test/manager`, {
    headers: { Authorization: `Bearer ${clientLogin.token}` }
  });
  assert.equal(clientResponse.status, 403);
});

test('supports logout', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
});
