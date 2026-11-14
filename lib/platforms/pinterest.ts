import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { decodeHtmlEntities, getMetaContent } from "@/lib/utils/html";
import { fetchJson, fetchText, resolveRedirect } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef, isHostOfPlatform } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface PinResponse {
  title?: string | null;
  description?: string | null;
  media?: {
    media_type?: string;
    images?: Record<string, { url: string }>;
  };
}

const token = () => process.env.PINTEREST_ACCESS_TOKEN;

export const pinterestAdapter: PlatformAdapter = {
  id: "pinterest",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    let ref = extractMediaRef("pinterest", url);
    if (ref.kind === "unknown") {
      return unsupported("pinterest", url.toString(), "Paste a link to a single pin (pinterest.com/pin/…). Boards and profiles aren't supported.");
    }

    try {
      let target = url;
      if (ref.needsResolve) {
        const resolved = await resolveRedirect(url, (u) => isHostOfPlatform("pinterest", u), ctx.signal);
        if (!resolved) return unavailable("pinterest", url.toString(), "This short link doesn't lead to a Pinterest pin.");
        target = resolved;
        ref = extractMediaRef("pinterest", target);
      }
      if (!ref.id || !/^\d+$/.test(ref.id)) {
        return unavailable("pinterest", target.toString(), "We couldn't find a pin ID in this link.");
      }

      const canonical = `https://www.pinterest.com/pin/${ref.id}/`;
      const formats: MediaFormat[] = [];
      let title: string | undefined;
      let thumb: string | undefined;
      let mediaType: "video" | "image" | "post" = "image";

      // 1. Fetch public Pinterest pin page for video/image extraction
      const page = await fetchText(canonical, { signal: ctx.signal, timeoutMs: 8000 }).catch(() => null);
      if (page?.ok && page.text) {
        const html = page.text;
        title = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
        const ogImage = getMetaContent(html, "og:image");
        const ogVideo = getMetaContent(html, "og:video") || getMetaContent(html, "og:video:secure_url");
        thumb = ogImage;

        // Extract direct Pinterest MP4 videos embedded in pin JSON
        const mp4Matches = [...html.matchAll(/https:\/\/v\d+\.pinimg\.com\/videos\/[^"\\\s<>]+\.mp4/g)].map((m) =>
          decodeHtmlEntities(m[0])
        );
        const videoCandidates = Array.from(new Set([ogVideo, ...mp4Matches].filter((u): u is string => Boolean(u && u.includes(".mp4")))));

        if (videoCandidates.length > 0) {
          mediaType = "video";
          const bestVideo = videoCandidates.find((v) => v.includes("720p")) || videoCandidates[0];
          formats.push({
            id: "pin-video",
            label: "Pin Video",
            container: "mp4",
            quality: bestVideo.includes("720p") ? "720p" : "HD",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: bestVideo,
              filename: sanitizeFilename(title || `pin-${ref.id}`, "video", "mp4"),
              contentType: "video/mp4",
            }),
          });
        }

        // Extract original full-resolution pin image
        const origImg = html.match(/https:\/\/i\.pinimg\.com\/originals\/[^"\\\s<>]+\.(?:jpg|jpeg|png|webp|gif)/i)?.[0];
        const imageUrl = origImg ? decodeHtmlEntities(origImg) : ogImage;
        if (imageUrl) {
          const ext = imageUrl.match(/\.(png|webp|gif)(?:\?|$)/i)?.[1]?.toLowerCase() || "jpg";
          const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
          formats.push({
            id: "pin-image",
            label: origImg ? "Original Image" : "Pin Image",
            container: ext,
            quality: origImg ? "Original" : "HD",
            href: registerDownload({
              kind: "proxy",
              url: imageUrl,
              filename: sanitizeFilename(title || `pin-${ref.id}`, "image", ext),
              contentType: mime,
            }),
          });
          if (!thumb) thumb = imageUrl;
        }
      }

      // 2. Enrich or fallback using Pinterest API v5 if token is configured
      const t = token();
      if (t && (!title || formats.length === 0)) {
        const res = await fetchJson<PinResponse>(`https://api.pinterest.com/v5/pins/${ref.id}`, {
          headers: { Authorization: `Bearer ${t}` },
          signal: ctx.signal,
        });
        if (res.ok && res.data) {
          title = title || res.data.title || res.data.description || undefined;
          const imgs = res.data.media?.images;
          const apiThumb = imgs ? (imgs["originals"] ?? imgs["600x"] ?? imgs["400x300"] ?? Object.values(imgs)[0])?.url : undefined;
          if (!thumb) thumb = apiThumb;
          if (apiThumb && formats.length === 0) {
            formats.push({
              id: "pin-api-image",
              label: "Pin Image",
              container: "jpg",
              quality: "High",
              href: registerDownload({
                kind: "proxy",
                url: apiThumb,
                filename: sanitizeFilename(title || `pin-${ref.id}`, "image", "jpg"),
                contentType: "image/jpeg",
              }),
            });
          }
          if (res.data.media?.media_type === "video") mediaType = "video";
        }
      }

      if (!title && !thumb && formats.length === 0) {
        return unavailable("pinterest", canonical, "This pin was removed, is private, or didn't expose public media.");
      }

      return okResult("pinterest", {
        canonicalUrl: canonical,
        title: title || `Pinterest Pin ${ref.id}`,
        thumbnailUrl: thumb,
        mediaType,
        formats,
      });
    } catch {
      return failed("pinterest");
    }
  },
};
