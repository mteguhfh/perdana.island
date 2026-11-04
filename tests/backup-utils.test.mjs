import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BACKUP_APP,
    BACKUP_FORMAT,
    buildBackup,
    backupFileName,
    validateBackup,
} from '../extension/backup-utils.js';

const NOW = new Date('2026-10-31T12:00:00Z');

test('nested backup round trip retains supported data and omits machine-local state', () => {
    const backup = buildBackup({
        tasks: [
            {id: 't1', text: 'Call mom', due: 300, dueDate: '2026-11-01', priority: 'high'},
            {text: 'Invalid date', dueDate: '2026-02-30'},
            {text: '   '},
        ],
        notes: [{id: 'n1', text: 'Ideas', updated: 100}],
        preferences: {glass: true, accentColor: '#35A7C8', keepAwake: true},
        focusLog: {'2026-10-31': 1200, '2026-13-45': 400},
    }, {now: NOW, version: 'v79'});

    assert.equal(backup.app, BACKUP_APP);
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.appVersion, 'v79');
    assert.equal(backup.data.preferences.keepAwake, undefined);
    assert.equal(backup.data.tasks.length, 2);
    assert.equal(backup.data.notes[0].updatedAt, 100);

    const result = validateBackup(JSON.stringify(backup));
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.focusLog, {'2026-10-31': 1200});
    assert.equal(result.data.tasks[0].dueDate, '2026-11-01');
    assert.equal(result.data.tasks[1].dueDate, null);
    assert.equal(result.data.preferences.accentColor, '#35A7C8');
    assert.equal(result.data.preferences.keepAwake, undefined);
    assert.deepEqual(result.summary, {tasks: 2, notes: 1, focusDays: 1, settings: true});
});

test('flat backups from the existing local format remain restorable', () => {
    const legacy = {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        tasks: [{id: 'old-task', text: 'Keep this task', due: 600}],
        notes: [{id: 'old-note', text: 'Keep this note', updated: 50}],
        preferences: {theme: 'classic', keepAwake: true},
        focusLog: {'2026-10-30': 60},
    };
    const result = validateBackup(JSON.stringify(legacy));
    assert.equal(result.ok, true);
    assert.equal(result.data.tasks[0].text, 'Keep this task');
    assert.equal(result.data.notes[0].updatedAt, 50);
    assert.equal(result.data.preferences.theme, 'classic');
    assert.equal(result.data.preferences.keepAwake, undefined);
});

test('backup rejects wrong apps, malformed data, empty payloads and future formats', () => {
    assert.equal(validateBackup('').ok, false);
    assert.equal(validateBackup('{broken').ok, false);
    assert.equal(validateBackup(JSON.stringify({app: 'other'})).ok, false);
    assert.equal(validateBackup(JSON.stringify({app: BACKUP_APP, format: BACKUP_FORMAT + 1})).ok, false);
    assert.equal(validateBackup(JSON.stringify({app: BACKUP_APP, format: BACKUP_FORMAT, data: {}})).ok, false);
    assert.equal(validateBackup(JSON.stringify({app: BACKUP_APP, format: BACKUP_FORMAT, data: []})).ok, false);
});

test('backup validation drops impossible dates and out-of-range task minutes', () => {
    const value = {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        data: {
            tasks: [{text: 'Bad schedule', due: 1440, dueDate: '2026-02-30'}],
            notes: [],
            preferences: {},
            focusLog: {},
        },
    };
    const result = validateBackup(JSON.stringify(value));
    assert.equal(result.ok, true);
    assert.equal(result.data.tasks[0].due, null);
    assert.equal(result.data.tasks[0].dueDate, null);
});

test('backup rejects content over the byte limit and names files by local calendar date', () => {
    assert.equal(validateBackup(' '.repeat(5 * 1024 * 1024 + 1)).ok, false);
    assert.equal(backupFileName(new Date(2026, 9, 31)), 'perdana-island-backup-2026-10-31.json');
});
