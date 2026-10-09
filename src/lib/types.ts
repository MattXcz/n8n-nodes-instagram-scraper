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
	video_dash_manifest?: string | null;
	has_audio?: boolean;
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
	/** MPEG-DASH manifest (XML); holds separate video-only and audio-only tracks. */
	video_dash_manifest?: string | null;
	/** Instagram's own flag: does the media have any sound at all. */
	has_audio?: boolean;
	carousel_media?: IInstagramCarouselItem[];
	/** Raw "top comments" preview Instagram includes with media info, without a separate comment.list() call. */
	preview_comments?: IInstagramRawComment[];
}

/**
 * Minimal shape of an entry in Instagram's `preview_comments` array (the
 * top/pinned comments shown under a post). Untyped upstream (`any[]`), so
 * only the fields we actually read are declared here.
 */
export interface IInstagramRawComment {
	pk?: string;
	text?: string;
	comment_like_count?: number;
	user?: {
		username?: string;
		full_name?: string;
	};
}

/** Flat summary of a post's top comment (same shape as in the Facebook scraper). */
export interface IInstagramTopComment {
	text: string;
	author: string;
	likeCount: number | null;
}

export interface IInstagramImage {
	id: string | null;
	url: string;
	width: number | null;
	height: number | null;
	alt: string | null;
}

/**
 * Normalized output of "Post -> Get Info by URL".
 *
 * The shared fields use exactly the same names, types and meaning as the
 * Facebook scraper node (@mattxcz/n8n-nodes-facebook-scraper), so both can
 * feed the same downstream workflow. Unknown values are `null`; `0` only
 * means Instagram actually reported zero.
 */
export interface IInstagramPostSummary {
	platform: 'instagram';
	id: string;
	url: string;
	inputUrl: string;
	title: string | null;
	description: string | null;
	thumbnail: string | null;
	images: IInstagramImage[];
	mediaType: 'photo' | 'video' | 'carousel' | 'unknown';
	isVideo: boolean;

	videoUrl: string | null;
	/** e.g. '1080p' (shorter side of the chosen file). */
	videoQuality: string | null;
	/** 'progressive' = one standalone MP4 file; 'dash' = a single DASH track. */
	videoDeliveryType: 'progressive' | 'dash' | null;
	/** Whether the file at videoUrl itself contains audio (read from the MP4 track list). null = unknown / no video. */
	videoHasAudio: boolean | null;
	/** true = videoUrl has no audio and the sound is in audioUrl -> merge them (ffmpeg). */
	hasSeparateAudio: boolean | null;
	/** Best audio-only track (DASH), whenever available - also when videoUrl already has audio. */
	audioUrl: string | null;
	/** CDN URLs are signed and expire; parsed from the `oe` query parameter. */
	videoUrlExpiresAt: string | null;
	durationSeconds: number | null;
	width: number | null;
	height: number | null;

	likeCount: number | null;
	commentCount: number | null;
	viewCount: number | null;
	shareCount: number | null;
	topComment: IInstagramTopComment | null;

	author: string | null;
	authorFullName: string | null;
	authorId: string | null;
	authorUrl: string | null;
	authorIsVerified: boolean | null;

	takenAt: string | null;
	takenAtTimestamp: number | null;
	authenticated: boolean;
	fetchedAt: string;

	// Instagram-specific
	/** Empty string for stories that have no shortcode. */
	shortcode: string;
	mediaId: string;
	/** true when the input was a story (or highlight) URL. */
	isStory: boolean;
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
