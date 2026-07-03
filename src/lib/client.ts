import { IgApiClient } from 'instagram-private-api';
import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciRequestInit, type Response as UndiciResponse } from 'undici';
import {
	IInstagramCredentials,
	IInstagramMediaItem,
	IInstagramUser,
	IInstagramTimelineFeed,
	IInstagramMediaInfo,
	IInstagramPostSummary,
	IInstagramLoginResult,
} from './types';
import { Utils } from './utils';

export class InstagramClient {
	private client: IgApiClient;
	private isAuthenticated: boolean = false;
	private proxyUrl?: string;

	constructor(credentials?: IInstagramCredentials) {
		this.client = new IgApiClient();
		if (credentials?.proxyUrl) {
			this.client.state.proxyUrl = credentials.proxyUrl;
			this.proxyUrl = credentials.proxyUrl;
		}
	}

	/**
	 * Plain `fetch()` never picks up `client.state.proxyUrl` - that setting is
	 * only honored by instagram-private-api's own `request`-based HTTP client.
	 * The web-fallback calls below use `fetch()` directly, so without this
	 * they'd silently bypass the configured proxy while the private API calls
	 * go through it - a mismatch that either defeats the point of the proxy
	 * (e.g. IP-based rate limiting/geofencing) or, if the host itself has no
	 * direct route to the internet and depends on the proxy, fails outright
	 * with Node's generic, cause-less "fetch failed".
	 *
	 * Also unwraps that generic message: Node's fetch (undici) only ever
	 * throws "fetch failed" and puts the actual reason (DNS failure,
	 * connection refused, TLS error, etc.) on `error.cause`, which n8n never
	 * shows on its own.
	 */
	private async fetchWithProxy(url: string, options: UndiciRequestInit): Promise<UndiciResponse> {
		try {
			if (this.proxyUrl) {
				return await undiciFetch(url, { ...options, dispatcher: new ProxyAgent(this.proxyUrl) });
			}
			return await undiciFetch(url, options);
		} catch (error) {
			const cause = error instanceof Error && (error as any).cause ? Utils.formatError((error as any).cause) : undefined;
			const baseMessage = Utils.formatError(error);
			throw new Error(
				cause ? `${baseMessage} (${url}): ${cause}` : `${baseMessage} (${url})`,
			);
		}
	}

	/**
	 * Cookie-jar-aware GET for the www.instagram.com web app, following
	 * redirects manually instead of leaving it to fetch()'s automatic
	 * `redirect: 'follow'`.
	 *
	 * This matters because we build the `Cookie` header ourselves rather than
	 * from a real browser's managed jar. Instagram's web frontend runs a
	 * cookie-bootstrapping dance for sessions it doesn't fully recognize yet -
	 * it responds with a redirect *and* a `Set-Cookie` (e.g. `mid`, `ig_did`,
	 * `datr`, `csrftoken`), expecting the next hop to carry that new cookie
	 * back. Automatic `fetch()` redirect handling resends the exact same
	 * static `Cookie` header we set on the first request, never picking up
	 * those intermediate `Set-Cookie`s, so the dance never completes and
	 * Instagram just keeps redirecting until fetch gives up with the opaque
	 * "redirect count exceeded". Feeding every `Set-Cookie` back into
	 * `client.state.cookieJar` and rebuilding the `Cookie` header from the jar
	 * before each hop lets that dance actually finish.
	 */
	private async fetchInstagramWeb(initialUrl: string, extraHeaders: Record<string, string> = {}): Promise<UndiciResponse> {
		const maxHops = 8;
		let currentUrl = initialUrl;

		for (let hop = 0; hop <= maxHops; hop++) {
			const cookieHeader: string = this.client.state.cookieJar.getCookieString(currentUrl);

			const response = await this.fetchWithProxy(currentUrl, {
				redirect: 'manual',
				headers: {
					...extraHeaders,
					...(cookieHeader ? { Cookie: cookieHeader } : {}),
				},
			});

			const setCookieHeaders: string[] =
				typeof (response.headers as any).getSetCookie === 'function' ? (response.headers as any).getSetCookie() : [];
			for (const header of setCookieHeaders) {
				try {
					this.client.state.cookieJar.setCookie(header, currentUrl);
				} catch {
					// Ignore cookies the jar rejects (e.g. domain mismatch) - don't
					// abort the whole request over a single cookie.
				}
			}

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (!location) {
					throw new Error(`Instagram returned a redirect (HTTP ${response.status}) from ${currentUrl} with no Location header.`);
				}
				const nextUrl = new URL(location, currentUrl).toString();

				if (/\/accounts\/login\/|\/challenge\//.test(nextUrl)) {
					throw new Error(
						`Instagram redirected the web fallback request to ${nextUrl} - the session was not accepted for web access. Log in through a real browser with this account, then provide fresh Session ID + CSRF Token cookies in the credential instead of relying on the automatic Username/Password login for this content.`,
					);
				}
				if (hop === maxHops) {
					throw new Error(
						`Instagram kept redirecting the web fallback request (${maxHops} hops, last redirect to ${nextUrl}) without resolving. The session may be invalid for web access - try fresh Session ID + CSRF Token cookies instead.`,
					);
				}
				currentUrl = nextUrl;
				continue;
			}

			return response;
		}

		// Unreachable - the loop above always returns or throws.
		throw new Error(`Instagram redirected the web fallback request too many times for ${initialUrl}.`);
	}

	/**
	 * Authenticate the client. Prefers the trusted `sessionData` (produced
	 * automatically by loginWithPassword, cached, and passed back in here)
	 * and falls back to directly injecting the "sessionid" + "csrftoken"
	 * cookies copied from a logged-in browser (DevTools -> Application ->
	 * Cookies -> instagram.com).
	 *
	 * The cookie-injection fallback is more prone to triggering Instagram's
	 * `checkpoint_required` anti-fraud response, since it grafts a web-origin
	 * session cookie onto a freshly-generated, never-before-seen "device" —
	 * a mismatch Instagram's fraud detection is specifically tuned to catch.
	 * `sessionData` avoids this because its device fingerprint was created by
	 * the same login that produced the session.
	 */
	async login(credentials: IInstagramCredentials): Promise<void> {
		try {
			if (credentials.proxyUrl) {
				this.client.state.proxyUrl = credentials.proxyUrl;
				this.proxyUrl = credentials.proxyUrl;
			}

			if (credentials.sessionData && credentials.sessionData.trim()) {
				await this.loadSession(credentials.sessionData);
				try {
					await this.client.user.info(this.client.state.cookieUserId);
				} catch (verifyError) {
					this.isAuthenticated = false;
					throw new Error(`Session Data was rejected by Instagram: ${Utils.formatError(verifyError)}`);
				}
				return;
			}

			if (!credentials.sessionId || !credentials.csrfToken) {
				throw new Error(
					'Provide either Username + Password (recommended), Session Data, or both Session ID and CSRF Token.',
				);
			}

			const userId = credentials.sessionId.split('%3A')[0];
			if (!userId || !/^\d+$/.test(userId)) {
				throw new Error(
					'Could not read a numeric user ID from the start of the Session ID. Make sure you copied the full "sessionid" cookie value, including the %3A parts.',
				);
			}

			// Device IDs must be deterministic for a given account, otherwise
			// Instagram may treat every request as coming from a new device.
			this.client.state.generateDevice(userId);

			const cookieUrl = 'https://i.instagram.com';
			await this.client.state.cookieJar.setCookie(
				`sessionid=${credentials.sessionId}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
				cookieUrl,
			);
			await this.client.state.cookieJar.setCookie(
				`csrftoken=${credentials.csrfToken}; Domain=.instagram.com; Path=/; Secure`,
				cookieUrl,
			);
			await this.client.state.cookieJar.setCookie(
				`ds_user_id=${userId}; Domain=.instagram.com; Path=/; Secure`,
				cookieUrl,
			);

			try {
				// Verify the session actually works before reporting success.
				await this.client.user.info(userId);
				this.isAuthenticated = true;
			} catch (verifyError) {
				throw new Error(
					`Session ID / CSRF Token were rejected by Instagram: ${Utils.formatError(verifyError)}`,
				);
			}
		} catch (error) {
			this.isAuthenticated = false;

			if (error instanceof Error) {
				const errorMessage = error.message.toLowerCase();

				if (errorMessage.includes('login_required') || errorMessage.includes('unauthorized')) {
					throw new Error('Session expired or invalid. Copy fresh sessionid/csrftoken cookie values and update your credentials.');
				} else if (errorMessage.includes('challenge_required')) {
					throw new Error(
						'Instagram session requires verification. Log in through the app, complete any challenge, then copy fresh cookie values.',
					);
				} else if (errorMessage.includes('checkpoint_required')) {
					throw new Error(
						'Instagram account requires verification. Complete it in the app, wait 24-48h, then copy fresh cookie values.',
					);
				} else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
					throw new Error('Rate limited by Instagram. Wait a few hours and try again.');
				}
				throw error;
			}
			throw new Error('Authentication failed: Unknown error occurred.');
		}
	}

	private ensureAuthenticated(): void {
		if (!this.isAuthenticated) {
			throw new Error('Client is not authenticated. Please call authenticate() first.');
		}
	}

	/**
	 * Reads a cookie's raw value directly from the underlying cookie jar,
	 * trying a couple of Instagram domain variants. More robust than the
	 * library's own `state.extractCookieValue()`, which can miss cookies
	 * depending on which domain they ended up scoped to.
	 */
	private async getRawCookieValue(name: string): Promise<string | undefined> {
		const candidateUrls = ['https://www.instagram.com', 'https://i.instagram.com', 'https://instagram.com'];
		for (const candidateUrl of candidateUrls) {
			try {
				const cookies = await this.client.state.cookieJar.getCookies(candidateUrl);
				const found = cookies.find((cookie: any) => cookie.key === name);
				if (found) {
					return found.value;
				}
			} catch {
				// try the next candidate domain
			}
		}
		return undefined;
	}

	/**
	 * Get a "sessionid" value usable for an authenticated web (www.instagram.com)
	 * request. For logins done via Session ID / CSRF Token or Session Data, this
	 * is just the cookie already sitting in the jar. But a real Username +
	 * Password login (loginWithPassword) no longer gets a "sessionid" cookie at
	 * all - modern Instagram authenticates the private API via a signed
	 * `Authorization: Bearer IGT:2:<base64>` header instead. That token's
	 * decoded payload still carries the same sessionid value Instagram would
	 * otherwise set as a cookie, so fall back to reading it from there.
	 */
	private async getSessionIdForWebRequest(): Promise<string | undefined> {
		const cookieValue = await this.getRawCookieValue('sessionid');
		if (cookieValue) {
			return cookieValue;
		}

		// `parsedAuthorization` is populated lazily as a side effect of the
		// `cookieUserId` getter - touch it once so the bearer token (if any)
		// actually gets decoded before we read from it.
		try {
			void this.client.state.cookieUserId;
		} catch {
			// ignore - we only care about the parsedAuthorization side effect
		}

		const bearerSessionId: string | undefined = (this.client.state as any).parsedAuthorization?.sessionid;
		if (bearerSessionId) {
			// Bearer-token logins never put "sessionid" in the cookie jar, but
			// fetchInstagramWeb() builds its Cookie header from the jar - write
			// it in once so subsequent web requests actually send it.
			try {
				this.client.state.cookieJar.setCookie(
					`sessionid=${bearerSessionId}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
					'https://www.instagram.com',
				);
			} catch {
				// non-fatal - worst case the explicit header fallback below is used
			}
		}
		return bearerSessionId;
	}

	/**
	 * Get a "csrftoken" value usable for an authenticated web request. Same
	 * problem as sessionid above: header/bearer-token based logins may never
	 * receive a "csrftoken" cookie for the www.instagram.com domain. When
	 * that's the case, fetch it the same way a first-time browser visit would -
	 * by loading the homepage (with whatever session cookie we do have) and
	 * reading the csrftoken cookie Instagram sets in response.
	 */
	private async getCsrfTokenForWebRequest(_sessionId: string): Promise<string | undefined> {
		const cookieValue = await this.getRawCookieValue('csrftoken');
		if (cookieValue) {
			return cookieValue;
		}

		try {
			// fetchInstagramWeb() feeds every Set-Cookie header (including
			// csrftoken, which Instagram may only issue after a couple of
			// redirect hops) back into the cookie jar as it follows redirects,
			// so once it resolves we can just read the token straight out of
			// the jar instead of parsing headers by hand.
			await this.fetchInstagramWeb('https://www.instagram.com/', {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			});
		} catch (error) {
			// A network-level failure (DNS, connection, proxy, TLS, redirect
			// loop, etc.) is a different problem than "Instagram just didn't
			// set the cookie" - surface it as-is instead of masking it behind
			// the generic "csrftoken: missing" message below.
			throw new Error(`Failed to fetch CSRF token from Instagram: ${Utils.formatError(error)}`);
		}

		return this.getRawCookieValue('csrftoken');
	}

	/**
	 * Real login with username + password, using the same pre/post-login flow
	 * simulation as the official Instagram app. Returns a serialized session
	 * (`sessionData`) that the node caches in the workflow's static data, so
	 * this only needs to run again once that cached session eventually
	 * expires or gets rejected — not on every execution. This is more
	 * trusted by Instagram than grafting a browser sessionid cookie onto a
	 * fresh device, so it's much less likely to trigger `checkpoint_required`.
	 */
	async loginWithPassword(username: string, password: string): Promise<IInstagramLoginResult> {
		try {
			// Deterministic per-username device, so re-running this later
			// (e.g. after a session expires) reuses the same fingerprint.
			this.client.state.generateDevice(username);

			// preLoginFlow is just realism (mimics the app warming up before
			// login) - if it fails, still attempt the actual login below.
			try {
				await this.client.simulate.preLoginFlow();
			} catch {
				// ignore - not required for a working session
			}

			const loggedInUser = await this.client.account.login(username, password);

			// Same for postLoginFlow: it simulates post-login app behavior
			// (checking DMs, badges, etc). A failure here (e.g. a transient
			// non-standard status code from one of those endpoints) doesn't
			// mean the login itself failed - we already have a valid,
			// authenticated session at this point, so don't discard it.
			try {
				await this.client.simulate.postLoginFlow();
			} catch {
				// ignore - login already succeeded, session is still valid
			}

			const sessionData = JSON.stringify(await this.client.state.serialize());
			this.isAuthenticated = true;

			return {
				sessionData,
				userId: loggedInUser.pk.toString(),
				username: loggedInUser.username,
			};
		} catch (error) {
			this.isAuthenticated = false;
			const message = Utils.formatError(error).toLowerCase();

			if (message.includes('two_factor') || message.includes('two-factor') || message.includes('checkpoint_challenge_required')) {
				throw new Error(
					'This account needs an extra verification step (2FA or a challenge) that this one-time login cannot complete automatically. Log in once through the Instagram app/browser to clear it, then either retry this operation or use the Session ID + CSRF Token fields instead.',
				);
			}
			if (message.includes('challenge_required')) {
				throw new Error(
					'Instagram requires a verification challenge for this login. Open the Instagram app with this account, complete the challenge, then try again.',
				);
			}
			// Distinct from "challenge_required" above: Instagram returns this
			// plain message (not mapped to a specific error class by
			// instagram-private-api, hence the raw "POST .../login/ - 400 Bad
			// Request; checkpoint_required" text otherwise) when it has put the
			// whole account under a security hold and is refusing automated
			// logins outright, rather than offering a challenge to solve
			// through the API.
			if (message.includes('checkpoint_required')) {
				throw new Error(
					'Instagram put this account under a security checkpoint and is refusing this automated login until it is cleared. Log into instagram.com or the Instagram app directly with this account (not through this node), complete whatever verification it shows, then either wait a while and retry, or copy fresh Session ID + CSRF Token cookies from that browser session into the credential as a workaround.',
				);
			}
			if (message.includes('bad_password') || message.includes('incorrect')) {
				throw new Error('Instagram rejected the username/password combination.');
			}
			throw new Error(`Login failed: ${Utils.formatError(error)}`);
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
				preview_comments: item.preview_comments || [],
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
	 *
	 * If the mobile private-API request gets a `checkpoint_required` (this
	 * can happen for restricted/sensitive content even with a perfectly
	 * valid session, since Instagram scrutinizes the mobile-app-style
	 * request pattern more heavily than plain browser access), this
	 * automatically falls back to an authenticated web request instead -
	 * the same access pattern as opening the link in a logged-in browser.
	 */
	async getPostByUrl(url: string): Promise<IInstagramPostSummary> {
		this.ensureAuthenticated();
		try {
			return await this.getPostByUrlPrivateApi(url);
		} catch (error) {
			const message = Utils.formatError(error).toLowerCase();
			if (message.includes('checkpoint_required')) {
				return await this.getPostByUrlWeb(url);
			}
			throw error;
		}
	}

	private async getPostByUrlPrivateApi(url: string): Promise<IInstagramPostSummary> {
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

		// Same fallback pattern as thumbnail above, but for the playable video
		// file: the item's own video_versions, else the first carousel item's
		// (for carousels that lead with a video/reel-style clip).
		let videoUrl = Utils.bestVideoUrl(info.video_versions);
		if (!videoUrl && info.carousel_media && info.carousel_media.length > 0) {
			videoUrl = Utils.bestVideoUrl(info.carousel_media[0].video_versions);
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
			videoUrl,
			isVideo,
			mediaType,
			likeCount: info.like_count ?? 0,
			commentCount: info.comment_count ?? 0,
			viewCount: info.view_count ?? info.play_count ?? null,
			topComment: Utils.topCommentFromPreview(info.preview_comments),
			author: info.user.username,
			authorFullName: info.user.full_name,
			takenAt: Utils.formatTimestamp(info.taken_at),
			takenAtTimestamp: info.taken_at,
		};
	}

	/**
	 * Fallback used when the mobile private API is blocked with
	 * `checkpoint_required`. instagram.com itself is a client-rendered React
	 * app - the actual page HTML has no post data at all, it's fetched by
	 * the page's own JavaScript after load via this exact endpoint, using
	 * "X-IG-App-ID" (Instagram's public web client ID) instead of the mobile
	 * app's signed-request scheme. Calling it directly, with the same
	 * cookies already in the client's cookie jar (regardless of whether
	 * login() got there via Username/Password, Session Data, or Session ID +
	 * CSRF Token), reproduces what the browser does without needing to
	 * execute any JavaScript - and doesn't look like "mobile app" traffic to
	 * Instagram's fraud detection, so it's less likely to hit the same
	 * checkpoint as the private API call that failed.
	 */
	private async getPostByUrlWeb(url: string): Promise<IInstagramPostSummary> {
		const shortcode = Utils.extractShortcode(url);
		if (!shortcode) {
			throw new Error(
				`Could not find a post/reel shortcode in URL "${url}". Expected something like https://www.instagram.com/reel/SHORTCODE/`,
			);
		}

		const sessionId = await this.getSessionIdForWebRequest();
		if (!sessionId) {
			throw new Error(
				'No session cookies available to make an authenticated web request (sessionid: missing). Try logging in again.',
			);
		}
		const csrfToken = await this.getCsrfTokenForWebRequest(sessionId);
		if (!csrfToken) {
			throw new Error(
				'No session cookies available to make an authenticated web request (csrftoken: missing). Try logging in again.',
			);
		}

		const mediaId = Utils.shortcodeToMediaId(shortcode);
		const apiUrl = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;

		// Cookie header is built from the jar (which by now holds sessionid,
		// csrftoken, and whatever other cookies Instagram issued along the
		// way) inside fetchInstagramWeb() - only headers that aren't cookies
		// need to be passed explicitly here.
		const response = await this.fetchInstagramWeb(apiUrl, {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			Accept: '*/*',
			'Accept-Language': 'en-US,en;q=0.9',
			Referer: `https://www.instagram.com/reel/${shortcode}/`,
			'X-IG-App-ID': '936619743392459',
			'X-CSRFToken': csrfToken,
			'X-Requested-With': 'XMLHttpRequest',
		});

		const rawBody = await response.text();

		if (!response.ok) {
			throw new Error(
				`Instagram returned HTTP ${response.status} for ${apiUrl} (web fallback). Body: ${rawBody.slice(0, 1500)}`,
			);
		}

		let parsed: any;
		try {
			parsed = JSON.parse(rawBody);
		} catch {
			throw new Error(
				`Web fallback response was not valid JSON for ${apiUrl}. Body: ${rawBody.slice(0, 1500)}`,
			);
		}

		const item = parsed?.items?.[0];
		if (!item) {
			throw new Error(
				`Web fallback response had no media item for ${apiUrl}. Body: ${rawBody.slice(0, 1500)}`,
			);
		}

		const mediaTypeMap: Record<number, IInstagramPostSummary['mediaType']> = {
			1: 'photo',
			2: 'video',
			8: 'carousel',
		};
		const mediaType = mediaTypeMap[item.media_type] ?? 'unknown';
		const isVideo = mediaType === 'video';

		let thumbnail = Utils.bestImageUrl(item.image_versions2);
		if (!thumbnail && item.carousel_media && item.carousel_media.length > 0) {
			thumbnail = Utils.bestImageUrl(item.carousel_media[0].image_versions2);
		}

		let videoUrl = Utils.bestVideoUrl(item.video_versions);
		if (!videoUrl && item.carousel_media && item.carousel_media.length > 0) {
			videoUrl = Utils.bestVideoUrl(item.carousel_media[0].video_versions);
		}

		const caption = item.caption?.text ?? '';
		const firstLine = caption.split('\n')[0].trim();

		return {
			url,
			shortcode,
			mediaId,
			title: firstLine || caption.slice(0, 100) || `Instagram post by @${item.user?.username ?? ''}`,
			description: caption,
			thumbnail,
			videoUrl,
			isVideo,
			mediaType,
			likeCount: item.like_count ?? 0,
			commentCount: item.comment_count ?? 0,
			viewCount: item.view_count ?? item.play_count ?? null,
			topComment: Utils.topCommentFromPreview(item.preview_comments),
			author: item.user?.username ?? '',
			authorFullName: item.user?.full_name ?? '',
			takenAt: item.taken_at ? Utils.formatTimestamp(item.taken_at) : '',
			takenAtTimestamp: item.taken_at ?? 0,
		};
	}

	async saveSession(): Promise<string> {
		try {
			return JSON.stringify(await this.client.state.serialize());
		} catch (error) {
			throw new Error(`Failed to save session: ${Utils.formatError(error)}`);
		}
	}

	/**
	 * Restore a previously saved full state (from saveSession()). Useful if
	 * you want to persist device IDs between executions instead of
	 * regenerating them from the cookies every time.
	 */
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
