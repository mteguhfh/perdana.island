import test from 'node:test';
import assert from 'node:assert/strict';
import {
    dropEmptyNotes,
    normalizeNotes,
    noteDateText,
    notePreview,
    notesStatusLine,
    noteTitle,
    noteWordCount,
    trimNoteText,
} from '../extension/note-domain.js';

test('note normalization rejects invalid rows, clips text, sorts, and limits', () => {
    const notes = normalizeNotes([
        {id: 'old', text: 'old', updatedAt: 1},
        {id: 'new', text: 'new', updatedAt: 3},
        {id: 'invalid', text: 42},
    ], {now: 10});
    assert.deepEqual(notes.map(note => note.id), ['new', 'old']);
    assert.equal(normalizeNotes(null).length, 0);
});

test('titles and previews describe empty, single-line, and multiline notes', () => {
    assert.equal(noteTitle({text: ''}), 'Empty note');
    assert.equal(noteTitle({text: '  First line  \nSecond'}), 'First line');
    assert.equal(notePreview({text: ''}), 'No text yet');
    assert.equal(notePreview({text: 'Single'}), 'Single line');
    assert.equal(notePreview({text: 'Title\nDetails here'}), 'Details here');
});

test('note status, word count, trimming, and empty cleanup remain stable', () => {
    assert.equal(noteWordCount(' one  two\nthree '), 3);
    assert.equal(notesStatusLine('Saved locally', {text: 'one two'}), 'Saved locally · 2 words');
    assert.equal(notesStatusLine('Saving…', null), 'Saving…');
    assert.equal(trimNoteText('x'.repeat(12001)).length, 12000);
    const result = dropEmptyNotes([
        {id: 'empty', text: ' ', updatedAt: 3},
        {id: 'kept', text: 'Keep', updatedAt: 1},
    ], 'empty');
    assert.deepEqual(result, {
        notes: [{id: 'kept', text: 'Keep', updatedAt: 1}],
        selectedId: 'kept',
    });
});

test('note date text uses time for today and date otherwise', () => {
    const now = new Date(2026, 10, 2, 15, 30);
    assert.equal(noteDateText(now.getTime(), now), '15:30');
    assert.equal(noteDateText(new Date(2026, 10, 1, 15, 30).getTime(), now), '01 Nov');
});
