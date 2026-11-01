import test from 'node:test';
import assert from 'node:assert/strict';

import {classifyMedia} from '../extension/music-classifier.js';

const playing = {playbackStatus: 'Playing'};

test('known services and clear track metadata are recognized as music', () => {
    assert.equal(classifyMedia({...playing, source: 'Spotify', title: 'Song', artist: 'Artist'}).kind, 'music');
    assert.equal(classifyMedia({...playing, source: 'YouTube Music', title: 'Song', artist: 'Artist'}).kind, 'music');
});

test('podcasts, films, social clips, ambiguous and paused media stay out of the music island', () => {
    assert.equal(classifyMedia({...playing, source: 'Spotify', title: 'Episode 3', artist: 'Host'}).kind, 'ignored');
    assert.equal(classifyMedia({...playing, source: 'Netflix', title: 'Film', artist: ''}).kind, 'ignored');
    assert.equal(classifyMedia({...playing, source: 'https://x.com', title: 'Video', artist: 'Creator'}).kind, 'ignored');
    assert.equal(classifyMedia({...playing, source: 'Unknown player', title: 'Clip'}).kind, 'ignored');
    assert.equal(classifyMedia({playbackStatus: 'Paused', source: 'Spotify', title: 'Song', artist: 'Artist'}).kind, 'ignored');
});
