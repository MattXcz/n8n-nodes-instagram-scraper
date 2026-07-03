# n8n-nodes-instagram-scraper

n8n community node that extracts Instagram post/reel metadata (title, caption, thumbnail, likes, comments, author, date, media type) using an authenticated session. Because it authenticates as a real logged-in account, it also works for age-restricted (18+) content that Instagram hides from anonymous/bot requests.

This is a fork of [n8n-nodes-instagram-private-api-wrapped](https://github.com/tiagohintz/n8n-nodes-instagram-private-api-wrapped) by tiagohintz (MIT licensed), trimmed down and extended specifically for metadata scraping:

- Added **Post -> Get Info by URL**: paste any `instagram.com/p|reel|reels|tv/<shortcode>` URL and get back a flat, ready-to-use object (`title`, `description`, `thumbnail`, `videoUrl`, `likeCount`, `commentCount`, `viewCount`, `topComment`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`).
- Shortcode -> media ID conversion is done locally (same algorithm Instagram itself uses), so unlike GraphQL-based scrapers this doesn't depend on Instagram's `doc_id`, which rotates every few weeks and breaks those scrapers.
- Removed operations unrelated to metadata scraping (posting, liking, follow/unfollow, direct messages) to keep the node small and the maintenance surface minimal.
- Automatic login + session caching: fill in Username/Password once in the credential and the node handles everything else — it logs in on first use, caches the resulting session in the workflow's static data, and reuses it on every later execution, only logging in again if that cached session ever expires or gets rejected.
- Automatic web fallback: if the mobile private API returns `checkpoint_required` for a specific post/reel (this can happen for restricted/sensitive content even with a fully valid session, since Instagram scrutinizes mobile-app-style requests more than web traffic), the node automatically retries the same underlying endpoint using web-style headers (`X-IG-App-ID`, the same public ID instagram.com's own frontend uses) instead of the mobile app's signed-request scheme — the same access pattern the website itself uses internally, not something recognizable as "mobile app" traffic. It follows Instagram's cookie-bootstrapping redirects itself (accumulating whatever cookies Instagram sets along the way) rather than relying on a single static cookie header, and returns the same structured data as the primary path.

## Authentication

### Recommended: Username + Password

1. Open the **Instagram API** credential and fill in **Username** and **Password**. Use a dedicated automation account if possible, not your main one.
2. That's it — the first time any operation runs, the node performs a real login (with the same pre/post-login flow simulation the official app does) and caches the resulting session automatically. Every later execution reuses that cached session; the node only logs in again if it ever gets rejected.

This is more trusted by Instagram than a browser cookie, because the device fingerprint behind the session was created by the same login that produced it, so there's no mismatch between "device" and session for Instagram's fraud detection to flag. It also means repeated real logins aren't happening on every single execution, which is itself a pattern Instagram watches for.

### Advanced fallback: browser cookies

If you'd rather not store a password, leave Username/Password empty and instead:

1. Log into instagram.com in your browser with the account you want to use.
2. Open DevTools -> Application/Storage -> Cookies -> `https://www.instagram.com`.
3. Copy the raw values of the `sessionid` and `csrftoken` cookies (keep the `%3A` parts in `sessionid` as-is, don't decode them).
4. Paste them into **Session ID (Advanced)** and **CSRF Token (Advanced)**.

This grafts a web-origin session cookie onto a freshly generated "device", which is exactly the kind of mismatch Instagram's fraud detection is tuned to catch — expect occasional `checkpoint_required` errors. If that happens, either complete the verification in the Instagram app, or switch to Username + Password instead.

There's also a **Session Data (Advanced)** field for pasting a manually generated session; if set, it takes priority over everything else.

**Security note:** treat all of these values (password, session cookies, session data) like they are the account's password — because they effectively are. Store credentials only in n8n's encrypted credential store, never commit them to git, and don't paste them anywhere else.

### Proxy (optional)

**Proxy URL** in the credential (e.g. `http://proxy.example.com:8080`) routes both the private API requests and the web fallback requests through the same HTTP proxy. Use it if the machine running n8n has no direct route to instagram.com and needs a proxy for any outbound request to succeed, or if you want IP-based checkpoint/rate-limit risk spread across a residential/rotating proxy instead of the n8n host's own IP. Leave it empty for a normal direct connection.

### Multiple items in one run

If several URLs are fed into this node at once (e.g. from a Split In Batches / Loop node), firing all of those requests back-to-back with no gap looks nothing like a human browsing and can get the session `checkpoint_required`-flagged after a few items, even though each one alone would work fine. The node's **Options -> Delay Between Items (ms)** setting (default 2000ms) inserts a randomized delay before item 2 onward to space requests out; raise it if you're still seeing checkpoints on larger batches, or set it to 0 to disable.

## Installation

### Option A: Community Nodes UI (after you publish to npm)

Settings -> Community Nodes -> Install -> package name: `@mattxcz/n8n-nodes-instagram-scraper`

### Option B: Custom extensions folder (private, no npm needed)

```bash
npm install
npm run build
```

Copy the whole folder (or just `dist/`, `package.json`, `README.md`, `LICENSE`) into your n8n custom extensions directory (commonly `~/.n8n/custom/n8n-nodes-instagram-scraper`), then restart n8n.

## Usage

1. Add the **Instagram Scraper** node to your workflow.
2. Resource: `Post`, Operation: `Get Info by URL`.
3. URL: `{{ $json.url }}` or a hard-coded post/reel link.
4. Output fields: `title`, `description`, `thumbnail`, `videoUrl`, `likeCount`, `commentCount`, `viewCount`, `topComment` (`{ text, author, likeCount }` of the top/pinned comment, or `null` if there are none), `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`.

`videoUrl` is the direct link to the highest-quality video file for reels/videos (and for carousels that lead with one), or `null` for photo posts. Both `thumbnail` and `videoUrl` are temporary, signed CDN URLs — download or forward them promptly, they expire.

## Maintenance

Instagram can change its private API at any time without notice; this is an unofficial, reverse-engineered integration, not the official Graph API. If it stops working, check:

1. Whether `instagram-private-api` has a newer version that fixes it (`npm update instagram-private-api`).
2. Whether the cached session expired — with Username/Password set, the node re-logs in automatically; with the cookie fallback, copy fresh values from the browser.
3. Whether Instagram flagged the account with a `checkpoint_required` on a specific post (the node retries automatically via the web fallback described above) or account-wide (wait 24-48h, complete any prompt in the app, or use a different account).

If you ever need to force a fresh login (e.g. after switching accounts), clear the workflow's static data by deactivating/reactivating the workflow, or simply change the Username in the credential.

### Troubleshooting network errors

A bare `fetch failed` error message means the underlying cause wasn't surfaced — as of this version, network-level failures from the web fallback include the real reason (e.g. DNS failure, connection refused, TLS error) in the error message instead of that generic text. If you see:

- `... : redirect count exceeded` or a message about being redirected to `/accounts/login/` or `/challenge/` — the session isn't accepted for web access. Log in through a real browser with the account, then use the Session ID + CSRF Token fields instead of Username/Password for that content.
- A DNS/connection-level message — check that the n8n host can reach `www.instagram.com` directly, or set **Proxy URL** in the credential.
- `Instagram authentication failed: ... checkpoint_required` — this one happens at login itself, before any post is even fetched: Instagram has put the whole account under a security hold and is refusing this automated login outright (not something this node can complete on its own). Log into instagram.com or the Instagram app directly with the account, clear whatever it's asking for, then either wait a while and retry Username/Password, or copy fresh Session ID + CSRF Token cookies from that browser session as an immediate workaround. This tends to happen more on accounts with little prior "normal" usage history, so a dedicated automation account that occasionally gets used like a real one (not just hit by this node) is less likely to trip it.

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright tiagohintz, modifications Copyright Matouš Bečvář.
