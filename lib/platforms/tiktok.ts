import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { fetchJson, resolveRedirect } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef, isHostOfPlatform } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface TikWmResponse {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    cover?: string;
    origin_cover?: string;
    duration?: number;
    play?: string;
    hdplay?: string;
    wmplay?: string;
    size?: number;
    hd_size?: number;
    wm_size?: number;
    music?: string;
    images?: string[];
    author?: {
      unique_id?: string;
      nickname?: string;
    };
  };
}

interface TikTokOEmbed {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

const absTikWm = (u?: string) => (u ? (u.startsWith("http") ? u : `https://www.tikwm.com${u.startsWith("/") ? u : `/${u}`}`) : undefined);

export const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("tiktok", url);
    if (ref.kind === "profile" || ref.kind === "unknown") {
      return unsupported("tiktok", url.toString(), "Paste a link to a single public TikTok video. Profile and search pages aren't supported.");
    }

    try {
      let target = url;
      if (ref.needsResolve) {
        const resolved = await resolveRedirect(url, (u) => isHostOfPlatform("tiktok", u), ctx.signal);
        if (!resolved) return unavailable("tiktok", url.toString(), "This short link doesn't lead to a public TikTok video.");
        target = resolved;
      }
      const clean = new URL(target.origin + target.pathname);

      // 1. Primary extractor: TikWM public API (returns HD, no-watermark MP4, watermarked MP4, MP3 audio, and photo slides)
      const tikwm = await fetchJson<TikWmResponse>(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(clean.toString())}&hd=1`,
        { signal: ctx.signal, timeoutMs: 9000 }
      );

      if (tikwm.ok && tikwm.data?.code === 0 && tikwm.data.data) {
        const d = tikwm.data.data;
        const title = d.title?.trim() || "TikTok Video";
        const creator = d.author?.nickname || (d.author?.unique_id ? `@${d.author.unique_id}` : undefined);
        const creatorUrl = d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined;
        const formats: MediaFormat[] = [];

        const hdUrl = absTikWm(d.hdplay);
        const sdUrl = absTikWm(d.play);
        const wmUrl = absTikWm(d.wmplay);
        const musicUrl = absTikWm(d.music);

        if (hdUrl && hdUrl !== sdUrl) {
          formats.push({
            id: "hd-mp4",
            label: "HD Video",
            container: "mp4",
            quality: "HD",
            sizeBytes: d.hd_size,
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: hdUrl,
              filename: sanitizeFilename(title, "hd", "mp4"),
              contentType: "video/mp4",
            }),
          });
        }

        if (sdUrl) {
          formats.push({
            id: "sd-mp4",
            label: "Standard Video",
            container: "mp4",
            quality: "Standard",
            sizeBytes: d.size,
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: sdUrl,
              filename: sanitizeFilename(title, "sd", "mp4"),
              contentType: "video/mp4",
            }),
          });
        }

        if (wmUrl) {
          formats.push({
            id: "orig-mp4",
            label: "Original Video",
            container: "mp4",
            quality: "Original",
            sizeBytes: d.wm_size,
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: wmUrl,
              filename: sanitizeFilename(title, "original", "mp4"),
              contentType: "video/mp4",
            }),
          });
        }

        if (Array.isArray(d.images)) {
          d.images.slice(0, 10).forEach((img, idx) => {
            const imgUrl = absTikWm(img);
            if (!imgUrl) return;
            formats.push({
              id: `photo-${idx + 1}`,
              label: `Photo ${idx + 1}`,
              container: "jpg",
              quality: "Original",
              href: registerDownload({
                kind: "proxy",
                url: imgUrl,
                filename: sanitizeFilename(title, `photo-${idx + 1}`, "jpg"),
                contentType: "image/jpeg",
              }),
            });
          });
        }

        if (musicUrl) {
          formats.push({
            id: "audio-mp3",
            label: "Audio Only",
            container: "mp3",
            quality: "Audio",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: musicUrl,
              filename: sanitizeFilename(title, "audio", "mp3"),
              contentType: "audio/mpeg",
            }),
          });
        }

        return okResult("tiktok", {
          canonicalUrl: clean.toString(),
          title,
          creator,
          creatorUrl,
          thumbnailUrl: absTikWm(d.cover || d.origin_cover),
          durationSeconds: d.duration,
          mediaType: Array.isArray(d.images) && d.images.length > 0 && !sdUrl ? "image" : "video",
          formats,
        });
      }

      // 2. Fallback to TikTok oEmbed for metadata
      const res = await fetchJson<TikTokOEmbed>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(clean.toString())}`, { signal: ctx.signal });
      if (res.ok && res.data && (res.data.title || res.data.author_name)) {
        return okResult("tiktok", {
          canonicalUrl: clean.toString(),
          title: res.data.title,
          creator: res.data.author_name,
          creatorUrl: res.data.author_url,
          thumbnailUrl: res.data.thumbnail_url,
          mediaType: "video",
        });
      }
      if (res.status >= 400 && res.status < 500) {
        return unavailable("tiktok", clean.toString(), "This video is private, removed or not available in your region, so it can't be downloaded.");
      }
      return failed("tiktok");
    } catch {
      return failed("tiktok");
    }
  },
};
