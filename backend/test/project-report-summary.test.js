const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectReport } = require('../dist/projectReport');

const project = { id: 1, name: 'Summary test project' };

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

test('overdue tasks change at Toronto midnight in both standard and daylight time', () => {
  const cases = [
    ['2026-11-18', '2026-11-19T04:59:59.999Z', 0],
    ['2026-11-18', '2026-11-19T05:00:00.000Z', 1],
    ['2026-07-18', '2026-07-19T03:59:59.999Z', 0],
    ['2026-07-18', '2026-07-19T04:00:00.000Z', 1]
  ];
  for (const [dueDate, timestamp, expected] of cases) {
    const tasks = [{ status: 'Pending', progress: 0, dueDate }];
    const { summary } = buildProjectReport(project, tasks, new Date(timestamp));
    assert.equal(summary.overdueTasks, expected, `due ${dueDate} at ${timestamp}`);
  }
});
