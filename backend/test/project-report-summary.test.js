const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectReport } = require('../dist/projectReport');

const project = {
  id: 1, name: 'Summary test project', milestones: [], status: 'Active', targetCompletionDate: '2026-12-31'
};

test('completion, pending and overdue summaries follow task status independently of progress', () => {
  const tasks = [
    { status: 'Pending', progress: 100, dueDate: '2026-11-17' },
    { status: 'In Progress', progress: 25, dueDate: '2026-11-17' },
    { status: 'Review', progress: 90, dueDate: '2026-11-18' },
    { status: 'To Do', progress: 0, dueDate: '2026-11-19' },
    { status: 'Pending', progress: 0, dueDate: null },
    { status: 'Completed', progress: 0, dueDate: '2026-11-17' },
    { status: 'Completed', progress: 100, dueDate: null }
  ];
  const { summary } = buildProjectReport(project, tasks, new Date('2026-11-18T17:00:00Z'));
  assert.equal(summary.totalTasks, 7);
  assert.equal(summary.completedTasks, 2);
  assert.equal(summary.completionPercentage, 28.57);
  assert.equal(summary.pendingTasks, 5);
  assert.equal(summary.overdueTasks, 2);
});

test('completion percentage handles all completed, none completed and empty projects', () => {
  const cases = [
    [[{ status: 'Completed', progress: 0, dueDate: null }, { status: 'Completed', progress: 25, dueDate: null }], 100],
    [[{ status: 'Pending', progress: 100, dueDate: null }, { status: 'Review', progress: 100, dueDate: null }], 0],
    [[], 0]
  ];
  for (const [tasks, expected] of cases) {
    const { summary } = buildProjectReport(project, tasks, new Date('2026-11-18T17:00:00Z'));
    assert.equal(summary.completionPercentage, expected);
  }
});

test('aggregation rounds completion and average progress independently without changing task order', () => {
  const cases = [
    {
      states: [['Completed', 1], ['Pending', 0], ['Completed', 1]],
      expected: {
        totalTasks: 3, completedTasks: 2, completionPercentage: 66.67,
        pendingTasks: 1, overdueTasks: 0, averageProgress: 0.67,
        tasksByStatus: { Pending: 1, 'To Do': 0, 'In Progress': 0, Review: 0, Completed: 2 }
      }
    },
    {
      states: [['Review', 2], ['Completed', 1], ['In Progress', 1]],
      expected: {
        totalTasks: 3, completedTasks: 1, completionPercentage: 33.33,
        pendingTasks: 2, overdueTasks: 0, averageProgress: 1.33,
        tasksByStatus: { Pending: 0, 'To Do': 0, 'In Progress': 1, Review: 1, Completed: 1 }
      }
    }
  ];
  for (const { states, expected } of cases) {
    const tasks = Object.freeze(states.map(([status, progress], index) => Object.freeze({
      id: index + 1, title: `Rounding task ${index + 1}`, status, progress, dueDate: null
    })));
    for (const orderedTasks of [tasks, Object.freeze([...tasks].reverse())]) {
      const report = buildProjectReport(project, orderedTasks, new Date('2026-11-18T17:00:00Z'));
      assert.deepEqual(report.summary, expected);
      assert.deepEqual(report.tasks.map(task => task.id), orderedTasks.map(task => task.id));
    }
  }
});

test('overdue and upcoming tasks change at Toronto midnight in both standard and daylight time', () => {
  const cases = [
    ['2026-11-18', '2026-11-19T04:59:59.999Z', 0],
    ['2026-11-18', '2026-11-19T05:00:00.000Z', 1],
    ['2026-07-18', '2026-07-19T03:59:59.999Z', 0],
    ['2026-07-18', '2026-07-19T04:00:00.000Z', 1]
  ];
  for (const [dueDate, timestamp, expected] of cases) {
    const tasks = [{ id: 1, title: 'Boundary task', status: 'Pending', progress: 0, dueDate }];
    const { summary, upcomingDeadlines } = buildProjectReport(project, tasks, new Date(timestamp));
    assert.equal(summary.overdueTasks, expected, `due ${dueDate} at ${timestamp}`);
    assert.deepEqual(
      upcomingDeadlines.filter(deadline => deadline.type === 'Task'),
      expected === 0 ? [{ type: 'Task', id: 1, title: 'Boundary task', dueDate }] : [],
      `upcoming deadline due ${dueDate} at ${timestamp}`
    );
  }
});

test('upcoming deadlines include today and distant dates, filter finished entities, and sort deterministic ties', () => {
  const reportProject = {
    ...project,
    id: 10,
    targetCompletionDate: '2026-11-19',
    milestones: [
      { id: 9, title: 'Design approval', status: 'Pending', dueDate: '2026-11-19' },
      { id: 2, title: 'Site review', status: 'Pending', dueDate: '2026-11-19' },
      { id: 3, title: 'Past milestone', status: 'Pending', dueDate: '2026-11-17' },
      { id: 4, title: 'Finished milestone', status: 'Completed', dueDate: '2026-11-20' },
      { id: 5, title: 'Undated milestone', status: 'Pending', dueDate: null }
    ]
  };
  const originalProject = structuredClone(reportProject);
  const tasks = [
    { id: 8, title: 'Review task', status: 'Review', progress: 90, dueDate: '2026-11-19' },
    { id: 1, title: 'Pending task', status: 'Pending', progress: 100, dueDate: '2026-11-19' },
    { id: 2, title: 'Due today', status: 'To Do', progress: 0, dueDate: '2026-11-18' },
    { id: 3, title: 'Distant task', status: 'In Progress', progress: 10, dueDate: '2999-12-31' },
    { id: 4, title: 'Past task', status: 'Pending', progress: 0, dueDate: '2026-11-17' },
    { id: 5, title: 'Finished task', status: 'Completed', progress: 0, dueDate: '2026-11-20' },
    { id: 6, title: 'Undated task', status: 'Pending', progress: 0, dueDate: null }
  ];
  const activity = [
    { id: 2, projectId: 10, action: 'Updated', createdAt: '2026-11-18T12:00:00Z' },
    { id: 1, projectId: 10, action: 'Created', createdAt: '2026-11-17T12:00:00Z' }
  ];
  const report = buildProjectReport(reportProject, tasks, new Date('2026-11-19T02:00:00Z'), activity);
  assert.deepEqual(report.upcomingDeadlines, [
    { type: 'Task', id: 2, title: 'Due today', dueDate: '2026-11-18' },
    { type: 'Milestone', id: 2, title: 'Site review', dueDate: '2026-11-19' },
    { type: 'Milestone', id: 9, title: 'Design approval', dueDate: '2026-11-19' },
    { type: 'Project', id: 10, title: project.name, dueDate: '2026-11-19' },
    { type: 'Task', id: 1, title: 'Pending task', dueDate: '2026-11-19' },
    { type: 'Task', id: 8, title: 'Review task', dueDate: '2026-11-19' },
    { type: 'Task', id: 3, title: 'Distant task', dueDate: '2999-12-31' }
  ]);
  assert.deepEqual(report.milestones, originalProject.milestones);
  assert.deepEqual(reportProject, originalProject);
  assert.deepEqual(report.activity, activity);
});

test('completed projects omit their own deadline while unfinished child deadlines remain', () => {
  const reportProject = {
    ...project,
    status: 'Completed',
    milestones: [{ id: 1, title: 'Remaining milestone', status: 'Pending', dueDate: '2026-12-31' }]
  };
  const tasks = [{ id: 1, title: 'Remaining task', status: 'Pending', progress: 0, dueDate: '2026-12-31' }];
  const report = buildProjectReport(reportProject, tasks, new Date('2026-11-18T17:00:00Z'));
  assert.deepEqual(report.upcomingDeadlines, [
    { type: 'Milestone', id: 1, title: 'Remaining milestone', dueDate: '2026-12-31' },
    { type: 'Task', id: 1, title: 'Remaining task', dueDate: '2026-12-31' }
  ]);
  assert.deepEqual(report.activity, []);
});
