import { RetryOptions } from './types';
export declare class Utils {
    static executeWithRetry<T>(operation: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
    static delay(ms: number): Promise<void>;
    static randomDelay(min?: number, max?: number): Promise<void>;
    static formatError(error: any): string;
    static isRateLimitError(error: any): boolean;
    static extractShortcode(url: string): string | null;
    static shortcodeToMediaId(shortcode: string): string;
    static formatTimestamp(timestamp: number): string;
    static bestImageUrl(imageVersions2?: {
        candidates: Array<{
            url: string;
            width: number;
            height: number;
        }>;
    }): string;
}
