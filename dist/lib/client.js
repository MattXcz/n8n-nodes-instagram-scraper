"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramClient = void 0;
const instagram_private_api_1 = require("instagram-private-api");
const utils_1 = require("./utils");
class InstagramClient {
    constructor(credentials) {
        this.isAuthenticated = false;
        this.client = new instagram_private_api_1.IgApiClient();
        if (credentials) {
            this.client.state.generateDevice('instagram_user');
            if (credentials.proxyUrl) {
                this.client.state.proxyUrl = credentials.proxyUrl;
            }
        }
    }
    async authenticate(credentials) {
        try {
            if (credentials.proxyUrl) {
                this.client.state.proxyUrl = credentials.proxyUrl;
            }
            if (!credentials.sessionData) {
                throw new Error('Session data is required. Extract it from a logged-in browser session (sessionid + csrftoken cookies) and paste it as JSON.');
            }
            try {
                const sessionData = typeof credentials.sessionData === 'string'
                    ? JSON.parse(credentials.sessionData)
                    : credentials.sessionData;
                await this.client.state.deserialize(sessionData);
                const userInfo = await this.client.user.info(this.client.state.cookieUserId);
                void userInfo;
                this.isAuthenticated = true;
                return;
            }
            catch (sessionError) {
                throw new Error(`Invalid or expired session data. Please extract a fresh session and update your credentials. Error: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}`);
            }
        }
        catch (error) {
            this.isAuthenticated = false;
            if (error instanceof Error) {
                const errorMessage = error.message.toLowerCase();
                if (errorMessage.includes('login_required') || errorMessage.includes('unauthorized')) {
                    throw new Error('Session expired or invalid. Extract a fresh session and update your credentials.');
                }
                else if (errorMessage.includes('challenge_required')) {
                    throw new Error('Instagram session requires verification. Log in through the app, complete any challenge, then extract a fresh session.');
                }
                else if (errorMessage.includes('checkpoint_required')) {
                    throw new Error('Instagram account requires verification. Complete it in the app, wait 24-48h, then extract a fresh session.');
                }
                else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
                    throw new Error('Rate limited by Instagram. Wait a few hours and try again.');
                }
                throw error;
            }
            throw new Error('Authentication failed: Unknown error occurred.');
        }
    }
    async authenticateWithRetry(credentials, maxRetries = 3) {
        var _a;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 1) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await utils_1.Utils.delay(delay);
                }
                await this.authenticate(credentials);
                return;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (lastError.message.includes('challenge_required') ||
                    lastError.message.includes('checkpoint_required')) {
                    throw lastError;
                }
            }
        }
        throw new Error(`Authentication failed after ${maxRetries} attempts. Last error: ${(_a = lastError === null || lastError === void 0 ? void 0 : lastError.message) !== null && _a !== void 0 ? _a : 'Unknown error'}`);
    }
    ensureAuthenticated() {
        if (!this.isAuthenticated) {
            throw new Error('Client is not authenticated. Please call authenticate() first.');
        }
    }
    async getUserInfo(username) {
        this.ensureAuthenticated();
        try {
            const user = await this.client.user.searchExact(username);
            const userInfo = await this.client.user.info(user.pk);
            return {
                pk: user.pk.toString(),
                username: user.username,
                full_name: user.full_name,
                profile_pic_url: user.profile_pic_url,
                is_verified: user.is_verified || false,
                follower_count: userInfo.follower_count || 0,
                following_count: userInfo.following_count || 0,
                media_count: userInfo.media_count || 0,
                biography: userInfo.biography || '',
                is_private: userInfo.is_private || false,
            };
        }
        catch (error) {
            throw new Error(`Failed to get user info: ${utils_1.Utils.formatError(error)}`);
        }
    }
    async getTimelineFeed(maxId) {
        this.ensureAuthenticated();
        try {
            const feed = this.client.feed.timeline();
            const response = await feed.request();
            return {
                items: response.feed_items.map((item) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
                    return ({
                        id: ((_a = item.media) === null || _a === void 0 ? void 0 : _a.id) || item.id,
                        code: ((_b = item.media) === null || _b === void 0 ? void 0 : _b.code) || item.code,
                        taken_at: ((_c = item.media) === null || _c === void 0 ? void 0 : _c.taken_at) || item.taken_at,
                        media_type: ((_d = item.media) === null || _d === void 0 ? void 0 : _d.media_type) || item.media_type,
                        caption: ((_e = item.media) === null || _e === void 0 ? void 0 : _e.caption) ? { text: item.media.caption.text } : null,
                        like_count: ((_f = item.media) === null || _f === void 0 ? void 0 : _f.like_count) || 0,
                        comment_count: ((_g = item.media) === null || _g === void 0 ? void 0 : _g.comment_count) || 0,
                        user: {
                            id: ((_k = (_j = (_h = item.media) === null || _h === void 0 ? void 0 : _h.user) === null || _j === void 0 ? void 0 : _j.pk) === null || _k === void 0 ? void 0 : _k.toString()) || ((_m = (_l = item.user) === null || _l === void 0 ? void 0 : _l.pk) === null || _m === void 0 ? void 0 : _m.toString()),
                            username: ((_p = (_o = item.media) === null || _o === void 0 ? void 0 : _o.user) === null || _p === void 0 ? void 0 : _p.username) || ((_q = item.user) === null || _q === void 0 ? void 0 : _q.username),
                            full_name: ((_s = (_r = item.media) === null || _r === void 0 ? void 0 : _r.user) === null || _s === void 0 ? void 0 : _s.full_name) || ((_t = item.user) === null || _t === void 0 ? void 0 : _t.full_name),
                        },
                    });
                }),
                more_available: response.more_available || false,
                next_max_id: response.next_max_id,
            };
        }
        catch (error) {
            throw new Error(`Failed to get timeline feed: ${utils_1.Utils.formatError(error)}`);
        }
    }
    async getMediaInfo(mediaId) {
        var _a, _b;
        this.ensureAuthenticated();
        try {
            const media = await this.client.media.info(mediaId);
            const item = media.items[0];
            return {
                id: item.id,
                code: item.code,
                taken_at: item.taken_at,
                media_type: item.media_type,
                like_count: item.like_count,
                comment_count: item.comment_count,
                view_count: item.view_count,
                play_count: item.play_count,
                caption: (_b = (_a = item.caption) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : null,
                user: {
                    pk: item.user.pk.toString(),
                    username: item.user.username,
                    full_name: item.user.full_name,
                },
                image_versions2: item.image_versions2,
                video_versions: item.video_versions || [],
                carousel_media: item.carousel_media,
            };
        }
        catch (error) {
            throw new Error(`Failed to get media info: ${utils_1.Utils.formatError(error)}`);
        }
    }
    async getPostByUrl(url) {
        var _a, _b, _c, _d, _e, _f;
        this.ensureAuthenticated();
        const shortcode = utils_1.Utils.extractShortcode(url);
        if (!shortcode) {
            throw new Error(`Could not find a post/reel shortcode in URL "${url}". Expected something like https://www.instagram.com/reel/SHORTCODE/`);
        }
        const mediaId = utils_1.Utils.shortcodeToMediaId(shortcode);
        const info = await this.getMediaInfo(mediaId);
        const mediaTypeMap = {
            1: 'photo',
            2: 'video',
            8: 'carousel',
        };
        const mediaType = (_a = mediaTypeMap[info.media_type]) !== null && _a !== void 0 ? _a : 'unknown';
        const isVideo = mediaType === 'video';
        let thumbnail = utils_1.Utils.bestImageUrl(info.image_versions2);
        if (!thumbnail && info.carousel_media && info.carousel_media.length > 0) {
            thumbnail = utils_1.Utils.bestImageUrl(info.carousel_media[0].image_versions2);
        }
        const caption = (_b = info.caption) !== null && _b !== void 0 ? _b : '';
        const firstLine = caption.split('\n')[0].trim();
        return {
            url,
            shortcode,
            mediaId,
            title: firstLine || caption.slice(0, 100) || `Instagram post by @${info.user.username}`,
            description: caption,
            thumbnail,
            isVideo,
            mediaType,
            likeCount: (_c = info.like_count) !== null && _c !== void 0 ? _c : 0,
            commentCount: (_d = info.comment_count) !== null && _d !== void 0 ? _d : 0,
            viewCount: (_f = (_e = info.view_count) !== null && _e !== void 0 ? _e : info.play_count) !== null && _f !== void 0 ? _f : null,
            author: info.user.username,
            authorFullName: info.user.full_name,
            takenAt: utils_1.Utils.formatTimestamp(info.taken_at),
            takenAtTimestamp: info.taken_at,
        };
    }
    async saveSession() {
        try {
            return JSON.stringify(await this.client.state.serialize());
        }
        catch (error) {
            throw new Error(`Failed to save session: ${utils_1.Utils.formatError(error)}`);
        }
    }
    async loadSession(sessionData) {
        try {
            const parsed = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
            await this.client.state.deserialize(parsed);
            this.isAuthenticated = true;
        }
        catch (error) {
            this.isAuthenticated = false;
            throw new Error(`Failed to load session: ${utils_1.Utils.formatError(error)}`);
        }
    }
}
exports.InstagramClient = InstagramClient;
//# sourceMappingURL=client.js.map