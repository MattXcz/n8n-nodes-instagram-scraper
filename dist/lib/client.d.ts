import { IInstagramCredentials, IInstagramUser, IInstagramTimelineFeed, IInstagramMediaInfo, IInstagramPostSummary } from './types';
export declare class InstagramClient {
    private client;
    private isAuthenticated;
    constructor(credentials?: IInstagramCredentials);
    authenticate(credentials: IInstagramCredentials): Promise<void>;
    authenticateWithRetry(credentials: IInstagramCredentials, maxRetries?: number): Promise<void>;
    private ensureAuthenticated;
    getUserInfo(username: string): Promise<IInstagramUser>;
    getTimelineFeed(maxId?: string): Promise<IInstagramTimelineFeed>;
    getMediaInfo(mediaId: string): Promise<IInstagramMediaInfo>;
    getPostByUrl(url: string): Promise<IInstagramPostSummary>;
    saveSession(): Promise<string>;
    loadSession(sessionData: string): Promise<void>;
}
