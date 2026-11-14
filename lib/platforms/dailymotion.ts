import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { fetchJson, fetchText } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface DmVideo {
  title?: string;
  "owner.screenname"?: string;
  "owner.url"?: string;
  thumbnail_720_url?: string;
  duration?: number;
  url?: string;
  private?: boolean;
}

interface DmPlayerMeta {
  title?: string;
  duration?: number;
  url?: string;
  protected_delivery?: boolean;
  owner?: { screenname?: string; url?: string };
  posters?: Record<string, string>;
  qualities?: Record<string, { type?: string; url?: string }[]>;
  error?: { title?: string; message?: string };
}

function parseHlsVariants(m3u8Text: string, masterUrl: string): { quality: string; bandwidth: number; url: string }[] {
  const lines = m3u8Text.split(/\r?\n/);
  const variants: { quality: string; bandwidth: number; url: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line?.startsWith("#EXT-X-STREAM-INF:")) continue;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith("#")) continue;

    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
    const nameMatch = line.match(/NAME="([^"]+)"/);

    const height = resMatch?.[1] ?? nameMatch?.[1] ?? "auto";
    const quality = /^\d+$/.test(height) ? `${height}p` : height;
    const bandwidth = Number(bwMatch?.[1] ?? 0);

    try {
      const resolved = new URL(next, masterUrl).toString();
      variants.push({ quality, bandwidth, url: resolved });
    } catch {
      /* skip malformed variant URL */
    }
  }

  // Deduplicate by quality label, keeping highest bandwidth per resolution
  const byQuality = new Map<string, { quality: string; bandwidth: number; url: string }>();
  for (const v of variants) {
    const existing = byQuality.get(v.quality);
    if (!existing || v.bandwidth > existing.bandwidth) byQuality.set(v.quality, v);
  }

  return [...byQuality.values()].sort((a, b) => {
    const numA = parseInt(a.quality, 10) || 0;
    const numB = parseInt(b.quality, 10) || 0;
    return numB - numA || b.bandwidth - a.bandwidth;
  });
}

export const dailymotionAdapter: PlatformAdapter = {
  id: "dailymotion",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("dailymotion", url);
    if (!ref.id || !/^[a-z0-9]{4,12}$/i.test(ref.id)) {
      return unsupported("dailymotion", url.toString(), "Paste a link to a single public Dailymotion video (dailymotion.com/video/… or dai.ly/…).");
    }
    const canonical = `https://www.dailymotion.com/video/${ref.id}`;
    const fields = "title,owner.screenname,owner.url,thumbnail_720_url,duration,url,private";

    try {
      const [apiRes, metaRes] = await Promise.all([
        fetchJson<DmVideo>(`https://api.dailymotion.com/video/${ref.id}?fields=${fields}`, { signal: ctx.signal }),
        fetchJson<DmPlayerMeta>(`https://www.dailymotion.com/player/metadata/video/${ref.id}`, { signal: ctx.signal }),
      ]);

      const api = apiRes.data;
      const meta = metaRes.data;

      if (api?.private || meta?.error) {
        return unavailable("dailymotion", canonical, "This video is private, password-protected or removed, so it can't be downloaded.");
      }

      const title = meta?.title || api?.title;
      if (!title && !apiRes.ok && !metaRes.ok) {
        if (apiRes.status === 403 || apiRes.status === 404) {
          return unavailable("dailymotion", canonical, "This video is private, password-protected or removed.");
        }
        return failed("dailymotion");
      }

      const formats: MediaFormat[] = [];
      const qualities = meta?.qualities ?? {};

      // Check direct MP4 qualities first if present
      for (const [qKey, entries] of Object.entries(qualities)) {
        if (!Array.isArray(entries)) continue;
        for (const item of entries) {
          if (item.type === "video/mp4" && item.url) {
            const labelQuality = /^\d+$/.test(qKey) ? `${qKey}p` : qKey;
            formats.push({
              id: `mp4-${qKey}`,
              label: `Video ${labelQuality}`,
              container: "mp4",
              quality: labelQuality,
              hasAudio: true,
              href: registerDownload({
                kind: "proxy",
                url: item.url,
                filename: sanitizeFilename(title, labelQuality, "mp4"),
                contentType: "video/mp4",
              }),
            });
          }
        }
      }

      // Parse HLS master playlist if no direct MP4s were listed
      if (formats.length === 0) {
        const hlsUrl = qualities.auto?.find((q) => q.type?.includes("mpegURL") && q.url)?.url;
        if (hlsUrl) {
          const playlist = await fetchText(hlsUrl, { signal: ctx.signal, timeoutMs: 6000 }).catch(() => null);
          const variants = playlist?.ok ? parseHlsVariants(playlist.text, playlist.finalUrl) : [];
          if (variants.length > 0) {
            for (const v of variants) {
              formats.push({
                id: `hls-${v.quality}`,
                label: `Video (${v.quality})`,
                container: "mp4",
                quality: v.quality,
                hasAudio: true,
                href: registerDownload({
                  kind: "hls",
                  url: v.url,
                  filename: sanitizeFilename(title, v.quality, "mp4"),
                  contentType: "video/mp4",
                }),
              });
            }
          } else {
            formats.push({
              id: "hls-auto",
              label: "Video (Best Quality)",
              container: "mp4",
              quality: "Auto",
              hasAudio: true,
              href: registerDownload({
                kind: "hls",
                url: hlsUrl,
                filename: sanitizeFilename(title, "best", "mp4"),
                contentType: "video/mp4",
              }),
            });
          }
        }
      }

      const poster = meta?.posters?.["720"] || meta?.posters?.["480"] || Object.values(meta?.posters ?? {})[0] || api?.thumbnail_720_url;

      return okResult("dailymotion", {
        canonicalUrl: api?.url || meta?.url || canonical,
        title,
        creator: meta?.owner?.screenname || api?.["owner.screenname"],
        creatorUrl: meta?.owner?.url || api?.["owner.url"],
        thumbnailUrl: poster,
        durationSeconds: meta?.duration ?? api?.duration,
        mediaType: "video",
        formats,
      });
    } catch {
      return failed("dailymotion");
    }
  },
};
