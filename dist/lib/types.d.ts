export interface IInstagramCredentials {
    sessionData: string;
    proxyUrl?: string;
}
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
    media_type: number;
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
    media_type: number;
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
