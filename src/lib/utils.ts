import { RetryOptions, IInstagramPostSummary, IInstagramRawComment, IInstagramTopComment } from './types';

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
		return (
			errorMsg.includes('rate limit') ||
			errorMsg.includes('too many requests') ||
			errorMsg.includes('429')
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
			likeCount: top.comment_like_count ?? 0,
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

	/**
	 * Best-effort extraction of post/reel metadata from the raw HTML of an
	 * authenticated instagram.com page load. Used as a fallback when the
	 * mobile private API is blocked by a `checkpoint_required` response.
	 *
	 * Instagram's Open Graph meta tags are the most stable part of the page
	 * to parse; the "X likes, Y comments - username on DATE: "caption""
	 * pattern in og:description is also long-standing, but may not always
	 * match (e.g. if likes are hidden) - in that case counts default to 0.
	 */
	static parsePostHtml(html: string, url: string, shortcode: string): IInstagramPostSummary {
		const metaContent = (property: string): string => {
			const re = new RegExp(`<meta property="${property}"\\s+content="([^"]*)"`, 'i');
			const match = html.match(re);
			return match ? this.decodeHtmlEntities(match[1]) : '';
		};

		const ogTitle = metaContent('og:title');
		const ogDescription = metaContent('og:description');
		const thumbnail = metaContent('og:image');
		const isVideo = /<meta property="og:video/i.test(html) || /\/reel[s]?\//i.test(url);

		let likeCount = 0;
		let commentCount = 0;
		let author = '';
		let caption = ogDescription;

		const statsMatch = ogDescription.match(
			/^([\d.,KkMm]+)\s+likes?,\s+([\d.,KkMm]+)\s+comments?\s*-\s*([a-zA-Z0-9._]+)\s+on\s+[^:]+:\s*"?([\s\S]*?)"?$/,
		);
		if (statsMatch) {
			likeCount = this.parseCompactNumber(statsMatch[1]);
			commentCount = this.parseCompactNumber(statsMatch[2]);
			author = statsMatch[3];
			caption = statsMatch[4];
		}

		return {
			url,
			shortcode,
			mediaId: '',
			title: ogTitle || caption.split('\n')[0].trim() || 'Instagram post',
			description: caption,
			thumbnail,
			videoUrl: null,
			isVideo,
			mediaType: isVideo ? 'video' : 'photo',
			likeCount,
			commentCount,
			viewCount: null,
			topComment: null,
			author,
			authorFullName: '',
			takenAt: '',
			takenAtTimestamp: 0,
		};
	}
}
