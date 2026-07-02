import { RetryOptions } from './types';

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
}
