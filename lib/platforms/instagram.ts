import "server-only";
import { registerDownload, sanitizeFilename } from "@/lib/download/tokens";
import { decodeHtmlEntities, getMetaContent } from "@/lib/utils/html";
import { fetchJson, fetchText } from "@/lib/utils/http";
import type { MediaFormat } from "@/types/media";
import { extractMediaRef } from "./detector";
import { failed, okResult, unavailable, unsupported } from "./result";
import type { PlatformAdapter } from "./types";

interface MetaOEmbed {
  author_name?: string;
  author_url?: string;
  title?: string;
  thumbnail_url?: string;
}

const token = () => process.env.META_OEMBED_ACCESS_TOKEN;

function unescapeJsonUrl(raw: string): string {
  return decodeHtmlEntities(raw).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

export const instagramAdapter: PlatformAdapter = {
  id: "instagram",
  mode: "ready",
  isConfigured: () => true,

  async analyze(url, ctx) {
    const ref = extractMediaRef("instagram", url);
    const original = url.toString();

    if (ref.kind === "story") {
      return unsupported(
        "instagram",
        original,
        "Instagram Stories require an authenticated account and aren't exposed publicly."
      );
    }
    if (ref.kind === "profile") {
      return unsupported("instagram", original, "Profile pages can't be downloaded. Paste a link to a single public Reel, photo or video post.");
    }
    if (!ref.id) {
      return unsupported("instagram", original, "We couldn't find a post in this link. Paste a public Reel, photo, video or carousel link.");
    }

    const canonicalPath = ref.kind === "reel" ? "reel" : ref.kind === "igtv" ? "tv" : "p";
    const canonical = `https://www.instagram.com/${canonicalPath}/${ref.id}/`;

    try {
      const formats: MediaFormat[] = [];
      let title: string | undefined;
      let creator: string | undefined;
      let creatorUrl: string | undefined;
      let thumb: string | undefined;

      // 1. Try public embed page and post HTML for direct media URLs
      const [embedRes, pageRes] = await Promise.all([
        fetchText(`https://www.instagram.com/p/${ref.id}/embed/captioned/`, { signal: ctx.signal, timeoutMs: 7000 }).catch(() => null),
        fetchText(canonical, { signal: ctx.signal, timeoutMs: 7000 }).catch(() => null),
      ]);

      const blobs = [embedRes?.ok ? embedRes.text : "", pageRes?.ok ? pageRes.text : ""].filter(Boolean);

      for (const html of blobs) {
        if (!title) title = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
        if (!thumb) thumb = getMetaContent(html, "og:image");

        const ogVideo = getMetaContent(html, "og:video") || getMetaContent(html, "og:video:secure_url");
        const videoJsonMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/)?.[1];
        const videoVersionsMatch = html.match(/"video_versions"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/)?.[1];

        const videoUrl = [videoJsonMatch, videoVersionsMatch, ogVideo]
          .filter((u): u is string => Boolean(u))
          .map(unescapeJsonUrl)
          .find((u) => u.startsWith("https://"));

        if (videoUrl && !formats.some((f) => f.id === "ig-video")) {
          formats.push({
            id: "ig-video",
            label: ref.kind === "reel" ? "Reel Video" : "Instagram Video",
            container: "mp4",
            quality: "HD",
            hasAudio: true,
            href: registerDownload({
              kind: "proxy",
              url: videoUrl,
              filename: sanitizeFilename(title || `instagram-${ref.id}`, "video", "mp4"),
              contentType: "video/mp4",
              headers: { Referer: "https://www.instagram.com/" },
            }),
          });
        }

        const displayJsonMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/)?.[1];
        const embedImgMatch = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)?.[1];
        const imageUrl = [displayJsonMatch, embedImgMatch, thumb]
          .filter((u): u is string => Boolean(u))
          .map(unescapeJsonUrl)
          .find((u) => u.startsWith("https://"));

        if (!thumb && imageUrl) thumb = imageUrl;

        if (imageUrl && formats.length === 0) {
          formats.push({
            id: "ig-image",
            label: "Post Photo",
            container: "jpg",
            quality: "Original",
            href: registerDownload({
              kind: "proxy",
              url: imageUrl,
              filename: sanitizeFilename(title || `instagram-${ref.id}`, "photo", "jpg"),
              contentType: "image/jpeg",
              headers: { Referer: "https://www.instagram.com/" },
            }),
          });
        }

        if (!creator) {
          const usernameMatch = html.match(/"username"\s*:\s*"([a-zA-Z0-9._]+)"/)?.[1] || html.match(/class="UsernameText"[^>]*>([^<]+)</)?.[1];
          if (usernameMatch) {
            creator = `@${usernameMatch.replace(/^@/, "")}`;
            creatorUrl = `https://www.instagram.com/${usernameMatch.replace(/^@/, "")}/`;
          }
        }
      }

      // 2. Enrich via Meta oEmbed if configured
      const t = token();
      if (t && (!title || !thumb)) {
        const api = `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(canonical)}&omitscript=true&access_token=${encodeURIComponent(t)}`;
        const res = await fetchJson<MetaOEmbed>(api, { signal: ctx.signal }).catch(() => null);
        if (res?.ok && res.data) {
          title = title || res.data.title;
          creator = creator || res.data.author_name;
          creatorUrl = creatorUrl || res.data.author_url;
          thumb = thumb || res.data.thumbnail_url;
        }
      }

      if (!title && !thumb && formats.length === 0) {
        return unavailable(
          "instagram",
          canonical,
          "Instagram didn't expose public media for this post (it may be private, age-restricted, or require login from this server)."
        );
      }

      return okResult("instagram", {
        canonicalUrl: canonical,
        title: title || `Instagram ${ref.kind === "reel" ? "Reel" : "Post"}`,
        creator,
        creatorUrl,
        thumbnailUrl: thumb,
        mediaType: formats.some((f) => f.container === "mp4") ? "video" : ref.kind === "post" ? "post" : "video",
        formats,
      });
    } catch {
      return failed("instagram");
    }
  },
};
