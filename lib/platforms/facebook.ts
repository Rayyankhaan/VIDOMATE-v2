import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { decodeHtmlEntities, getMetaContent } from "@/lib/utils/html";
import { fetchJson, fetchText, resolveRedirect } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef, isHostOfPlatform } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface MetaOEmbed {
  author_name?: string;
  author_url?: string;
  title?: string;
  thumbnail_url?: string;
}

const token = () => process.env.META_OEMBED_ACCESS_TOKEN;

function cleanFbUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = decodeHtmlEntities(raw).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  return cleaned.startsWith("https://") ? cleaned : undefined;
}

export const facebookAdapter: PlatformAdapter = {
  id: "facebook",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("facebook", url);
    if (ref.kind === "unknown") {
      return unsupported("facebook", url.toString(), "We couldn't find a video in this link. Paste a public Facebook video, Watch or Reel link.");
    }

    try {
      let target = url;
      if (ref.needsResolve) {
        const resolved = await resolveRedirect(url, (u) => isHostOfPlatform("facebook", u), ctx.signal);
        if (!resolved) return unavailable("facebook", url.toString(), "This short link doesn't lead to a public Facebook video.");
        target = resolved;
      }

      const canonical = target.toString();
      const formats: MediaFormat[] = [];
      let title: string | undefined;
      let creator: string | undefined;
      let creatorUrl: string | undefined;
      let thumb: string | undefined;

      const page = await fetchText(canonical, {
        headers: {
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
        },
        signal: ctx.signal,
        timeoutMs: 8000,
      }).catch(() => null);

      if (page?.ok && page.text) {
        const html = page.text;
        title = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
        thumb = getMetaContent(html, "og:image");

        const hdUrl =
          cleanFbUrl(html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/)?.[1]) ||
          cleanFbUrl(html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/)?.[1]) ||
          cleanFbUrl(html.match(/hd_src\s*:\s*"([^"]+)"/)?.[1]);

        const sdUrl =
          cleanFbUrl(html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/)?.[1]) ||
          cleanFbUrl(html.match(/"playable_url"\s*:\s*"([^"]+)"/)?.[1]) ||
          cleanFbUrl(html.match(/sd_src\s*:\s*"([^"]+)"/)?.[1]) ||
          cleanFbUrl(getMetaContent(html, "og:video") || getMetaContent(html, "og:video:secure_url"));

        if (hdUrl) {
          formats.push({
            id: "fb-hd",
            label: "HD Video",
            container: "mp4",
            quality: "HD",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: hdUrl,
              filename: sanitizeFilename(title || "facebook-video", "hd", "mp4"),
              contentType: "video/mp4",
              headers: { Referer: "https://www.facebook.com/" },
            }),
          });
        }
        if (sdUrl && sdUrl !== hdUrl) {
          formats.push({
            id: "fb-sd",
            label: "SD Video",
            container: "mp4",
            quality: "SD",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: sdUrl,
              filename: sanitizeFilename(title || "facebook-video", "sd", "mp4"),
              contentType: "video/mp4",
              headers: { Referer: "https://www.facebook.com/" },
            }),
          });
        }
      }

      const t = token();
      if (t && (!title || !thumb)) {
        const api = `https://graph.facebook.com/v21.0/oembed_video?url=${encodeURIComponent(canonical)}&omitscript=true&access_token=${encodeURIComponent(t)}`;
        const res = await fetchJson<MetaOEmbed>(api, { signal: ctx.signal }).catch(() => null);
        if (res?.ok && res.data) {
          title = title || res.data.title;
          creator = res.data.author_name;
          creatorUrl = res.data.author_url;
          thumb = thumb || res.data.thumbnail_url;
        }
      }

      if (!title && !thumb && formats.length === 0) {
        return unavailable(
          "facebook",
          canonical,
          "Facebook didn't expose public video streams for this link (it may be private, friends-only, or login-gated)."
        );
      }

      return okResult("facebook", {
        canonicalUrl: canonical,
        title: title || "Facebook Video",
        creator,
        creatorUrl,
        thumbnailUrl: thumb,
        mediaType: "video",
        formats,
      });
    } catch {
      return failed("facebook");
    }
  },
};
