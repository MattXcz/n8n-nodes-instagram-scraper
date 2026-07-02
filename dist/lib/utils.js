"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = void 0;
class Utils {
    static async executeWithRetry(operation, options = {}) {
        const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                if (attempt === maxRetries - 1) {
                    throw error;
                }
                const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                await this.delay(delay);
            }
        }
        throw new Error('Maximum retries exceeded');
    }
    static async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    static async randomDelay(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await this.delay(delay);
    }
    static formatError(error) {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error occurred';
    }
    static isRateLimitError(error) {
        const errorMsg = this.formatError(error).toLowerCase();
        return (errorMsg.includes('rate limit') ||
            errorMsg.includes('too many requests') ||
            errorMsg.includes('429'));
    }
    static extractShortcode(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }
        const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        return match ? match[1] : null;
    }
    static shortcodeToMediaId(shortcode) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let mediaId = BigInt(0);
        for (const char of shortcode) {
            const index = alphabet.indexOf(char);
            if (index === -1) {
                throw new Error(`Invalid character "${char}" in shortcode "${shortcode}"`);
            }
            mediaId = mediaId * BigInt(64) + BigInt(index);
        }
        return mediaId.toString();
    }
    static formatTimestamp(timestamp) {
        try {
            return new Date(timestamp * 1000).toISOString();
        }
        catch {
            return new Date().toISOString();
        }
    }
    static bestImageUrl(imageVersions2) {
        if (!imageVersions2 || !imageVersions2.candidates || imageVersions2.candidates.length === 0) {
            return '';
        }
        return imageVersions2.candidates.reduce((best, current) => current.width > best.width ? current : best).url;
    }
}
exports.Utils = Utils;
//# sourceMappingURL=utils.js.map