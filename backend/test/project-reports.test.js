const { after, before, describe, mock, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');

process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'emak-project-report-test-secret';
process.env.NODE_ENV = 'test';

const { app } = require('../dist/server');
const { pool } = require('../dist/db');
const { generateToken } = require('../dist/authMiddleware');
const { createProject, getProjectForUser, listProjectActivity, updateProject } = require('../dist/projectRepository');
const { createTask, listTasksByProject, updateTaskForUser } = require('../dist/taskRepository');

const userFor = (id, role = 'Team Member') => ({
  id, role, name: 'Report test user', email: `user${id}@example.test`
});
const managerUser = userFor(1, 'Manager');
const managerToken = generateToken(managerUser);
const statuses = ['Pending', 'To Do', 'In Progress', 'Review', 'Completed'];
const projectInput = name => ({
  name,
  clientId: 3,
  startDate: '2026-11-01',
  targetCompletionDate: '2999-12-31',
  status: 'Active',
  milestones: [
    { title: 'Concept approval', dueDate: '2999-11-30' },
    { title: 'Construction drawings', dueDate: null }
  ]
});

after(async () => {
  await pool.end();
});

for (const storage of ['memory', 'PostgreSQL']) {
  describe(`project reports using ${storage}`, { concurrency: false }, () => {
    let database;
    let server;
    let baseUrl;
    let project;
    let emptyProject;
    let tasks;

    before(async () => {
      process.env.DATABASE_URL = storage === 'PostgreSQL' ? 'postgres://isolated-project-report-test' : '';
      if (storage === 'PostgreSQL') {
        database = new PGlite();
        await database.exec(readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
        await database.query(
          `INSERT INTO users (id, name, email, password_hash, role)
           VALUES (4, 'Second Member', 'second@example.test', 'unused', 'Team Member')`
        );
        mock.method(pool, 'query', database.query.bind(database));
        mock.method(pool, 'connect', async () => ({ query: database.query.bind(database), release() {} }));
      }

      project = await createProject(projectInput('Reported project draft'), 1);
      project = await updateProject(project.id, projectInput('Reported project'), 1);
      emptyProject = await createProject({ ...projectInput('Empty project'), milestones: [] }, 1);
      const unrelatedProject = await createProject(projectInput('Unrelated project'), 1);
      tasks = [];
      const taskStates = [
        ['Pending', 100], ['To Do', 0], ['In Progress', 25],
        ['Review', 90], ['Completed', 50], ['Completed', 100]
      ];
      const taskDueDates = ['2000-01-01', '2999-12-31', '2000-01-01', null, '2000-01-01', '2999-12-31'];
      for (const [index, [status, progress]] of taskStates.entries()) {
        const assignedTo = index % 2 === 0 ? 2 : 4;
        const created = await createTask({
          projectId: project.id,
          assignedTo,
          title: `Report task ${index + 1}`,
          description: 'Report task details',
          priority: 'High',
          dueDate: taskDueDates[index]
        }, 1, assignedTo === 2 ? 'Mehak Gill' : 'Second Member', project.name);
        tasks.push(await updateTaskForUser(created.id, { status, progress }, userFor(assignedTo)));
      }
      await createTask({
        projectId: unrelatedProject.id,
        assignedTo: 2,
        title: 'Unrelated task',
        description: '',
        priority: 'Low',
        dueDate: '2000-01-01'
      }, 1, 'Mehak Gill', unrelatedProject.name);

      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      mock.restoreAll();
      await database?.close();
      process.env.DATABASE_URL = '';
    });

    async function reportFor(id, token = managerToken, query = '') {
      const response = await fetch(`${baseUrl}/api/projects/${id}/report${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return { status: response.status, body: await response.json() };
    }

    test('Managers receive project details, all assignees and rounded task summaries without writes', async () => {
      const initialProject = await getProjectForUser(project.id, managerUser);
      const initialTasks = await listTasksByProject(project.id, managerUser);
      const initialActivity = await listProjectActivity(project.id);
      const result = await reportFor(project.id, managerToken, '?assignedTo=2&projectId=999');
      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.deepEqual(result.body.report.project, project);
      assert.deepEqual(result.body.report.milestones, project.milestones);
      assert.deepEqual(result.body.report.activity, initialActivity);
      assert.deepEqual(result.body.report.activity.map(item => item.action), ['Updated', 'Created']);
      assert.deepEqual(result.body.report.tasks.slice().sort((a, b) => a.id - b.id), tasks);
      assert.deepEqual(result.body.report.upcomingDeadlines, [
        { type: 'Milestone', id: project.milestones[0].id, title: 'Concept approval', dueDate: '2999-11-30' },
        { type: 'Project', id: project.id, title: project.name, dueDate: '2999-12-31' },
        { type: 'Task', id: tasks[1].id, title: tasks[1].title, dueDate: '2999-12-31' }
      ]);
      assert.deepEqual(result.body.report.summary, {
        totalTasks: 6,
        completedTasks: 2,
        completionPercentage: 33.33,
        pendingTasks: 4,
        overdueTasks: 2,
        averageProgress: 60.83,
        tasksByStatus: { Pending: 1, 'To Do': 1, 'In Progress': 1, Review: 1, Completed: 2 }
      });

      assert.deepEqual((await reportFor(project.id)).body, result.body);
      assert.deepEqual(await getProjectForUser(project.id, managerUser), initialProject);
      assert.deepEqual(await listTasksByProject(project.id, managerUser), initialTasks);
      assert.deepEqual(await listProjectActivity(project.id), initialActivity);
    });

    test('empty projects return zero counts and average progress', async () => {
      const result = await reportFor(emptyProject.id);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, {
        success: true,
        report: {
          project: emptyProject,
          milestones: [],
          activity: await listProjectActivity(emptyProject.id),
          tasks: [],
          upcomingDeadlines: [
            { type: 'Project', id: emptyProject.id, title: emptyProject.name, dueDate: '2999-12-31' }
          ],
          summary: {
            totalTasks: 0,
            completedTasks: 0,
            completionPercentage: 0,
            pendingTasks: 0,
            overdueTasks: 0,
            averageProgress: 0,
            tasksByStatus: Object.fromEntries(statuses.map(status => [status, 0]))
          }
        }
      });
    });

    test('Team Members and Clients are denied before project validation or lookup', async () => {
      for (const user of [userFor(2), userFor(3, 'Client')]) {
        for (const id of [project.id, 'abc', 2147483647]) {
          const result = await reportFor(id, generateToken(user), '?role=Manager&userId=1');
          assert.equal(result.status, 403);
          assert.deepEqual(result.body, { success: false, error: 'Forbidden: Requires role Manager.' });
        }
      }
    });

    test('missing, invalid and expired tokens are denied before project validation', async () => {
      const expiredToken = jwt.sign(managerUser, process.env.JWT_SECRET, { expiresIn: -1 });
      for (const token of [null, 'invalid-token', expiredToken]) {
        for (const id of [project.id, 'abc']) {
          const result = await reportFor(id, token);
          assert.equal(result.status, 401);
          assert.equal(result.body.success, false);
          assert.equal(typeof result.body.error, 'string');
          assert.equal(result.body.report, undefined);
        }
      }
    });

    test('invalid project IDs return 400 and missing projects return 404', async () => {
      for (const id of ['0', '-1', '1.5', 'abc', '2147483648', 'Infinity']) {
        const result = await reportFor(id);
        assert.equal(result.status, 400, `project ID ${id}`);
        assert.deepEqual(result.body, { success: false, error: 'A valid project ID is required.' });
      }
      const missing = await reportFor(2147483647);
      assert.equal(missing.status, 404);
      assert.deepEqual(missing.body, { success: false, error: 'Project not found.' });
    });
  });
}
