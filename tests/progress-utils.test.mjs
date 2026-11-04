import test from 'node:test';
import assert from 'node:assert/strict';

import {
    aria2TotalLength,
    cleanActivityIcon,
    cleanActivityText,
    downloadTitle,
    formatActivityDetail,
    formatActivityValue,
    isAria2Control,
    normalizeProgress,
    partialSuffix,
    selectActivity,
    activityId,
    activitySnapshot,
    finishActivity,
    normalizeActivity,
    updateActivity,
} from '../extension/progress-utils.js';

test('activity input is bounded and progress stays in range', () => {
    assert.equal(cleanActivityText('  one\ntwo  '), 'one two');
    assert.equal(cleanActivityIcon('../bad icon'), 'folder-download-symbolic');
    assert.equal(normalizeProgress(-1), null);
    assert.equal(normalizeProgress(Number.NaN), null);
    assert.equal(normalizeProgress(1.4), 1);
});

test('partial suffixes and aria2 control names resolve to the output filename', () => {
    assert.equal(partialSuffix('report.pdf.crdownload'), '.crdownload');
    assert.equal(downloadTitle('report.pdf.part'), 'report.pdf');
    assert.equal(isAria2Control('report.pdf.aria2'), true);
    assert.equal(downloadTitle('report.pdf.aria2'), 'report.pdf');
});

test('activity details use measured progress and transfer size', () => {
    assert.equal(formatActivityValue({progress: 0.5}), '50%');
    assert.equal(formatActivityDetail({bytes: 1024, total: 2048, speedBytes: 512}),
        '1 KB of 2 KB · 512 B/s');
    assert.equal(formatActivityDetail({state: 'running', sub: 'Preparing'}), 'Preparing');
});

test('compact activity selects the oldest currently running item', () => {
    assert.equal(selectActivity([
        {id: 'new', state: 'running', startedAt: 20},
        {id: 'done', state: 'done', startedAt: 1},
        {id: 'old', state: 'running', startedAt: 10},
    ]).id, 'old');
    assert.equal(selectActivity([{state: 'done'}]), null);
});

test('aria2 total length parser rejects malformed control files', () => {
    const bytes = new Uint8Array(38);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 1, false);
    view.setUint32(6, 0, false);
    view.setBigUint64(14, 8192n, false);
    assert.equal(aria2TotalLength(bytes), 8192);
    view.setUint16(0, 2, false);
    assert.equal(aria2TotalLength(bytes), null);
    assert.equal(aria2TotalLength(new Uint8Array(8)), null);
});

test('activity lifecycle helpers normalize, update, finish, and snapshot state', () => {
    const started = normalizeActivity({id: 'job', title: ' Build\napp ', progress: .4}, {
        id: activityId('job'), now: 1000,
    });
    assert.equal(started.id, 'app:job');
    assert.equal(started.sub, '');
    assert.equal(started.startedAt, 1000);
    const updated = updateActivity(started, {progress: .8, bytes: 80}, 1100);
    assert.equal(updated.progress, .8);
    assert.equal(updated.bytes, 80);
    const finished = finishActivity(updated, true, 1200);
    assert.equal(finished.state, 'done');
    assert.equal(finished.progress, 1);
    assert.deepEqual(activitySnapshot([finished])[0], {
        id: 'app:job', title: 'Build app', subtitle: '', icon: 'folder-download-symbolic',
        progress: 1, receivedBytes: 80, totalBytes: 0, source: 'app', state: 'done',
        startedAt: 1000, updatedAt: 1200, finishedAt: 1200,
    });
});
