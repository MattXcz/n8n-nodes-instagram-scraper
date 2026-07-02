# n8n-nodes-instagram-scraper

n8n community node that extracts Instagram post/reel metadata (title, caption, thumbnail, likes, comments, author, date, media type) using an authenticated session. Because it authenticates as a real logged-in account, it also works for age-restricted (18+) content that Instagram hides from anonymous/bot requests.

This is a fork of [n8n-nodes-instagram-private-api-wrapped](https://github.com/tiagohintz/n8n-nodes-instagram-private-api-wrapped) by tiagohintz (MIT licensed), trimmed down and extended specifically for metadata scraping:

- Added **Post -> Get Info by URL**: paste any `instagram.com/p|reel|reels|tv/<shortcode>` URL and get back a flat, ready-to-use object (`title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`).
- Shortcode -> media ID conversion is done locally (same algorithm Instagram itself uses), so unlike GraphQL-based scrapers this doesn't depend on Instagram's `doc_id`, which rotates every few weeks and breaks those scrapers.
- Removed operations unrelated to metadata scraping (posting, liking, follow/unfollow, direct messages) to keep the node small and the maintenance surface minimal.
- Session-only authentication (no username/password stored anywhere), same as the upstream project.

## Why session data instead of username/password

Instagram aggressively rate-limits and flags direct username/password logins from automation tools. Using a `sessionid`/`csrftoken` cookie pair extracted from an already-logged-in browser session is far more reliable and is what every serious Instagram automation library (instagrapi, instagram-private-api, gallery-dl, yt-dlp) does today.

**Security note:** treat your session data like a password. Whoever has it can act as your Instagram account. Use a dedicated account for automation if possible, store the credential only in n8n's encrypted credential store, and never commit it to git or paste it anywhere else.

## Installation

### Option A: Community Nodes UI (after you publish to npm)

Settings -> Community Nodes -> Install -> package name: `n8n-nodes-instagram-scraper`

### Option B: Custom extensions folder (private, no npm needed)

```bash
npm install
npm run build
```

Copy the whole folder (or just `dist/`, `package.json`, `README.md`, `LICENSE`) into your n8n custom extensions directory (commonly `~/.n8n/custom/n8n-nodes-instagram-scraper`), then restart n8n.

## Getting session data

1. Log into instagram.com in your browser with the account you want to use for scraping.
2. Open DevTools -> Application/Storage -> Cookies -> `https://www.instagram.com`.
3. Copy the values of `sessionid` and `csrftoken`.
4. In the n8n credential, paste JSON in this shape:

```json
{
  "cookies": [
    { "key": "sessionid", "value": "PASTE_HERE", "domain": ".instagram.com", "path": "/" },
    { "key": "csrftoken", "value": "PASTE_HERE", "domain": ".instagram.com", "path": "/" }
  ]
}
```

(Exact serialized shape depends on `instagram-private-api`'s `state.serialize()` format — if the node's built-in "Test" button on the credential fails, check the error message, the library is picky about the exact cookie object keys.)

## Usage

1. Add the **Instagram Scraper** node to your workflow.
2. Resource: `Post`, Operation: `Get Info by URL`.
3. URL: `{{ $json.url }}` or a hard-coded post/reel link.
4. Output fields: `title`, `description`, `thumbnail`, `likeCount`, `commentCount`, `viewCount`, `author`, `authorFullName`, `takenAt`, `mediaType`, `isVideo`.

## Maintenance

Instagram can change its private API at any time without notice; this is an unofficial, reverse-engineered integration, not the official Graph API. If it stops working, check:

1. Whether `instagram-private-api` has a newer version that fixes it (`npm update instagram-private-api`).
2. Whether your session data expired (re-extract it).
3. Whether Instagram flagged the account (wait 24-48h, or use a different account).

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright tiagohintz, modifications Copyright you.
