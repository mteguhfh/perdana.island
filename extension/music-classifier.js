const SPOKEN_CONTENT = /\b(podcast|episode|movie|film|tv show|series|documentary|news|interview|talk show|webinar|audiobook|trailer)\b/i;
const SPOKEN_GENRE = /\b(podcast|spoken word|talk|news|audiobook|interview|comedy|speech)\b/i;
const SPOKEN_TYPES = new Set([
    'podcast', 'episode', 'movie', 'film', 'tv', 'television', 'news', 'talk',
    'audiobook', 'spoken-word',
]);
const MUSIC_TYPES = new Set(['music', 'song', 'track', 'audio/music']);
const MUSIC_SERVICES = /\b(spotify|youtube music|deezer|soundcloud|apple music|tidal|amazon music|bandcamp|pandora|qobuz|napster)\b|music\.(?:youtube|apple|amazon)\.com/i;
const VIDEO_SERVICES = /\b(netflix|prime video|amazon prime video|disney\s*\+|hulu|hbo max|max\.com|crunchyroll)\b/i;
const SOCIAL_SERVICES = /\b(twitter|x \/ twitter)\b|(?:^|[/.])x\.com(?:[/?:\s]|$)/i;
const YOUTUBE = /\byoutube(?: music)?\b|youtube\.com|youtu\.be/i;
const YOUTUBE_MUSIC_TITLE = /\b(official audio|official music video|music video|lyrics video|audio track)\b/i;

function text(value) {
    if (Array.isArray(value))
        return value.filter(item => typeof item === 'string').join(' ');
    return typeof value === 'string' ? value : '';
}

export function classifyMedia(media, {enabled = true, requirePlaying = true} = {}) {
    if (!enabled)
        return {kind: 'ignored', reason: 'Smart music detection is off.'};
    if (!media || (requirePlaying && media.playbackStatus !== 'Playing'))
        return {kind: 'ignored', reason: 'There is no media currently playing.'};

    const source = text(media.source).trim();
    const title = text(media.title).trim();
    const artist = text(media.artist).trim();
    const genre = text(media.genre).trim();
    const contentType = text(media.contentType).trim().toLowerCase();
    const mediaHint = [source, media.url, media.desktopEntry, media.trackId]
        .map(value => text(value).trim())
        .filter(Boolean)
        .join(' ');

    if (VIDEO_SERVICES.test(mediaHint))
        return {kind: 'ignored', reason: 'A video streaming service is not treated as music.'};
    if (SOCIAL_SERVICES.test(mediaHint))
        return {kind: 'ignored', reason: 'Social timeline video is not treated as music.'};
    if (SPOKEN_TYPES.has(contentType))
        return {kind: 'ignored', reason: `The player identifies this as ${contentType} content.`};
    if (SPOKEN_GENRE.test(genre))
        return {kind: 'ignored', reason: 'The media genre identifies spoken or podcast content.'};
    // A provider with a strong music identity can legitimately use film words
    // in song titles (for example, a soundtrack release). Keep title-only
    // heuristics for ambiguous browser/media sessions instead.
    if (SPOKEN_CONTENT.test(title) && !MUSIC_SERVICES.test(mediaHint))
        return {kind: 'ignored', reason: 'The title identifies podcast, episode, film, or spoken content.'};
    if (/\b(podcast|episode)\b/i.test(text(media.trackId)))
        return {kind: 'ignored', reason: 'The media identifier marks this as an episode.'};

    if (MUSIC_TYPES.has(contentType) || genre)
        return {kind: 'music', reason: 'The player supplies music metadata.'};

    const youtubeTitleSource = /\s[-|·]\s*youtube(?: music)?$/i.test(title);
    const durationSeconds = Number(media.durationSeconds) || 0;
    const plausibleTrackLength = durationSeconds === 0 || durationSeconds <= 20 * 60;
    if ((MUSIC_SERVICES.test(mediaHint) || youtubeTitleSource) && title && artist
        && plausibleTrackLength)
        return {kind: 'music', reason: 'A known music service supplies a track and artist.'};

    if (title && YOUTUBE_MUSIC_TITLE.test(title))
        return {kind: 'music', reason: 'The media title strongly identifies a song.'};

    // Browser sessions may omit content type; a plausible track with an artist is enough.
    if (YOUTUBE.test(mediaHint) && title && artist
        && durationSeconds >= 20 && durationSeconds <= 15 * 60)
        return {kind: 'music', reason: 'YouTube supplies artist and track-length metadata.'};

    if (title && artist && text(media.album).trim()
        && durationSeconds >= 20 && durationSeconds <= 15 * 60)
        return {kind: 'music', reason: 'The player supplies complete track metadata.'};

    return {kind: 'ignored', reason: 'Media type is unclear, so it is left out of the music island.'};
}
