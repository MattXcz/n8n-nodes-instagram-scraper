import { IgApiClient } from 'instagram-private-api';
import {
	IInstagramCredentials,
	IInstagramMediaItem,
	IInstagramUser,
	IInstagramTimelineFeed,
	IInstagramMediaInfo,
	IInstagramPostSummary,
} from './types';
import { Utils } from './utils';

export class InstagramClient {
	private client: IgApiClient;
	private isAuthenticated: boolean = false;

	constructor(credentials?: IInstagramCredentials) {
		this.client = new IgApiClient();
		if (credentials) {
			// Generate a generic device since we don't have username
			this.client.state.generateDevice('instagram_user');
			if (credentials.proxyUrl) {
				this.client.state.proxyUrl = credentials.proxyUrl;
			}
		}
	}

	async authenticate(credentials: IInstagramCredentials): Promise<void> {
		try {
			if (credentials.proxyUrl) {
				this.client.state.proxyUrl = credentials.proxyUrl;
			}

			if (!credentials.sessionData) {
				throw new Error(
					'Session data is required. Extract it from a logged-in browser session (sessionid + csrftoken cookies) and paste it as JSON.',
				);
			}

			try {
				const sessionData =
					typeof credentials.sessionData === 'string'
						? JSON.parse(credentials.sessionData)
						: credentials.sessionData;

				await this.client.state.deserialize(sessionData);

				// Verify session is still valid
				const userInfo = await this.client.user.info(this.client.state.cookieUserId);
				void userInfo;

				this.isAuthenticated = true;
				return;
			} catch (sessionError) {
				throw new Error(
					`Invalid or expired session data. Please extract a fresh session and update your credentials. Error: ${
						sessionError instanceof Error ? sessionError.message : 'Unknown error'
					}`,
				);
			}
		} catch (error) {
			this.isAuthenticated = false;

			if (error instanceof Error) {
				const errorMessage = error.message.toLowerCase();

				if (errorMessage.includes('login_required') || errorMessage.includes('unauthorized')) {
					throw new Error(
						'Session expired or invalid. Extract a fresh session and update your credentials.',
					);
				} else if (errorMessage.includes('challenge_required')) {
					throw new Error(
						'Instagram session requires verification. Log in through the app, complete any challenge, then extract a fresh session.',
					);
				} else if (errorMessage.includes('checkpoint_required')) {
					throw new Error(
						'Instagram account requires verification. Complete it in the app, wait 24-48h, then extract a fresh session.',
					);
				} else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
					throw new Error('Rate limited by Instagram. Wait a few hours and try again.');
				}
				throw error;
			}
			throw new Error('Authentication failed: Unknown error occurred.');
		}
	}

	async authenticateWithRetry(credentials: IInstagramCredentials, maxRetries: number = 3): Promise<void> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				if (attempt > 1) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
					await Utils.delay(delay);
				}
				await this.authenticate(credentials);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');

				if (
					lastError.message.includes('challenge_required') ||
					lastError.message.includes('checkpoint_required')
				) {
					throw lastError;
				}
			}
		}
		throw new Error(`Authentication failed after ${maxRetries} attempts. Last error: ${lastError?.message ?? 'Unknown error'}`);
	}

	private ensureAuthenticated(): void {
		if (!this.isAuthenticated) {
			throw new Error('Client is not authenticated. Please call authenticate() first.');
		}
	}

	async getUserInfo(username: string): Promise<IInstagramUser> {
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
		} catch (error) {
			throw new Error(`Failed to get user info: ${Utils.formatError(error)}`);
		}
	}

	async getTimelineFeed(maxId?: string): Promise<IInstagramTimelineFeed> {
		this.ensureAuthenticated();
		try {
			const feed = this.client.feed.timeline();
			const response = await feed.request();
			return {
				items: response.feed_items.map((item: any) => ({
					id: item.media?.id || item.id,
					code: item.media?.code || item.code,
					taken_at: item.media?.taken_at || item.taken_at,
					media_type: item.media?.media_type || item.media_type,
					caption: item.media?.caption ? { text: item.media.caption.text } : null,
					like_count: item.media?.like_count || 0,
					comment_count: item.media?.comment_count || 0,
					user: {
						id: item.media?.user?.pk?.toString() || item.user?.pk?.toString(),
						username: item.media?.user?.username || item.user?.username,
						full_name: item.media?.user?.full_name || item.user?.full_name,
					},
				})) as IInstagramMediaItem[],
				more_available: response.more_available || false,
				next_max_id: response.next_max_id,
			};
		} catch (error) {
			throw new Error(`Failed to get timeline feed: ${Utils.formatError(error)}`);
		}
	}

	/**
	 * Get detailed info for a media item by its numeric media ID (the
	 * IgApiClient "pk", not the shortcode). Used internally by getPostByUrl,
	 * but also exposed directly in case you already have the numeric ID.
	 */
	async getMediaInfo(mediaId: string): Promise<IInstagramMediaInfo> {
		this.ensureAuthenticated();
		try {
			const media = await this.client.media.info(mediaId);
			const item = media.items[0] as any;

			return {
				id: item.id,
				code: item.code,
				taken_at: item.taken_at,
				media_type: item.media_type,
				like_count: item.like_count,
				comment_count: item.comment_count,
				view_count: item.view_count,
				play_count: item.play_count,
				caption: item.caption?.text ?? null,
				user: {
					pk: item.user.pk.toString(),
					username: item.user.username,
					full_name: item.user.full_name,
				},
				image_versions2: item.image_versions2,
				video_versions: item.video_versions || [],
				carousel_media: item.carousel_media,
			};
		} catch (error) {
			throw new Error(`Failed to get media info: ${Utils.formatError(error)}`);
		}
	}

	/**
	 * Main entry point for the "Post -> Get Info by URL" operation.
	 * Takes any instagram.com/p|reel|reels|tv/<shortcode> URL, resolves it to
	 * the numeric media ID, fetches full media info (works for age-restricted
	 * / 18+ content as long as the authenticated account is allowed to view
	 * it) and returns a flat, ready-to-use summary.
	 */
	async getPostByUrl(url: string): Promise<IInstagramPostSummary> {
		this.ensureAuthenticated();

		const shortcode = Utils.extractShortcode(url);
		if (!shortcode) {
			throw new Error(
				`Could not find a post/reel shortcode in URL "${url}". Expected something like https://www.instagram.com/reel/SHORTCODE/`,
			);
		}

		const mediaId = Utils.shortcodeToMediaId(shortcode);
		const info = await this.getMediaInfo(mediaId);

		const mediaTypeMap: Record<number, IInstagramPostSummary['mediaType']> = {
			1: 'photo',
			2: 'video',
			8: 'carousel',
		};
		const mediaType = mediaTypeMap[info.media_type] ?? 'unknown';
		const isVideo = mediaType === 'video';

		// Pick the best thumbnail: first carousel item's image, else the
		// item's own image_versions2, else a video's own cover frame.
		let thumbnail = Utils.bestImageUrl(info.image_versions2);
		if (!thumbnail && info.carousel_media && info.carousel_media.length > 0) {
			thumbnail = Utils.bestImageUrl(info.carousel_media[0].image_versions2);
		}

		const caption = info.caption ?? '';
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
			likeCount: info.like_count ?? 0,
			commentCount: info.comment_count ?? 0,
			viewCount: info.view_count ?? info.play_count ?? null,
			author: info.user.username,
			authorFullName: info.user.full_name,
			takenAt: Utils.formatTimestamp(info.taken_at),
			takenAtTimestamp: info.taken_at,
		};
	}

	async saveSession(): Promise<string> {
		try {
			return JSON.stringify(await this.client.state.serialize());
		} catch (error) {
			throw new Error(`Failed to save session: ${Utils.formatError(error)}`);
		}
	}

	async loadSession(sessionData: string): Promise<void> {
		try {
			const parsed = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
			await this.client.state.deserialize(parsed);
			this.isAuthenticated = true;
		} catch (error) {
			this.isAuthenticated = false;
			throw new Error(`Failed to load session: ${Utils.formatError(error)}`);
		}
	}
}
