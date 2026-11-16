const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-memory-integrity-test-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../dist/server');
const { pool } = require('../dist/db');
const { generateToken } = require('../dist/authMiddleware');

const manager = generateToken({ id: 1, name: 'Manager', email: 'manager@emak.ca', role: 'Manager' });
const member = generateToken({ id: 2, name: 'Member', email: 'member@emak.ca', role: 'Team Member' });
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path, token = manager, method = 'GET', input) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(input === undefined ? {} : { body: JSON.stringify(input) })
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function projectInput(name) {
  return {
    name,
    clientId: 3,
    startDate: '2026-11-01',
    targetCompletionDate: '2026-12-31',
    status: 'Active',
    milestones: []
  };
}

async function createProject(name) {
  const created = await request('/api/projects', manager, 'POST', projectInput(name));
  assert.equal(created.status, 201);
  return created.body.project;
}

function taskInput(projectId, title) {
  return { projectId, assignedTo: 2, title, description: 'Task details', priority: 'High', dueDate: '2026-11-20' };
}

async function createTask(projectId, title) {
  const created = await request('/api/tasks', manager, 'POST', taskInput(projectId, title));
  assert.equal(created.status, 201);
  return created.body.task;
}

test('deleting a project removes its tasks from memory while retaining unrelated tasks', async () => {
  const removedProject = await createProject('Project to remove');
  const retainedProject = await createProject('Project to retain');
  const removedTasks = [
    await createTask(removedProject.id, 'First removed task'),
    await createTask(removedProject.id, 'Second removed task')
  ];
  const retainedTask = await createTask(retainedProject.id, 'Retained task');

  assert.equal((await request(`/api/projects/${removedProject.id}`, manager, 'DELETE')).status, 204);
  for (const token of [manager, member]) {
    const listed = await request('/api/tasks', token);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.tasks.map((task) => task.id), [retainedTask.id]);
    for (const task of removedTasks) {
      assert.equal((await request(`/api/tasks/${task.id}`, token)).status, 404);
    }
  }
  for (const task of removedTasks) {
    assert.equal((await request(`/api/tasks/${task.id}`, member, 'PATCH', { status: 'In Progress', progress: 45 })).status, 404);
    assert.equal((await request(`/api/tasks/${task.id}`, manager, 'PUT', taskInput(retainedProject.id, task.title))).status, 404);
    assert.equal((await request(`/api/tasks/${task.id}`, manager, 'DELETE')).status, 404);
  }
  assert.equal((await request(`/api/projects/${removedProject.id}/tasks`)).status, 404);
  const retained = await request(`/api/projects/${retainedProject.id}/tasks`);
  assert.deepEqual(retained.body.tasks.map((task) => task.id), [retainedTask.id]);
});

test('moving tasks and renaming projects expose current project names without changing progress', async () => {
  const source = await createProject('Source project');
  const destination = await createProject('Destination project');
  const movedTask = await createTask(source.id, 'Moved task');
  const sourceTask = await createTask(source.id, 'Source task');
  const destinationTask = await createTask(destination.id, 'Destination task');
  assert.equal((await request(`/api/tasks/${movedTask.id}`, member, 'PATCH', { status: 'Review', progress: 90 })).status, 200);

  const moved = await request(`/api/tasks/${movedTask.id}`, manager, 'PUT', taskInput(destination.id, movedTask.title));
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.projectId, destination.id);
  assert.equal(moved.body.task.projectName, destination.name);
  assert.equal(moved.body.task.status, 'Review');
  assert.equal(moved.body.task.progress, 90);
  assert.equal(moved.body.task.progressPercentage, 90);

  assert.equal((await request(`/api/projects/${source.id}`, manager, 'PUT', projectInput('Renamed source'))).status, 200);
  assert.equal((await request(`/api/projects/${destination.id}`, manager, 'PUT', projectInput('Renamed destination'))).status, 200);

  for (const token of [manager, member]) {
    const listed = await request('/api/tasks', token);
    const tasks = new Map(listed.body.tasks.map((task) => [task.id, task]));
    assert.equal(tasks.get(sourceTask.id).projectName, 'Renamed source');
    assert.equal(tasks.get(destinationTask.id).projectName, 'Renamed destination');
    assert.equal(tasks.get(movedTask.id).projectName, 'Renamed destination');
    assert.equal(tasks.get(movedTask.id).status, 'Review');
    assert.equal(tasks.get(movedTask.id).progress, 90);
    const individual = await request(`/api/tasks/${movedTask.id}`, token);
    assert.equal(individual.body.task.projectName, 'Renamed destination');
    assert.equal(individual.body.task.updatedAt, moved.body.task.updatedAt);
    const projectTasks = await request(`/api/projects/${destination.id}/tasks`, token);
    assert.deepEqual(projectTasks.body.tasks.map((task) => task.id).sort((a, b) => a - b), [movedTask.id, destinationTask.id]);
    assert(projectTasks.body.tasks.every((task) => task.projectName === 'Renamed destination'));
  }
});
