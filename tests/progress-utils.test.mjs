import assert from 'node:assert/strict';
import test from 'node:test';

import {
    aria2TotalLength,
    cleanActivityIcon,
    cleanActivityId,
    cleanActivityText,
    downloadTitle,
    formatActivityDetail,
    formatActivityValue,
    formatBytes,
    isAria2Control,
    isPartialFile,
    normalizeProgress,
    partialSuffix,
    selectActivity,
} from '../extension/progress-utils.js';

function aria2Control(totalLength, hashLength = 20) {
    const bytes = new Uint8Array(14 + hashLength + 8 + 8 + 4);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 1, false);
    view.setUint32(2, 0, false);
    view.setUint32(6, hashLength, false);
    view.setUint32(10 + hashLength, 1048576, false);
    view.setBigUint64(14 + hashLength, BigInt(totalLength), false);
    return bytes;
}

test('normalizes progress values and rejects negatives', () => {
    assert.equal(normalizeProgress(0), 0);
    assert.equal(normalizeProgress(0.42), 0.42);
    assert.equal(normalizeProgress(4), 1);
    assert.equal(normalizeProgress('0.25'), 0.25);
    assert.equal(normalizeProgress(-1), null);
    assert.equal(normalizeProgress(Number.NaN), null);
    assert.equal(normalizeProgress(undefined), null);
    assert.equal(normalizeProgress(''), null);
});

test('cleans activity text, ids, and icon names', () => {
    assert.equal(cleanActivityText('  Building\n\tindex  '), 'Building index');
    assert.equal(cleanActivityText('a'.repeat(130)).length, 120);
    assert.equal(cleanActivityId('  job-7  '), 'job-7');
    assert.equal(cleanActivityIcon('document-save-symbolic'), 'document-save-symbolic');
    assert.equal(cleanActivityIcon('bad icon'), 'folder-download-symbolic');
    assert.equal(cleanActivityIcon(''), 'folder-download-symbolic');
});

test('detects partial downloads and strips their suffix', () => {
    assert.equal(partialSuffix('movie.mp4.PART'), '.part');
    assert.equal(partialSuffix('report.pdf.crdownload'), '.crdownload');
    assert.equal(partialSuffix('archive.zip.download'), '.download');
    assert.equal(partialSuffix('clip.webm.opdownload'), '.opdownload');
    assert.equal(partialSuffix('movie.mp4'), null);
    assert.ok(isPartialFile('movie.mp4.part'));
    assert.ok(!isPartialFile('movie.mp4'));
    assert.ok(isAria2Control('movie.mp4.aria2'));
    assert.equal(downloadTitle('movie.mp4.part'), 'movie.mp4');
    assert.equal(downloadTitle('movie.mp4.aria2'), 'movie.mp4');
    assert.equal(downloadTitle('movie.mp4'), 'movie.mp4');
});

test('formats byte counts for the compact pill', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(900), '900 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(12 * 1024 * 1024), '12 MB');
    assert.equal(formatBytes(3.25 * 1024 * 1024 * 1024), '3.25 GB');
    assert.equal(formatBytes(-1), '');
    assert.equal(formatBytes('nope'), '');
});

test('formats activity values and details', () => {
    assert.equal(formatActivityValue({progress: 0.426}), '43%');
    assert.equal(formatActivityValue({progress: null, receivedBytes: 2048}), '2 KB');
    assert.equal(formatActivityValue({progress: null}), 'Working');
    assert.equal(
        formatActivityDetail({receivedBytes: 1048576, totalBytes: 4194304}),
        '1 MB of 4 MB'
    );
    assert.equal(formatActivityDetail({receivedBytes: 512}), 'Downloading');
    assert.equal(formatActivityDetail({subtitle: 'Copying photos', receivedBytes: 512}), 'Copying photos');
    assert.equal(formatActivityDetail({state: 'running'}), 'Running');
});

test('selects the oldest running activity and ignores finished rows', () => {
    const activities = [
        {id: 'b', state: 'running', startedAt: 20},
        {id: 'a', state: 'running', startedAt: 10},
        {id: 'done', state: 'done', startedAt: 5},
    ];
    assert.equal(selectActivity(activities).id, 'a');
    assert.equal(selectActivity([{id: 'x', state: 'done'}]), null);
    assert.equal(selectActivity([]), null);
    assert.equal(selectActivity(null), null);
});

test('reads the total length from an aria2 control file', () => {
    assert.equal(aria2TotalLength(aria2Control(5_000_000)), 5_000_000);
    assert.equal(aria2TotalLength(aria2Control(1, 32)), 1);
    assert.equal(aria2TotalLength(new Uint8Array(0)), null);
    assert.equal(aria2TotalLength(aria2Control(5_000_000).slice(0, 20)), null);
    const wrongVersion = aria2Control(5_000_000);
    new DataView(wrongVersion.buffer).setUint16(0, 2, false);
    assert.equal(aria2TotalLength(wrongVersion), null);
    assert.equal(aria2TotalLength(aria2Control(0)), null);
});
