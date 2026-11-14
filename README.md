# VidoMate

**Your Videos. Your Way. Anywhere.**

A multi-platform media downloader built with Next.js 15 (App Router), TypeScript, Tailwind CSS and FFmpeg. Paste a public link from YouTube, Instagram, Facebook, TikTok, Pinterest, Reddit, Threads or Dailymotion; VidoMate identifies the platform, extracts available metadata and qualities, processes streams via background jobs when needed (HLS remuxing / audio-video muxing with FFmpeg), and delivers real downloadable files.

When a platform restricts unauthenticated server requests, requires login, or offers no public stream, VidoMate reports that honestly instead of fabricating download links.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional – see below
npm run dev                  # http://localhost:3000
npm run build && npm start   # production
npm run typecheck
```

## Architecture

- **Frontend:** Next.js 15 App Router, React 19, Tailwind CSS, dark/light theme, interactive quality selector and live job progress bar.
- **API Endpoints:**
  - `POST /api/analyze` — validates URL (SSRF-guarded), detects platform, extracts metadata and registers temporary download tokens.
  - `POST /api/download` — creates a background download/FFmpeg processing job (`jobId`).
  - `GET /api/jobs/[id]` — polls real-time job status and progress (`0–100%`).
  - `GET /api/jobs/[id]/download` — delivers the processed file with `Content-Disposition: attachment`.
  - `GET /api/download?token=...` — direct stream/remux fallback.
  - `GET /api/platforms` & `GET /api/health`
- **Security:** Platform host allowlist, DNS/private-IP SSRF blocking (`lib/validation/ssrf.ts`), per-IP salted rate limiting, same-origin checks, 250 MB max file size, and 15-minute temporary token/file expiration.

## Optional Environment Variables (`.env.example`)

- `YOUTUBE_API_KEY`, `YOUTUBE_COOKIES`, `COBALT_API_URL`, `COBALT_API_KEY` — optional YouTube metadata/stream configuration.
- `META_OEMBED_ACCESS_TOKEN` — optional Meta oEmbed fallback for Instagram & Facebook.
- `PINTEREST_ACCESS_TOKEN` — optional Pinterest API v5 fallback.
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_CONTACT_USERNAME` — optional Reddit OAuth credentials.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — optional distributed rate limiting.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENABLE_ANALYSIS_HISTORY` — optional contact form persistence and anonymous stats.
