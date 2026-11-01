import test from 'node:test';
import assert from 'node:assert/strict';

import {parseCapture} from '../extension/quick-capture.js';

const NOW = new Date(2026, 9, 31, 9, 30, 0);

test('Indonesian relative date, time and priority are parsed without losing the title', () => {
    const result = parseCapture('Telepon ibu besok jam 5 penting', NOW);
    assert.equal(result.title, 'Telepon ibu');
    assert.equal(result.day.getFullYear(), 2026);
    assert.equal(result.day.getMonth(), 10);
    assert.equal(result.day.getDate(), 1);
    assert.deepEqual(result.time, {h: 5, m: 0});
    assert.equal(result.priority, 'High');
});

test('English clock time stays on today when it is still ahead', () => {
    const result = parseCapture('Call mom at 5pm', NOW);
    assert.equal(result.title, 'Call mom');
    assert.equal(result.day.getDate(), 31);
    assert.deepEqual(result.time, {h: 17, m: 0});
});

test('date-only phrases keep a useful task title', () => {
    const result = parseCapture('Rapat desain besok sore', NOW);
    assert.equal(result.title, 'Rapat desain');
    assert.equal(result.day.getDate(), 1);
    assert.equal(result.period, 'sore');
});

test('a phrase made only from schedule words is not saved as a blank task', () => {
    const raw = 'besok jam 8';
    assert.equal(parseCapture(raw, NOW).title, raw);
});

test('invalid calendar dates are retained as text instead of rolling into another month', () => {
    const result = parseCapture('Rapat 32 November jam 10', NOW);
    assert.match(result.title, /32 November/);
});

test('note capture and priority markers stay distinct from tasks', () => {
    const note = parseCapture('Catatan: beli susu', NOW);
    const task = parseCapture('Kirim laporan !low', NOW);
    assert.equal(note.mode, 'note');
    assert.equal(note.title, 'beli susu');
    assert.equal(task.mode, 'task');
    assert.equal(task.title, 'Kirim laporan');
    assert.equal(task.priority, 'Low');
});

test('English weekday, period, clock punctuation and urgency are parsed like Quick Capture PR', () => {
    const result = parseCapture('Call dentist Friday at 5.30pm urgent', NOW);
    assert.equal(result.title, 'Call dentist');
    assert.equal(result.day.getDate(), 6);
    assert.equal(result.time.h, 17);
    assert.equal(result.time.m, 30);
    assert.equal(result.priority, 'High');
});

test('period-only capture uses its default time and explicit dates remain calendar-valid', () => {
    const period = parseCapture('Rapat desain besok sore', NOW);
    assert.equal(period.day.getDate(), 1);
    assert.deepEqual(period.time, {h: 16, m: 0});
    assert.equal(period.period, 'sore');

    const leapDay = parseCapture('Selesaikan laporan 29 Februari', NOW);
    assert.equal(leapDay.title, 'Selesaikan laporan');
    assert.equal(leapDay.day.getFullYear(), 2028);
    assert.equal(leapDay.day.getMonth(), 1);
    assert.equal(leapDay.day.getDate(), 29);
});

test('note suffix and invalid clock values stay safe and visible', () => {
    const note = parseCapture('Beli susu besok /note', NOW);
    assert.equal(note.mode, 'note');
    assert.equal(note.title, 'Beli susu');
    assert.equal(note.day.getDate(), 1);

    const invalid = parseCapture('Rapat jam 10:75', NOW);
    assert.equal(invalid.title, 'Rapat jam 10:75');
    assert.equal(invalid.time, null);
});
