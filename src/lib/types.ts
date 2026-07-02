export interface IInstagramCredentials {
	/**
	 * Recommended: fill these in and everything else is handled
	 * automatically. The node performs a real login on first use, caches the
	 * resulting session in the workflow's static data, and only logs in
	 * again if that cached session ever gets rejected by Instagram.
	 */
	username?: string;
	password?: string;

	/** Advanced fallback: cookies copied from an already-logged-in browser. */
	sessionId?: string;
	csrfToken?: string;

	/**
	 * Advanced fallback: a full serialized client state produced by a
	 * previous login (see InstagramClient.loginWithPassword). Mainly used
	 * internally for caching; can also be pasted in manually.
	 */
	sessionData?: string;

	proxyUrl?: string;
}

export interface IInstagramLoginResult {
	sessionData: string;
	userId: string;
	username: string;
}

// Interfaces for n8n node compatibility

export interface IInstagramUserInfo {
	id: string;
	username: string;
	full_name: string;
	profile_pic_url: string;
	is_verified: boolean;
	follower_count: number;
	following_count: number;
	media_count: number;
	biography: string;
}

export interface IInstagramUser {
	pk: string;
	username: string;
	full_name: string;
	profile_pic_url: string;
	is_verified: boolean;
	follower_count: number;
	following_count: number;
	media_count: number;
	biography: string;
	is_private: boolean;
}

export interface IInstagramTimelineFeed {
	items: IInstagramMediaItem[];
	more_available: boolean;
	next_max_id?: string;
}

export interface IInstagramUserFeed {
	items: IInstagramMediaItem[];
	more_available: boolean;
	next_max_id?: string;
}

export interface IInstagramCarouselItem {
	id: string;
	media_type: number;
	image_versions2?: {
		candidates: Array<{
			url: string;
			width: number;
			height: number;
		}>;
	};
	video_versions?: Array<{
		url: string;
		width: number;
		height: number;
	}>;
}

export interface IInstagramMediaInfo {
	id: string;
	code: string;
	taken_at: number;
	media_type: number; // 1 = photo, 2 = video, 8 = carousel
	like_count: number;
	comment_count: number;
	view_count?: number;
	play_count?: number;
	caption?: string | null;
	user: {
		pk: string;
		username: string;
		full_name: string;
	};
	image_versions2?: {
		candidates: Array<{
			url: string;
			width: number;
			height: number;
		}>;
	};
	video_versions?: Array<{
		url: string;
		width: number;
		height: number;
	}>;
	carousel_media?: IInstagramCarouselItem[];
}

/**
 * Normalized, ready-to-use summary of a single Instagram post/reel.
 * This is what the "Post -> Get Info by URL" operation returns.
 */
export interface IInstagramPostSummary {
	url: string;
	shortcode: string;
	mediaId: string;
	title: string;
	description: string;
	thumbnail: string;
	isVideo: boolean;
	mediaType: 'photo' | 'video' | 'carousel' | 'unknown';
	likeCount: number;
	commentCount: number;
	viewCount: number | null;
	author: string;
	authorFullName: string;
	takenAt: string;
	takenAtTimestamp: number;
}

export interface IInstagramComment {
	pk: string;
	text: string;
	created_at: number;
	user: {
		pk: string;
		username: string;
		full_name: string;
		profile_pic_url: string;
	};
}

export interface IInstagramDirectThread {
	thread_id: string;
	thread_title: string;
	users: Array<{
		pk: string;
		username: string;
		full_name: string;
		profile_pic_url: string;
	}>;
}

export interface IInstagramDirectMessage {
	id: string;
	text: string;
	timestamp: number;
	user_id: string;
}

export interface IInstagramMediaItem {
	id: string;
	code: string;
	taken_at: number;
	media_type: number; // 1 for photo, 8 for video
	caption?: {
		text: string;
	} | null;
	like_count: number;
	comment_count: number;
	user: {
		id: string;
		username: string;
		full_name: string;
	};
}

export interface RetryOptions {
	maxRetries: number;
	baseDelay: number;
	maxDelay: number;
}
