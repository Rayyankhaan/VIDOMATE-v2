import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { getMetaContent } from "@/lib/utils/html";
import { BROWSER_UA, fetchJson, fetchText, resolveRedirect } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef, isHostOfPlatform } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface RedditPost {
  title?: string;
  author?: string;
  permalink?: string;
  over_18?: boolean;
  is_video?: boolean;
  thumbnail?: string;
  url_overridden_by_dest?: string;
  url?: string;
  preview?: {
    images?: { source?: { url?: string } }[];
    reddit_video_preview?: { fallback_url?: string; hls_url?: string; duration?: number; height?: number };
  };
  secure_media?: { reddit_video?: { fallback_url?: string; hls_url?: string; duration?: number; height?: number } } | null;
  media?: { reddit_video?: { fallback_url?: string; hls_url?: string; duration?: number; height?: number } } | null;
  post_hint?: string;
}

interface InfoResponse {
  data?: { children?: { data?: RedditPost }[] };
}

let cached: { token: string; exp: number } | null = null;
const configured = () => Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
const userAgent = () => `web:vidomate:1.0 (by /u/${process.env.REDDIT_CONTACT_USERNAME || "vidomate"})`;

async function getToken(signal: AbortSignal): Promise<string | null> {
  if (!configured()) return null;
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetchJson<{ access_token?: string; expires_in?: number }>("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": userAgent() },
    body: "grant_type=client_credentials",
    signal,
  });
  if (!res.ok || !res.data?.access_token) return null;
  cached = { token: res.data.access_token, exp: Date.now() + (res.data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function probeRedditAudio(fallbackUrl: string, signal: AbortSignal): Promise<string | undefined> {
  const base = fallbackUrl.split("?")[0].replace(/\/DASH_[^/]+$/, "");
  for (const candidate of ["DASH_AUDIO_128.mp4", "DASH_AUDIO_64.mp4", "DASH_audio.mp4", "audio"]) {
    const audioUrl = `${base}/${candidate}`;
    try {
      const r = await fetch(audioUrl, { method: "HEAD", headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) });
      if (r.ok) return audioUrl;
    } catch {
      /* ignore probe errors */
    }
  }
  return undefined;
}

export const redditAdapter: PlatformAdapter = {
  id: "reddit",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    let ref = extractMediaRef("reddit", url);
    if (ref.kind === "unknown") {
      return unsupported("reddit", url.toString(), "Paste a link to a single Reddit post. Subreddit and user pages aren't supported.");
    }

    try {
      let target = url;
      if (ref.needsResolve) {
        const resolved = await resolveRedirect(url, (u) => isHostOfPlatform("reddit", u), ctx.signal);
        if (!resolved) return unavailable("reddit", url.toString(), "This share link doesn't lead to a public Reddit post.");
        target = resolved;
        ref = extractMediaRef("reddit", target);
      }
      if (!ref.id || !/^[a-z0-9]{4,10}$/i.test(ref.id)) {
        return unavailable("reddit", target.toString(), "We couldn't find a post ID in this link.");
      }

      let post: RedditPost | undefined;

      // 1. OAuth endpoint when configured
      const token = await getToken(ctx.signal);
      if (token) {
        const res = await fetchJson<InfoResponse>(`https://oauth.reddit.com/api/info?id=t3_${ref.id}&raw_json=1`, {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent() },
          signal: ctx.signal,
        });
        post = res.data?.data?.children?.[0]?.data;
      }

      // 2. Public JSON endpoints fallback
      if (!post) {
        for (const endpoint of [
          `https://www.reddit.com/comments/${ref.id}.json?raw_json=1`,
          `https://old.reddit.com/comments/${ref.id}.json?raw_json=1`,
          `https://api.reddit.com/api/info?id=t3_${ref.id}&raw_json=1`,
        ]) {
          const res = await fetchJson<unknown>(endpoint, {
            headers: { "User-Agent": userAgent() },
            redirect: "follow",
            signal: ctx.signal,
          }).catch(() => null);
          if (!res?.ok || !res.data) continue;
          const raw = res.data as InfoResponse | InfoResponse[];
          post = Array.isArray(raw) ? raw[0]?.data?.children?.[0]?.data : raw.data?.children?.[0]?.data;
          if (post) break;
        }
      }

      if (post) {
        const canonical = post.permalink ? `https://www.reddit.com${post.permalink}` : target.toString();
        const preview = post.preview?.images?.[0]?.source?.url;
        const thumb = post.over_18 ? undefined : preview ?? (post.thumbnail?.startsWith("http") ? post.thumbnail : undefined);
        const rVideo = post.secure_media?.reddit_video ?? post.media?.reddit_video ?? post.preview?.reddit_video_preview;
        const formats: MediaFormat[] = [];

        if (rVideo?.fallback_url) {
          const audioUrl = await probeRedditAudio(rVideo.fallback_url, ctx.signal);
          const quality = rVideo.height ? `${rVideo.height}p` : "HD";
          if (audioUrl) {
            formats.push({
              id: "reddit-mux",
              label: `Video + Audio (${quality})`,
              container: "mp4",
              quality,
              hasAudio: true,
              href: registerDownload({
                kind: "mux",
                url: rVideo.fallback_url,
                audioUrl,
                filename: sanitizeFilename(post.title, quality, "mp4"),
                contentType: "video/mp4",
              }),
            });
          } else if (rVideo.hls_url) {
            formats.push({
              id: "reddit-hls",
              label: `Video (${quality})`,
              container: "mp4",
              quality,
              hasAudio: true,
              href: registerDownload({
                kind: "hls",
                url: rVideo.hls_url,
                filename: sanitizeFilename(post.title, quality, "mp4"),
                contentType: "video/mp4",
              }),
            });
          }
          formats.push({
            id: "reddit-video-only",
            label: `Video Stream (${quality})`,
            container: "mp4",
            quality,
            hasAudio: false,
            href: registerDownload({
              kind: "proxy",
              url: rVideo.fallback_url,
              filename: sanitizeFilename(post.title, `${quality}-video`, "mp4"),
              contentType: "video/mp4",
            }),
          });
        } else {
          const mediaUrl = post.url_overridden_by_dest || post.url;
          if (mediaUrl && /\.(mp4|gif|jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl)) {
            const ext = mediaUrl.match(/\.(mp4|gif|jpg|jpeg|png|webp)(?:\?|$)/i)?.[1]?.toLowerCase() || "jpg";
            const mime = ext === "mp4" ? "video/mp4" : ext === "gif" ? "image/gif" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
            formats.push({
              id: "reddit-media",
              label: ext === "mp4" ? "Video" : ext === "gif" ? "GIF" : "Original Image",
              container: ext,
              quality: "Original",
              href: registerDownload({
                kind: "proxy",
                url: mediaUrl,
                filename: sanitizeFilename(post.title, "reddit", ext),
                contentType: mime,
              }),
            });
          }
        }

        return okResult(
          "reddit",
          {
            canonicalUrl: canonical,
            title: post.title,
            creator: post.author ? `u/${post.author}` : undefined,
            creatorUrl: post.author ? `https://www.reddit.com/user/${post.author}` : undefined,
            thumbnailUrl: thumb,
            durationSeconds: rVideo?.duration,
            mediaType: rVideo ? "video" : post.post_hint === "image" ? "image" : "post",
            formats,
          },
          post.over_18 ? { notices: ["This post is marked 18+. The thumbnail is hidden."] } : {}
        );
      }

      // 3. HTML OpenGraph fallback
      const page = await fetchText(target.toString(), { signal: ctx.signal, timeoutMs: 6000 }).catch(() => null);
      if (page?.ok && page.text) {
        const title = getMetaContent(page.text, "og:title");
        const ogVideo = getMetaContent(page.text, "og:video");
        const ogImage = getMetaContent(page.text, "og:image");
        const formats: MediaFormat[] = [];
        if (ogVideo) {
          formats.push({
            id: "reddit-og-video",
            label: "Video",
            container: "mp4",
            quality: "HD",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: ogVideo,
              filename: sanitizeFilename(title, "video", "mp4"),
              contentType: "video/mp4",
            }),
          });
        }
        if (title || ogVideo || ogImage) {
          return okResult("reddit", {
            canonicalUrl: target.toString(),
            title,
            thumbnailUrl: ogImage,
            mediaType: ogVideo ? "video" : "post",
            formats,
          });
        }
      }

      return unavailable(
        "reddit",
        target.toString(),
        "Reddit blocked unauthenticated requests from this server IP. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in environment settings, or verify the post is public."
      );
    } catch {
      return failed("reddit");
    }
  },
};
