# n8n-nodes-instagram-scraper

n8n community node that extracts Instagram post/reel metadata (title, caption, thumbnail, likes, comments, author, date, media type) using an authenticated session. Because it authenticates as a real logged-in account, it also works for age-restricted (18+) content that Instagram hides from anonymous/bot requests.

This is a fork of [n8n-nodes-instagram-private-api-wrapped](https://github.com/tiagohintz/n8n-nodes-instagram-private-api-wrapped) by tiagohintz (MIT licensed), trimmed down and extended specifically for metadata scraping:

- Added **Post -> Get Info by URL**: paste any `instagram.com/p|reel|reels|tv/<shortcode>` URL and get back a flat, ready-to-use object (`title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`).
- Shortcode -> media ID conversion is done locally (same algorithm Instagram itself uses), so unlike GraphQL-based scrapers this doesn't depend on Instagram's `doc_id`, which rotates every few weeks and breaks those scrapers.
- Removed operations unrelated to metadata scraping (posting, liking, follow/unfollow, direct messages) to keep the node small and the maintenance surface minimal.
- Session-only authentication (no username/password stored anywhere), same as the upstream project — but simplified to two plain credential fields (**Session ID**, **CSRF Token**) instead of a hand-built JSON session blob.

## Why cookies instead of username/password

Instagram aggressively rate-limits and flags direct username/password logins from automation tools. Using the `sessionid`/`csrftoken` cookie pair from an already-logged-in browser session is far more reliable and is what every serious Instagram automation library (instagrapi, instagram-private-api, gallery-dl, yt-dlp) does today. The node injects these two cookies straight into the underlying client's cookie jar and derives everything else (device ID, numeric user ID) automatically — no session JSON to assemble by hand.

**Security note:** treat these cookie values like a password. Whoever has them can act as your Instagram account. Use a dedicated account for automation if possible, store the credential only in n8n's encrypted credential store, and never commit them to git or paste them anywhere else.

## Installation

### Option A: Community Nodes UI (after you publish to npm)

Settings -> Community Nodes -> Install -> package name: `@mattxcz/n8n-nodes-instagram-scraper`

### Option B: Custom extensions folder (private, no npm needed)

```bash
npm install
npm run build
```

Copy the whole folder (or just `dist/`, `package.json`, `README.md`, `LICENSE`) into your n8n custom extensions directory (commonly `~/.n8n/custom/n8n-nodes-instagram-scraper`), then restart n8n.

## Getting session data

1. Log into instagram.com in your browser with the account you want to use for scraping.
2. Open DevTools -> Application/Storage -> Cookies -> `https://www.instagram.com`.
3. Copy the raw values of the `sessionid` and `csrftoken` cookies (keep the `%3A` parts in `sessionid` as-is, don't decode them).
4. In the n8n credential, paste them into the two plain fields: **Session ID** and **CSRF Token**. No JSON, no extra formatting.

The numeric Instagram user ID is derived automatically from the start of the `sessionid` value, so you don't need to look that up separately.

## Usage

1. Add the **Instagram Scraper** node to your workflow.
2. Resource: `Post`, Operation: `Get Info by URL`.
3. URL: `{{ $json.url }}` or a hard-coded post/reel link.
4. Output fields: `title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`.

## Maintenance

Instagram can change its private API at any time without notice; this is an unofficial, reverse-engineered integration, not the official Graph API. If it stops working, check:

1. Whether `instagram-private-api` has a newer version that fixes it (`npm update instagram-private-api`).
2. Whether your Session ID / CSRF Token expired (copy fresh values from the browser).
3. Whether Instagram flagged the account (wait 24-48h, or use a different account).

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright tiagohintz, modifications Copyright Matouš Bečvář.
