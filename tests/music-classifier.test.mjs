import assert from 'node:assert/strict';
import test from 'node:test';

import {classifyMedia} from '../extension/music-classifier.js';

function cleanLyricsTitle(title) {
    return title
        .replace(/\s*[-–—]\s*from\s+["“][^"”]+["”]\s+(?:movie|film)\s*$/i, '')
        .replace(/\s*\(\s*from\s+["“][^"”]+["”]\s+(?:movie|film)\s*\)\s*$/i, '')
        .trim();
}

test('Spotify music remains music when the song title mentions a movie', () => {
    const result = classifyMedia({
        source: 'spotify',
        desktopEntry: 'org.mpris.MediaPlayer2.spotify',
        title: 'I Miss You Every Brand New Day - From "Spider-Man: Brand New Day" Movie',
        artist: 'For Revenge',
        album: 'I Miss You Every Brand New Day (From "Spider-Man: Brand New Day" Movie)',
        url: 'https://open.spotify.com/track/0I30Y8ENk7RLUsyFj9VElJ',
        durationSeconds: 240,
        playbackStatus: 'Playing',
    });

    assert.equal(result.kind, 'music');
});

test('ambiguous media with a movie title is still excluded', () => {
    const result = classifyMedia({
        source: 'browser',
        title: 'Spider-Man Movie',
        artist: 'Various Artists',
        playbackStatus: 'Playing',
    });

    assert.equal(result.kind, 'ignored');
});

test('cleans soundtrack attribution from lyric lookup titles', () => {
    assert.equal(
        cleanLyricsTitle('I Miss You Every Brand New Day - From "Spider-Man: Brand New Day" Movie'),
        'I Miss You Every Brand New Day'
    );
    assert.equal(
        cleanLyricsTitle('I Miss You Every Brand New Day (From "Spider-Man: Brand New Day" Movie)'),
        'I Miss You Every Brand New Day'
    );
});
