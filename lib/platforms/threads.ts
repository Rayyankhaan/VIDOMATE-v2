import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { decodeHtmlEntities, getMetaContent } from "@/lib/utils/html";
import { fetchText } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

function cleanUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = decodeHtmlEntities(raw).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  return cleaned.startsWith("https://") ? cleaned : undefined;
}

export const threadsAdapter: PlatformAdapter = {
  id: "threads",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("threads", url);
    const canonical = url.toString();
    if (!ref.id) {
      return unsupported("threads", canonical, "Paste a link to a single Threads post (threads.net/@user/post/…).");
    }

    try {
      const page = await fetchText(canonical, { signal: ctx.signal, timeoutMs: 8000 }).catch(() => null);
      if (!page?.ok || !page.text) {
        return unavailable("threads", canonical, "This Threads post couldn't be loaded publicly from this server.");
      }

      const html = page.text;
      const title = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
      const ogImage = cleanUrl(getMetaContent(html, "og:image"));
      const ogVideo = cleanUrl(getMetaContent(html, "og:video") || getMetaContent(html, "og:video:secure_url"));
      const jsonVideo = cleanUrl(html.match(/"video_versions"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/)?.[1]);
      const videoUrl = jsonVideo || ogVideo;

      const formats: MediaFormat[] = [];
      if (videoUrl) {
        formats.push({
          id: "threads-video",
          label: "Threads Video",
          container: "mp4",
          quality: "HD",
          hasAudio: true,
          href: registerDownload({
            kind: "proxy",
            url: videoUrl,
            filename: sanitizeFilename(title || `threads-${ref.id}`, "video", "mp4"),
            contentType: "video/mp4",
          }),
        });
      }
      if (ogImage && !videoUrl) {
        formats.push({
          id: "threads-image",
          label: "Post Image",
          container: "jpg",
          quality: "Original",
          href: registerDownload({
            kind: "proxy",
            url: ogImage,
            filename: sanitizeFilename(title || `threads-${ref.id}`, "image", "jpg"),
            contentType: "image/jpeg",
          }),
        });
      }

      if (!title && !ogImage && formats.length === 0) {
        return unavailable("threads", canonical, "Threads didn't expose public media details for this post.");
      }

      return okResult("threads", {
        canonicalUrl: canonical,
        title: title || "Threads Post",
        thumbnailUrl: ogImage,
        mediaType: videoUrl ? "video" : ogImage ? "image" : "post",
        formats,
      });
    } catch {
      return failed("threads");
    }
  },
};
