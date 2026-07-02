# n8n-nodes-instagram-scraper

n8n community node that extracts Instagram post/reel metadata (title, caption, thumbnail, likes, comments, author, date, media type) using an authenticated session. Because it authenticates as a real logged-in account, it also works for age-restricted (18+) content that Instagram hides from anonymous/bot requests.

This is a fork of [n8n-nodes-instagram-private-api-wrapped](https://github.com/tiagohintz/n8n-nodes-instagram-private-api-wrapped) by tiagohintz (MIT licensed), trimmed down and extended specifically for metadata scraping:

- Added **Post -> Get Info by URL**: paste any `instagram.com/p|reel|reels|tv/<shortcode>` URL and get back a flat, ready-to-use object (`title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`).
- Shortcode -> media ID conversion is done locally (same algorithm Instagram itself uses), so unlike GraphQL-based scrapers this doesn't depend on Instagram's `doc_id`, which rotates every few weeks and breaks those scrapers.
- Removed operations unrelated to metadata scraping (posting, liking, follow/unfollow, direct messages) to keep the node small and the maintenance surface minimal.
- Automatic login + session caching: fill in Username/Password once in the credential and the node handles everything else — it logs in on first use, caches the resulting session in the workflow's static data, and reuses it on every later execution, only logging in again if that cached session ever expires or gets rejected.

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
4. Output fields: `title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`.

## Maintenance

Instagram can change its private API at any time without notice; this is an unofficial, reverse-engineered integration, not the official Graph API. If it stops working, check:

1. Whether `instagram-private-api` has a newer version that fixes it (`npm update instagram-private-api`).
2. Whether the cached session expired — with Username/Password set, the node re-logs in automatically; with the cookie fallback, copy fresh values from the browser.
3. Whether Instagram flagged the account with a `checkpoint_required` (wait 24-48h, complete any prompt in the app, or use a different account).

If you ever need to force a fresh login (e.g. after switching accounts), clear the workflow's static data by deactivating/reactivating the workflow, or simply change the Username in the credential.

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright tiagohintz, modifications Copyright Matouš Bečvář.
