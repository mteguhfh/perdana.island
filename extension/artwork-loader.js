// Artwork resolution and caching for album art in the media surfaces.
import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const REMOTE_CACHE_LIMIT = 24;
const ROUNDED_CACHE_LIMIT = 72;

export class ArtworkLoader {
    constructor({isEnabled = () => true} = {}) {
        this._isEnabled = isEnabled;
        this.session = new Soup.Session();
        this.session.timeout = 10;
        this.requests = new Map();
        this.cache = new Map();
        this.roundedCache = new Map();
        this.cacheDirectory = null;
        this.files = new Set();
        this.evictionSources = new Set();
    }

    localArtIcon(artUrl) {
        if (typeof artUrl !== 'string' || !artUrl.startsWith('file://'))
            return null;
        try {
            return Gio.icon_new_for_string(artUrl);
        } catch (_error) {
            return null;
        }
    }

    clear(container, fallbackIcon, fallbackGicon) {
        container._perdanaArtworkUrl = null;
        for (const child of container.get_children()) {
            if (child !== fallbackIcon)
                child.destroy();
        }
        fallbackIcon.gicon = fallbackGicon;
        fallbackIcon.show();
    }

    load(container, fallbackIcon, artUrl, size, radius) {
        const source = typeof artUrl === 'string' ? artUrl.trim() : '';
        if (!source || source.length > 4096)
            return;

        container._perdanaArtworkUrl = source;
        const showArtwork = file => {
            let isCurrent = false;
            try {
                isCurrent = this._isEnabled()
                    && container._perdanaArtworkUrl === source
                    && Boolean(container.get_stage());
            } catch (_error) {
                return;
            }
            if (!isCurrent || !file)
                return;

            try {
                const roundedFile = this._roundedFile(file, size, radius);
                const artworkFile = roundedFile || file;
                const themeContext = St.ThemeContext.get_for_stage(global.stage);
                const texture = St.TextureCache.get_default().load_file_async(
                    artworkFile,
                    size,
                    size,
                    themeContext.scale_factor,
                    container.get_resource_scale()
                );
                texture.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;
                texture.x_align = Clutter.ActorAlign.CENTER;
                texture.y_align = Clutter.ActorAlign.CENTER;
                texture.set_size(size, size);
                texture.reactive = false;
                const revealArtwork = () => {
                    if (texture.content && container._perdanaArtworkUrl === source
                        && container.get_stage())
                        fallbackIcon.hide();
                };
                texture.connect('notify::content', revealArtwork);
                container.add_child(texture);
                revealArtwork();
            } catch (_error) {
                // Keep the generic artwork icon if the image cannot be decoded.
            }
        };

        if (source.toLowerCase().startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(source);
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    showArtwork(file);
                    return GLib.SOURCE_REMOVE;
                });
            } catch (_error) {
                // Keep the generic artwork icon for invalid local artwork URIs.
            }
            return;
        }
        if (!source.toLowerCase().startsWith('https://'))
            return;

        const cached = this.cache.get(source);
        if (cached && cached.query_exists(null)) {
            this.cache.delete(source);
            this.cache.set(source, cached);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                showArtwork(cached);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        let request = this.requests.get(source);
        if (request) {
            request.callbacks.push(showArtwork);
            return;
        }

        request = {cancellable: new Gio.Cancellable(), callbacks: [showArtwork]};
        this.requests.set(source, request);
        const message = Soup.Message.new('GET', source);
        if (!message) {
            this._finishRequest(source, null);
            return;
        }
        message.get_request_headers().append('Accept', 'image/jpeg,image/png,image/webp');
        this.session.send_async(
            message,
            GLib.PRIORITY_DEFAULT,
            request.cancellable,
            (session, result) => {
                let stream;
                try {
                    stream = session.send_finish(result);
                } catch (_error) {
                    this._finishRequest(source, null);
                    return;
                }

                const headers = message.get_response_headers();
                const contentType = (headers.get_one('Content-Type') || '')
                    .split(';', 1)[0].trim().toLowerCase();
                const contentLength = Number(headers.get_content_length());
                const finalUri = message.get_uri();
                const isHttps = finalUri?.get_scheme()?.toLowerCase() === 'https';
                if (message.get_status() < 200 || message.get_status() >= 300 || !isHttps
                    || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(contentType)
                    || (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_BYTES)) {
                    try {
                        stream.close(null);
                    } catch (_error) {
                        // The response stream may already be closed.
                    }
                    this._finishRequest(source, null);
                    return;
                }

                this._readStream(source, contentType, stream, request, [], 0);
            }
        );
    }

    _roundedFile(file, size, radius) {
        const path = file.get_path();
        if (!path || size < 2)
            return null;

        const key = `${path}\u001f${size}\u001f${radius}`;
        const cached = this.roundedCache.get(key);
        if (cached?.query_exists(null)) {
            this.roundedCache.delete(key);
            this.roundedCache.set(key, cached);
            return cached;
        }

        try {
            const source = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, size, size, true);
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
            const cr = new Cairo.Context(surface);
            const corner = Math.min(Math.round(radius), Math.floor(size / 2));
            const offsetX = Math.floor((size - source.width) / 2);
            const offsetY = Math.floor((size - source.height) / 2);

            if (!this.cacheDirectory)
                this.cacheDirectory = GLib.dir_make_tmp('perdana-island-art-XXXXXX');
            const digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, key, -1);
            const roundedPath = GLib.build_filenamev([
                this.cacheDirectory,
                `${digest}.png`,
            ]);

            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);
            cr.newPath();
            cr.moveTo(corner, 0);
            cr.lineTo(size - corner, 0);
            cr.arc(size - corner, corner, corner, -Math.PI / 2, 0);
            cr.lineTo(size, size - corner);
            cr.arc(size - corner, size - corner, corner, 0, Math.PI / 2);
            cr.lineTo(corner, size);
            cr.arc(corner, size - corner, corner, Math.PI / 2, Math.PI);
            cr.lineTo(0, corner);
            cr.arc(corner, corner, corner, Math.PI, Math.PI * 1.5);
            cr.closePath();
            cr.clip();
            Gdk.cairo_set_source_pixbuf(cr, source, offsetX, offsetY);
            cr.paint();
            cr.$dispose();
            surface.writeToPNG(roundedPath);

            const roundedFile = Gio.File.new_for_path(roundedPath);
            this.files.add(roundedPath);
            this.roundedCache.set(key, roundedFile);
            while (this.roundedCache.size > ROUNDED_CACHE_LIMIT) {
                const [oldKey, oldFile] = this.roundedCache.entries().next().value;
                this.roundedCache.delete(oldKey);
                try {
                    oldFile.delete(null);
                } catch (_error) {
                    // The texture cache may already have released the file.
                }
                this.files.delete(oldFile.get_path());
            }
            return roundedFile;
        } catch (_error) {
            return null;
        }
    }

    _readStream(artUrl, contentType, stream, request, chunks, totalSize) {
        stream.read_bytes_async(
            64 * 1024,
            GLib.PRIORITY_DEFAULT,
            request.cancellable,
            (input, result) => {
                let bytes;
                try {
                    bytes = input.read_bytes_finish(result);
                } catch (_error) {
                    try {
                        stream.close(null);
                    } catch (_closeError) {
                        // A cancelled response may already be closed.
                    }
                    this._finishRequest(artUrl, null);
                    return;
                }

                const data = bytes.get_data();
                if (!data.length) {
                    try {
                        stream.close(null);
                        if (!totalSize) {
                            this._finishRequest(artUrl, null);
                            return;
                        }
                        if (!this.cacheDirectory)
                            this.cacheDirectory = GLib.dir_make_tmp('perdana-island-art-XXXXXX');
                        const image = new Uint8Array(totalSize);
                        let offset = 0;
                        for (const chunk of chunks) {
                            const part = chunk.get_data();
                            image.set(part, offset);
                            offset += part.length;
                        }
                        const digest = GLib.compute_checksum_for_string(
                            GLib.ChecksumType.SHA256, artUrl, -1);
                        const extension = contentType === 'image/png' ? 'png'
                            : (contentType === 'image/webp' ? 'webp' : 'jpg');
                        const file = Gio.File.new_for_path(GLib.build_filenamev([
                            this.cacheDirectory,
                            `${digest}.${extension}`,
                        ]));
                        file.replace_contents(
                            image,
                            null,
                            false,
                            Gio.FileCreateFlags.REPLACE_DESTINATION,
                            null
                        );
                        this.files.add(file.get_path());
                        this.cache.set(artUrl, file);
                        while (this.cache.size > REMOTE_CACHE_LIMIT) {
                            const [oldUrl, oldFile] = this.cache.entries().next().value;
                            this.cache.delete(oldUrl);
                            let source = 0;
                            source = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                                this.evictionSources.delete(source);
                                if (![...this.cache.values()].some(cached => cached.equal(oldFile))) {
                                    try {
                                        oldFile.delete(null);
                                    } catch (_error) {
                                        // The file may already have been removed during shutdown.
                                    }
                                    this.files.delete(oldFile.get_path());
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                            this.evictionSources.add(source);
                        }
                        this._finishRequest(artUrl, file);
                    } catch (_error) {
                        this._finishRequest(artUrl, null);
                    }
                    return;
                }

                if (totalSize + data.length > MAX_REMOTE_BYTES) {
                    try {
                        request.cancellable.cancel();
                        stream.close(null);
                    } catch (_error) {
                        // Cancellation closes the response stream when needed.
                    }
                    this._finishRequest(artUrl, null);
                    return;
                }

                chunks.push(bytes);
                this._readStream(artUrl, contentType, stream, request,
                    chunks, totalSize + data.length);
            }
        );
    }

    _finishRequest(artUrl, file) {
        const request = this.requests.get(artUrl);
        if (!request)
            return;
        this.requests.delete(artUrl);
        for (const callback of request.callbacks)
            callback(file);
    }

    destroy() {
        for (const request of this.requests.values())
            request.cancellable.cancel();
        this.requests.clear();
        this.session?.abort();
        this.session = null;
        for (const source of this.evictionSources)
            GLib.source_remove(source);
        this.evictionSources.clear();
        for (const path of this.files) {
            try {
                Gio.File.new_for_path(path).delete(null);
            } catch (_error) {
                // The cache entry may already have been evicted.
            }
        }
        this.files.clear();
        this.cache.clear();
        this.roundedCache.clear();
        if (this.cacheDirectory) {
            try {
                Gio.File.new_for_path(this.cacheDirectory).delete(null);
            } catch (_error) {
                // The temporary directory can already be gone.
            }
            this.cacheDirectory = null;
        }
    }
}
