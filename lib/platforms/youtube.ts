import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { fetchJson } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface OEmbed {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

interface VideosList {
  items?: {
    snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: Record<string, { url: string }> };
    contentDetails?: { duration?: string };
  }[];
}

interface InnerTubeFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
  contentLength?: string;
  bitrate?: number;
  height?: number;
}

interface InnerTubeResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; channelId?: string; lengthSeconds?: string };
  streamingData?: {
    formats?: InnerTubeFormat[];
    adaptiveFormats?: InnerTubeFormat[];
  };
}

interface CobaltResponse {
  status?: string;
  url?: string;
  filename?: string;
  picker?: { type?: string; url?: string }[];
}

function isoDurationToSeconds(iso?: string): number | undefined {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

async function tryCobalt(canonical: string, title: string | undefined, signal: AbortSignal): Promise<MediaFormat[]> {
  const base = process.env.COBALT_API_URL?.replace(/\/$/, "");
  if (!base) return [];
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.COBALT_API_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_API_KEY}`;

  const [vidRes, audRes] = await Promise.all([
    fetchJson<CobaltResponse>(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: canonical, videoQuality: "1080", filenameStyle: "basic" }),
      signal,
      timeoutMs: 8000,
    }).catch(() => null),
    fetchJson<CobaltResponse>(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: canonical, downloadMode: "audio", audioFormat: "mp3" }),
      signal,
      timeoutMs: 8000,
    }).catch(() => null),
  ]);

  const formats: MediaFormat[] = [];
  if (vidRes?.ok && vidRes.data?.url) {
    formats.push({
      id: "yt-cobalt-mp4",
      label: "Video (1080p / Best)",
      container: "mp4",
      quality: "1080p",
      hasAudio: true,
      href: registerDownload({
        kind: "proxy",
        url: vidRes.data.url,
        filename: sanitizeFilename(title, "video", "mp4"),
        contentType: "video/mp4",
      }),
    });
  }
  if (audRes?.ok && audRes.data?.url) {
    formats.push({
      id: "yt-cobalt-mp3",
      label: "Audio Only",
      container: "mp3",
      quality: "Audio",
      hasAudio: true,
      href: registerDownload({
        kind: "proxy",
        url: audRes.data.url,
        filename: sanitizeFilename(title, "audio", "mp3"),
        contentType: "audio/mpeg",
      }),
    });
  }
  return formats;
}

async function tryInnerTube(videoId: string, signal: AbortSignal): Promise<InnerTubeResponse | null> {
  const cookies = process.env.YOUTUBE_COOKIES;
  const clients = [
    {
      ua: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
      context: { client: { clientName: "IOS", clientVersion: "19.29.1", deviceMake: "Apple", deviceModel: "iPhone16,2", hl: "en", gl: "US" } },
    },
    {
      ua: "com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
      context: { client: { clientName: "ANDROID_VR", clientVersion: "1.56.21", deviceMake: "Oculus", deviceModel: "Quest 3", osName: "Android", osVersion: "12L", androidSdkVersion: 32, hl: "en", gl: "US" } },
    },
  ];

  for (const c of clients) {
    const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": c.ua };
    if (cookies) headers.Cookie = cookies;
    const res = await fetchJson<InnerTubeResponse>("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers,
      body: JSON.stringify({ videoId, context: c.context }),
      signal,
      timeoutMs: 6000,
    }).catch(() => null);

    if (res?.ok && res.data?.streamingData && ((res.data.streamingData.formats?.length ?? 0) > 0 || (res.data.streamingData.adaptiveFormats?.length ?? 0) > 0)) {
      return res.data;
    }
  }
  return null;
}

export const youtubeAdapter: PlatformAdapter = {
  id: "youtube",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("youtube", url);
    const original = url.toString();

    if (!ref.id) {
      return unsupported(
        "youtube",
        original,
        ref.kind === "non-media"
          ? "Playlists, channels and search pages aren't supported. Paste a link to a single video."
          : "We couldn't find a video in this link. Paste a full YouTube video, Shorts or Music link."
      );
    }

    const canonical = `https://www.youtube.com/watch?v=${ref.id}`;
    const key = process.env.YOUTUBE_API_KEY;

    try {
      let title: string | undefined;
      let creator: string | undefined;
      let creatorUrl: string | undefined;
      let thumbnailUrl: string | undefined;
      let durationSeconds: number | undefined;

      if (key) {
        const api = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ref.id}&key=${encodeURIComponent(key)}`;
        const res = await fetchJson<VideosList>(api, { signal: ctx.signal }).catch(() => null);
        const item = res?.data?.items?.[0];
        if (res?.ok && item) {
          const thumbs = item.snippet?.thumbnails;
          title = item.snippet?.title;
          creator = item.snippet?.channelTitle;
          creatorUrl = item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : undefined;
          thumbnailUrl = (thumbs?.maxres ?? thumbs?.high ?? thumbs?.medium ?? thumbs?.default)?.url;
          durationSeconds = isoDurationToSeconds(item.contentDetails?.duration);
        } else if (res?.ok && !item) {
          return unavailable("youtube", canonical, "This video is private, removed or not available in our region.");
        }
      }

      if (!title) {
        const oembed = await fetchJson<OEmbed>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`, { signal: ctx.signal });
        if (oembed.ok && oembed.data) {
          title = oembed.data.title;
          creator = oembed.data.author_name;
          creatorUrl = oembed.data.author_url;
          thumbnailUrl = oembed.data.thumbnail_url;
        } else if (oembed.status === 401 || oembed.status === 403 || oembed.status === 404) {
          return unavailable("youtube", canonical, "This video is private, removed, age-restricted or has embedding disabled.");
        } else {
          return failed("youtube");
        }
      }

      const formats: MediaFormat[] = await tryCobalt(canonical, title, ctx.signal);

      if (formats.length === 0) {
        const ytData = await tryInnerTube(ref.id, ctx.signal);
        if (ytData?.streamingData) {
          if (!durationSeconds && ytData.videoDetails?.lengthSeconds) {
            durationSeconds = Number(ytData.videoDetails.lengthSeconds) || undefined;
          }
          const muxed = (ytData.streamingData.formats ?? []).filter((f) => f.url && f.mimeType?.includes("video/mp4"));
          for (const f of muxed.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))) {
            const q = f.qualityLabel || (f.height ? `${f.height}p` : "Standard");
            formats.push({
              id: `yt-mp4-${f.itag ?? q}`,
              label: `Video (${q})`,
              container: "mp4",
              quality: q,
              sizeBytes: f.contentLength ? Number(f.contentLength) : undefined,
              hasAudio: true,
              href: registerDownload({
                kind: "proxy",
                url: f.url!,
                filename: sanitizeFilename(title, q, "mp4"),
                contentType: "video/mp4",
              }),
            });
          }

          const adaptive = ytData.streamingData.adaptiveFormats ?? [];
          const bestAudio = adaptive
            .filter((f) => f.url && f.mimeType?.includes("audio/mp4"))
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

          if (bestAudio?.url) {
            // Add high-res MP4 (1080p/1440p/2160p) muxed via ffmpeg
            const hdStreams = adaptive
              .filter((f) => f.url && f.mimeType?.includes("video/mp4") && (f.height ?? 0) >= 1080)
              .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
            const seenHeights = new Set<number>();
            for (const v of hdStreams) {
              if (!v.height || seenHeights.has(v.height)) continue;
              seenHeights.add(v.height);
              const q = v.qualityLabel || `${v.height}p`;
              formats.unshift({
                id: `yt-hd-${v.height}`,
                label: `HD Video (${q})`,
                container: "mp4",
                quality: q,
                hasAudio: true,
                href: registerDownload({
                  kind: "mux",
                  url: v.url!,
                  audioUrl: bestAudio.url,
                  filename: sanitizeFilename(title, q, "mp4"),
                  contentType: "video/mp4",
                }),
              });
              if (seenHeights.size >= 2) break;
            }

            formats.push({
              id: "yt-audio-m4a",
              label: "Audio Only",
              container: "m4a",
              quality: "High",
              sizeBytes: bestAudio.contentLength ? Number(bestAudio.contentLength) : undefined,
              hasAudio: true,
              href: registerDownload({
                kind: "proxy",
                url: bestAudio.url,
                filename: sanitizeFilename(title, "audio", "m4a"),
                contentType: "audio/mp4",
              }),
            });
          }
        }
      }

      const notices =
        formats.length === 0
          ? [
              "YouTube blocked unauthenticated stream extraction from this cloud server IP. Configure YOUTUBE_COOKIES or COBALT_API_URL in environment variables to enable direct YouTube MP4/M4A downloads.",
            ]
          : undefined;

      return okResult(
        "youtube",
        {
          canonicalUrl: canonical,
          title,
          creator,
          creatorUrl,
          thumbnailUrl,
          durationSeconds,
          mediaType: "video",
          formats,
        },
        notices ? { notices } : {}
      );
    } catch {
      return failed("youtube");
    }
  },
};
