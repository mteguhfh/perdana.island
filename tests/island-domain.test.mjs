import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clampUnit,
    createTask,
    dateKey,
    dailyReportText,
    distractionLabel,
    formatClockTime,
    formatMinutesSeconds,
    formatTime,
    hexColorToRgb,
    isoWeekNumber,
    normalizeHexColor,
    normalizeTabOrder,
    parseClockTime,
    cycleTaskPriority,
    setTaskTime,
    splitCity,
    taskScheduleKey,
    tasksDoneOnDate,
    summaryTaskState,
    todayMetricValues,
    toggleTask,
} from '../extension/island-domain.js';

test('tab order filters unknown and duplicate keys and appends defaults', () => {
    const order = normalizeTabOrder(['notes', 'bad', 'notes', 'settings']);
    assert.equal(order.length, 11);
    assert.deepEqual(order.slice(0, 2), ['notes', 'settings']);
});

test('unit values clamp and invalid values use the supplied fallback', () => {
    assert.equal(clampUnit(-1), 0);
    assert.equal(clampUnit(2), 1);
    assert.equal(clampUnit('invalid', 0.5), 0.5);
});

test('task schedule keys sort dated timed tasks before undated tasks', () => {
    assert.ok(taskScheduleKey({dueDate: '2026-11-02', due: 480})
        < taskScheduleKey({dueDate: '2026-11-02', due: 540}));
    assert.ok(taskScheduleKey({dueDate: '2026-11-02'}) < taskScheduleKey({}));
});

test('task lifecycle helpers preserve scheduling and completion state', () => {
    const now = new Date(2026, 10, 2, 9, 0);
    const task = createTask({id: 'task-1', text: '  Plan release  ', due: 540, priority: 'high', now});
    assert.deepEqual(task, {
        id: 'task-1', text: 'Plan release', done: false, doneAt: null,
        due: 540, dueDate: '2026-11-02', priority: 'high',
    });
    assert.equal(createTask({id: 'empty', text: '   '}), null);
    const completed = toggleTask([task], 'task-1', now)[0];
    assert.equal(completed.done, true);
    assert.equal(completed.doneAt, now.toISOString());
    assert.equal(tasksDoneOnDate([completed], now).length, 1);
    assert.equal(setTaskTime([completed], 'task-1', null)[0].due, null);
    assert.equal(cycleTaskPriority([task], 'task-1')[0].priority, 'medium');
});

test('daily report uses agenda, completed tasks, open tasks, and focus log', () => {
    const now = new Date(2026, 10, 2, 9, 0);
    const tasks = [
        createTask({id: 'open', text: 'Plan release', due: 540, now}),
        {...createTask({id: 'done', text: 'Review changes', now}), done: true, doneAt: now.toISOString()},
    ];
    const report = dailyReportText(tasks, {'2026-11-02': 1500}, now);
    assert.match(report, /Tasks done: 1/);
    assert.match(report, /Open tasks: 1/);
    assert.match(report, /Scheduled: 09:00 Plan release/);
    assert.match(report, /Focus: 25 min/);
});

test('focus distraction matching avoids false domain suffix matches', () => {
    assert.equal(distractionLabel('Firefox - youtube.com'), 'YouTube');
    assert.equal(distractionLabel('notx.com'), null);
    assert.equal(distractionLabel('work editor'), null);
});

test('city, clock, and local date helpers handle boundaries', () => {
    assert.deepEqual(splitCity('  Bandung, Jawa Barat, Indonesia '), ['Bandung', 'Jawa Barat, Indonesia']);
    assert.deepEqual(splitCity(''), ['', 'Indonesia']);
    assert.equal(parseClockTime('9.05'), 545);
    assert.equal(parseClockTime('24:00'), null);
    assert.equal(formatClockTime(1439), '23:59');
    assert.equal(dateKey(new Date(2026, 0, 4)), '2026-01-04');
});

test('time and color formatters remain bounded and predictable', () => {
    assert.equal(formatTime(61.8), '1:01');
    assert.equal(normalizeHexColor('aabbcc'), '#AABBCC');
    assert.equal(normalizeHexColor('#bad'), null);
    assert.deepEqual(hexColorToRgb('#FFFFFF'), [1, 1, 1]);
    assert.equal(isoWeekNumber(new Date(2026, 0, 1)), 1);
});

test('summary task state reports pending work and completion counts', () => {
    assert.deepEqual(summaryTaskState([]), {
        pending: [], completed: 0, subtitle: 'No tasks yet', value: '0/0',
    });
    assert.deepEqual(summaryTaskState([
        {text: 'Open task', done: false},
        {text: 'Done task', done: true},
    ]), {
        pending: [{text: 'Open task', done: false}],
        completed: 1, subtitle: 'Open task', value: '1/2',
    });
    assert.equal(summaryTaskState([{done: true}]).subtitle, 'All tasks done');
});

test('Today metrics format available and empty system readings', () => {
    const values = todayMetricValues({
        cpuPercent: 25,
        totalKiB: 1024,
        usedKiB: 512,
        diskTotal: 2 * 1024 ** 3,
        diskFree: 1024 ** 3,
        battery: {percent: 80, connected: true, status: 'Charging'},
    });
    assert.deepEqual(values.cpu, {value: '25%', detail: 'Processor use', progress: 0.25});
    assert.equal(values.memory.value, '50%');
    assert.equal(values.disk.value, '1.0 GB');
    assert.equal(values.battery.detail, 'Charging');
    assert.equal(todayMetricValues().cpu.detail, 'Sampling processor');
    assert.equal(formatMinutesSeconds(65.9), '1:05');
});
