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
const projectRepository = require('../dist/projectRepository');
const taskRepository = require('../dist/taskRepository');
const { createProject, getProjectForUser, listProjectActivity, updateProject } = projectRepository;
const { createTask, listTasksByProject, updateTaskForUser } = taskRepository;

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

function trackReportReads(t) {
  return [
    t.mock.method(projectRepository, 'getProjectForUser'),
    t.mock.method(taskRepository, 'listTasksByProject'),
    t.mock.method(projectRepository, 'listProjectActivity')
  ];
}

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

    async function reportFor(id, token = managerToken, query = '', headers = {}) {
      const response = await fetch(`${baseUrl}/api/projects/${id}/report${query}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
      });
      return { status: response.status, body: await response.json() };
    }

    async function mutate(path, method, token = managerToken, input) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(input === undefined ? {} : { body: JSON.stringify(input) })
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
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

    test('deleting the last task retains project details and returns a zero-task report', async () => {
      const retainedProject = await createProject(projectInput('Project after last task deletion'), 1);
      const task = await createTask({
        projectId: retainedProject.id,
        assignedTo: 2,
        title: 'Last project task',
        description: '',
        priority: 'Medium',
        dueDate: '2999-12-31'
      }, 1, 'Mehak Gill', retainedProject.name);
      const initial = await reportFor(retainedProject.id);
      assert.equal(initial.status, 200);
      assert.equal(initial.body.report.summary.totalTasks, 1);
      assert.deepEqual(initial.body.report.tasks, [task]);
      assert.deepEqual(initial.body.report.upcomingDeadlines.filter(item => item.type === 'Task'), [
        { type: 'Task', id: task.id, title: task.title, dueDate: '2999-12-31' }
      ]);
      const activity = await listProjectActivity(retainedProject.id);
      assert.deepEqual(activity.map(item => item.action), ['Created']);

      const deleted = await mutate(`/api/tasks/${task.id}`, 'DELETE');
      assert.equal(deleted.status, 204);

      const result = await reportFor(retainedProject.id);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, {
        success: true,
        report: {
          project: retainedProject,
          milestones: retainedProject.milestones,
          activity,
          tasks: [],
          upcomingDeadlines: [
            { type: 'Milestone', id: retainedProject.milestones[0].id, title: 'Concept approval', dueDate: '2999-11-30' },
            { type: 'Project', id: retainedProject.id, title: retainedProject.name, dueDate: '2999-12-31' }
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

    test('Team Members and Clients cannot spoof Manager access or trigger report reads', async t => {
      const reads = trackReportReads(t);
      for (const user of [userFor(2), userFor(3, 'Client')]) {
        for (const id of [project.id, 'abc', 2147483647]) {
          const result = await reportFor(id, generateToken(user), '?role=Manager&userId=1', {
            'X-User-Role': 'Manager', 'X-User-Id': '1'
          });
          assert.equal(result.status, 403);
          assert.deepEqual(result.body, { success: false, error: 'Forbidden: Requires role Manager.' });
        }
      }
      for (const read of reads) assert.equal(read.mock.callCount(), 0);
    });

    test('missing, invalid, expired and forged tokens cannot trigger report reads', async t => {
      const reads = trackReportReads(t);
      const expiredToken = jwt.sign(managerUser, process.env.JWT_SECRET, { expiresIn: -1 });
      const memberToken = generateToken(userFor(2));
      const tamperedParts = memberToken.split('.');
      tamperedParts[1] = Buffer.from(JSON.stringify({ ...jwt.decode(memberToken), role: 'Manager' })).toString('base64url');
      const tamperedToken = tamperedParts.join('.');
      const wrongSecretToken = jwt.sign(managerUser, 'different-report-test-secret', { expiresIn: '1h' });
      for (const token of [null, 'invalid-token', expiredToken, tamperedToken, wrongSecretToken]) {
        for (const id of [project.id, 'abc']) {
          const result = await reportFor(id, token, '?role=Manager&userId=1', {
            'X-User-Role': 'Manager', 'X-User-Id': '1'
          });
          assert.equal(result.status, 401);
          assert.equal(result.body.success, false);
          assert.equal(typeof result.body.error, 'string');
          assert.equal(result.body.report, undefined);
        }
      }
      for (const read of reads) assert.equal(read.mock.callCount(), 0);
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

    test('repository failures return a sanitized error without a partial report', async t => {
      for (const [repository, method] of [
        [projectRepository, 'getProjectForUser'],
        [taskRepository, 'listTasksByProject'],
        [projectRepository, 'listProjectActivity']
      ]) {
        await t.test(`${method} failure`, async t => {
          t.mock.method(repository, method, async () => {
            throw new Error('Private repository diagnostics must not reach the response.');
          });
          const loggedError = t.mock.method(console, 'error', () => {});
          const result = await reportFor(project.id);
          assert.equal(result.status, 500);
          assert.deepEqual(result.body, { success: false, error: 'Unable to complete the project request.' });
          assert.equal(loggedError.mock.callCount(), 1);
        });
      }
    });

    test('deleted projects return 404 even while their audit entry is retained', async () => {
      const removedProject = await createProject(projectInput('Deleted report project'), 1);
      const [creation] = await listProjectActivity(removedProject.id);
      assert.equal(creation.action, 'Created');
      assert.equal((await mutate(`/api/projects/${removedProject.id}`, 'DELETE')).status, 204);

      const retainedActivity = storage === 'PostgreSQL'
        ? (await database.query('SELECT id FROM project_activity WHERE id = $1 AND project_id IS NULL', [creation.id])).rows
        : await listProjectActivity(removedProject.id);
      assert.deepEqual(retainedActivity.map(item => item.id), [creation.id]);
      const result = await reportFor(removedProject.id);
      assert.equal(result.status, 404);
      assert.deepEqual(result.body, { success: false, error: 'Project not found.' });
    });

    test('reports refresh aggregation and deadlines after task completion, movement and reassignment', async () => {
      const baseline = (await reportFor(project.id)).body;
      const source = await createProject({ ...projectInput('Aggregation source'), milestones: [] }, 1);
      const destination = await createProject({ ...projectInput('Aggregation destination'), milestones: [] }, 1);
      const taskInput = (assignedTo, title) => ({
        projectId: source.id, assignedTo, title, description: '', priority: 'Medium', dueDate: '2999-12-31'
      });
      const completed = await createTask(taskInput(2, 'Complete this task'), 1, 'Mehak Gill', source.name);
      const movedInput = taskInput(4, 'Move this task');
      const moved = await createTask(movedInput, 1, 'Second Member', source.name);
      const progressed = await mutate(`/api/tasks/${completed.id}`, 'PATCH', generateToken(userFor(2)), {
        status: 'Completed', progress: 100
      });
      assert.equal(progressed.status, 200);

      const taskDeadlineIds = report => report.upcomingDeadlines.filter(item => item.type === 'Task').map(item => item.id);
      const initial = await reportFor(source.id);
      assert.equal(initial.status, 200);
      assert.deepEqual(initial.body.report.summary, {
        totalTasks: 2, completedTasks: 1, completionPercentage: 50, pendingTasks: 1,
        overdueTasks: 0, averageProgress: 50,
        tasksByStatus: { Pending: 1, 'To Do': 0, 'In Progress': 0, Review: 0, Completed: 1 }
      });
      assert.deepEqual(initial.body.report.tasks.map(item => item.id), [completed.id, moved.id]);
      assert.deepEqual(taskDeadlineIds(initial.body.report), [moved.id]);

      const reassigned = await mutate(`/api/tasks/${moved.id}`, 'PUT', managerToken, {
        ...movedInput, projectId: destination.id, assignedTo: 2
      });
      assert.equal(reassigned.status, 200);
      assert.equal(reassigned.body.task.assignedTo, 2);
      assert.equal(reassigned.body.task.projectId, destination.id);

      const refreshedSource = await reportFor(source.id);
      assert.equal(refreshedSource.status, 200);
      assert.deepEqual(refreshedSource.body.report.summary, {
        totalTasks: 1, completedTasks: 1, completionPercentage: 100, pendingTasks: 0,
        overdueTasks: 0, averageProgress: 100,
        tasksByStatus: { Pending: 0, 'To Do': 0, 'In Progress': 0, Review: 0, Completed: 1 }
      });
      assert.deepEqual(refreshedSource.body.report.tasks.map(item => item.id), [completed.id]);
      assert.deepEqual(taskDeadlineIds(refreshedSource.body.report), []);

      const refreshedDestination = await reportFor(destination.id);
      assert.equal(refreshedDestination.status, 200);
      assert.deepEqual(refreshedDestination.body.report.summary, {
        totalTasks: 1, completedTasks: 0, completionPercentage: 0, pendingTasks: 1,
        overdueTasks: 0, averageProgress: 0,
        tasksByStatus: { Pending: 1, 'To Do': 0, 'In Progress': 0, Review: 0, Completed: 0 }
      });
      assert.deepEqual(refreshedDestination.body.report.tasks.map(item => item.id), [moved.id]);
      assert.deepEqual(taskDeadlineIds(refreshedDestination.body.report), [moved.id]);
      assert.deepEqual((await reportFor(project.id)).body, baseline);
    });
  });
}
