import { RetryOptions, IInstagramRawComment, IInstagramTopComment } from './types';

/**
 * Utility functions for Instagram n8n integration
 */
export class Utils {
	/**
	 * Execute a function with retry logic and exponential backoff
	 */
	static async executeWithRetry<T>(
		operation: () => Promise<T>,
		options: Partial<RetryOptions> = {},
	): Promise<T> {
		const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				if (attempt === maxRetries - 1) {
					throw error;
				}
				const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
				await this.delay(delay);
			}
		}
		throw new Error('Maximum retries exceeded');
	}

	/**
	 * Create a delay promise
	 */
	static async delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Generate random delay to avoid rate limiting
	 */
	static async randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
		const delay = Math.floor(Math.random() * (max - min + 1)) + min;
		await this.delay(delay);
	}

	/**
	 * Formats error messages consistently
	 */
	static formatError(error: any): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		return 'Unknown error occurred';
	}

	/**
	 * Checks if error is rate limit related
	 */
	static isRateLimitError(error: any): boolean {
		const errorMsg = this.formatError(error).toLowerCase();
		// Match 429 only as an HTTP status (e.g. "HTTP 429", "- 429 Too Many
		// Requests"), never as a bare substring: error messages here embed
		// numeric user IDs in URLs and raw response bodies, where "429" shows
		// up by coincidence and was misreported as a rate limit.
		return (
			errorMsg.includes('rate limit') ||
			errorMsg.includes('too many requests') ||
			errorMsg.includes('please wait a few minutes') ||
			/\bhttp 429\b/.test(errorMsg) ||
			/(?:^|[\s-])429 too many/.test(errorMsg) ||
			/status(?: code)?[:\s]+429\b/.test(errorMsg)
		);
	}

	/**
	 * Extracts the shortcode from an Instagram post/reel/tv URL.
	 * Supports:
	 *   https://www.instagram.com/p/SHORTCODE/
	 *   https://www.instagram.com/reel/SHORTCODE/
	 *   https://www.instagram.com/reels/SHORTCODE/
	 *   https://www.instagram.com/tv/SHORTCODE/
	 *   https://www.instagram.com/USERNAME/p/SHORTCODE/   (posts embedded under a profile path)
	 */
	static extractShortcode(url: string): string | null {
		if (!url || typeof url !== 'string') {
			return null;
		}
		const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
		return match ? match[1] : null;
	}

	/**
	 * Converts an Instagram shortcode (e.g. "DLwUswhN6Ax") into the numeric
	 * media PK that the private API's media.info() call expects.
	 *
	 * This is the same base64-like alphabet Instagram itself uses to derive
	 * shortcodes from media IDs, run in reverse. It only breaks if Instagram
	 * changes the alphabet, which is very rare (unlike the GraphQL doc_id,
	 * which rotates every few weeks).
	 */
	static shortcodeToMediaId(shortcode: string): string {
		const alphabet =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
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

	/**
	 * Formats timestamp to human readable date
	 */
	static formatTimestamp(timestamp: number): string {
		try {
			return new Date(timestamp * 1000).toISOString();
		} catch {
			return new Date().toISOString();
		}
	}

	/**
	 * Picks the highest-resolution candidate from an image_versions2 structure.
	 */
	static bestImageUrl(imageVersions2?: {
		candidates: Array<{ url: string; width: number; height: number }>;
	}): string {
		if (!imageVersions2 || !imageVersions2.candidates || imageVersions2.candidates.length === 0) {
			return '';
		}
		return imageVersions2.candidates.reduce((best, current) =>
			current.width > best.width ? current : best,
		).url;
	}

	/**
	 * Picks the highest-resolution candidate from a video_versions array.
	 * Unlike image_versions2, video_versions is a flat array (no "candidates"
	 * wrapper) and Instagram doesn't guarantee it's sorted by quality, so pick
	 * explicitly by width rather than assuming index 0 is the best one.
	 */
	static bestVideoUrl(videoVersions?: Array<{ url: string; width: number; height: number }>): string | null {
		if (!videoVersions || videoVersions.length === 0) {
			return null;
		}
		return videoVersions.reduce((best, current) => (current.width > best.width ? current : best)).url;
	}

	/**
	 * Determines whether an MP4 file contains an audio track by walking its
	 * top-level boxes to `moov` and looking for a `hdlr` box with handler
	 * type `soun`. Only the needed byte ranges are fetched via `readRange`
	 * (inclusive start/end), so usually just the first chunk of the file.
	 * Returns null if the structure couldn't be read.
	 */
	static async mp4HasAudio(
		readRange: (start: number, end: number) => Promise<Buffer>,
		chunkSize = 512 * 1024,
		maxMoovSize = 16 * 1024 * 1024,
	): Promise<boolean | null> {
		let bufStart = 0;
		let buf = await readRange(0, chunkSize - 1);
		const ensure = async (start: number, length: number): Promise<boolean> => {
			if (start >= bufStart && start + length <= bufStart + buf.length) return true;
			buf = await readRange(start, start + Math.max(length, chunkSize) - 1);
			bufStart = start;
			return length <= buf.length;
		};

		let offset = 0;
		for (let i = 0; i < 20; i++) {
			if (!(await ensure(offset, 16))) {
				if (!(await ensure(offset, 8))) return null;
			}
			const rel = offset - bufStart;
			let size = buf.readUInt32BE(rel);
			const type = buf.toString('latin1', rel + 4, rel + 8);
			if (size === 1) {
				if (rel + 16 > buf.length) return null;
				size = Number(buf.readBigUInt64BE(rel + 8));
			}
			if (type === 'moov') {
				if (size === 0 || size > maxMoovSize) return null;
				if (!(await ensure(offset, size))) return null;
				const moov = buf.subarray(offset - bufStart, offset - bufStart + size);
				let idx = moov.indexOf('hdlr', 0, 'latin1');
				while (idx !== -1) {
					// hdlr: [type 4][version+flags 4][pre_defined 4][handler_type 4]
					if (moov.toString('latin1', idx + 12, idx + 16) === 'soun') return true;
					idx = moov.indexOf('hdlr', idx + 4, 'latin1');
				}
				return false;
			}
			if (size < 8) return null; // size 0 (= to EOF) before moov, or corrupt
			offset += size;
		}
		return null;
	}

	/**
	 * Extracts the highest-bitrate audio-only track URL from Instagram's
	 * `video_dash_manifest` (MPEG-DASH XML). Returns null if there's no
	 * manifest or no audio track in it.
	 */
	static bestDashAudioUrl(manifest?: string | null): string | null {
		if (!manifest || typeof manifest !== 'string') return null;
		let best: { url: string; bandwidth: number } | null = null;
		const setRe = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
		let set: RegExpExecArray | null;
		while ((set = setRe.exec(manifest)) !== null) {
			const setIsAudio = /contentType="audio"|mimeType="audio\//i.test(set[1]);
			const repRe = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi;
			let rep: RegExpExecArray | null;
			while ((rep = repRe.exec(set[2])) !== null) {
				const isAudio = setIsAudio || /mimeType="audio\//i.test(rep[1]);
				if (!isAudio) continue;
				const urlMatch = rep[2].match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
				if (!urlMatch) continue;
				const bwMatch = rep[1].match(/bandwidth="(\d+)"/i);
				const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
				if (!best || bandwidth > best.bandwidth) {
					best = { url: this.decodeHtmlEntities(urlMatch[1].trim()), bandwidth };
				}
			}
		}
		return best ? best.url : null;
	}

	/**
	 * Flattens the first entry of Instagram's `preview_comments` (the
	 * top/pinned comments shown under a post, included with media info at no
	 * extra request) into a simple { text, author, likeCount } shape.
	 */
	static topCommentFromPreview(previewComments?: IInstagramRawComment[]): IInstagramTopComment | null {
		if (!previewComments || previewComments.length === 0) {
			return null;
		}
		const top = previewComments[0];
		if (!top || !top.text) {
			return null;
		}
		return {
			text: top.text,
			author: top.user?.username ?? '',
			likeCount: typeof top.comment_like_count === 'number' ? top.comment_like_count : null,
		};
	}

	/**
	 * Decodes HTML entities commonly found in meta tag content.
	 */
	static decodeHtmlEntities(text: string): string {
		return text
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&apos;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
	}

	/**
	 * Parses compact numbers like "12,345", "12.3K" or "1.2M" into an integer.
	 * Returns 0 if the input doesn't look like a number.
	 */
	static parseCompactNumber(text: string): number {
		if (!text) return 0;
		const cleaned = text.trim().replace(/,/g, '');
		const match = cleaned.match(/^([\d.]+)\s*([KkMm]?)$/);
		if (!match) return 0;
		const value = parseFloat(match[1]);
		if (isNaN(value)) return 0;
		const suffix = match[2].toLowerCase();
		if (suffix === 'k') return Math.round(value * 1000);
		if (suffix === 'm') return Math.round(value * 1000000);
		return Math.round(value);
	}

	/** Converts a CDN `oe` (hex unix seconds) parameter into an ISO date, or null. Same as the Facebook scraper. */
	static cdnUrlExpiry(url: string | null | undefined): string | null {
		if (!url) return null;
		const m = url.match(/[?&]oe=([0-9A-Fa-f]{8})\b/);
		if (!m) return null;
		const secs = parseInt(m[1], 16);
		return Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : null;
	}

	/** First non-empty caption line, max 120 chars. Same rule as the Facebook scraper. */
	static titleFromCaption(caption: string | null, max = 120): string | null {
		if (!caption) return null;
		const first = caption.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
		if (!first) return null;
		const chars = Array.from(first);
		return chars.length > max ? chars.slice(0, max - 1).join('').trimEnd() + '…' : first;
	}

	/** Finite number or null (never turns "missing" into 0). */
	static num(v: unknown): number | null {
		if (typeof v === 'number' && Number.isFinite(v)) return v;
		if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
		return null;
	}

	/**
	 * Maps an error to the same `errorCode` values the Facebook scraper uses,
	 * so error items from both nodes can be handled by one workflow branch.
	 * Returns null when the cause isn't recognizable.
	 */
	static errorCode(error: any): string | null {
		const m = this.formatError(error).toLowerCase();
		if (m.includes('could not find a post/reel shortcode')) return 'INVALID_URL';
		if (this.isRateLimitError(error)) return 'RATE_LIMITED';
		if (/checkpoint|challenge_required|\/challenge\//.test(m)) return 'VERIFICATION_REQUIRED';
		if (/login_required|\/accounts\/login|authentication failed|session (?:is )?(?:invalid|expired)|declined the request/.test(m)) return 'SESSION_EXPIRED';
		if (/media not found|not available|no media item|http 404|does not exist/.test(m)) return 'CONTENT_UNAVAILABLE';
		if (/fetch failed|enotfound|econnrefused|econnreset|etimedout|socket|tls/.test(m)) return 'NETWORK_ERROR';
		if (/\bhttp \d{3}\b/.test(m)) return 'HTTP_ERROR';
		return null;
	}
}
