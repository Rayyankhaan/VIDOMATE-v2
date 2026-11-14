import { PLATFORMS } from "./catalog";
import type { AnalysisResult, MediaAction, MediaInfo } from "@/types/media";
import type { PlatformId } from "@/types/platform";

export function openOriginal(url: string, platform: PlatformId): MediaAction {
  return {
    id: "open-original",
    kind: "open_original",
    label: `Open on ${PLATFORMS[platform].name}`,
    description: "View the original media on the platform.",
    href: url,
  };
}

export function officialHelp(platform: PlatformId): MediaAction {
  const p = PLATFORMS[platform];
  return {
    id: "official-help",
    kind: "official_help",
    label: `${p.name} official help`,
    description: p.officialOptionsNote,
    href: p.officialHelpUrl,
  };
}

const DOWNLOAD_NOTICE = "Download links are streamed directly from the source platform and expire after 15 minutes. Only save media you own or have permission to download.";
const NO_STREAMS_NOTICE = "Direct download streams were not exposed by the platform for this link from this server.";

export function okResult(
  platform: PlatformId,
  media: Omit<MediaInfo, "formats"> & { formats?: MediaInfo["formats"] },
  extra: Partial<AnalysisResult> = {}
): AnalysisResult {
  const formats = media.formats ?? [];
  const actions: MediaAction[] = [openOriginal(media.canonicalUrl, platform)];
  if (formats.length === 0) {
    actions.push(officialHelp(platform));
  }

  return {
    status: "ok",
    platform,
    media: { ...media, formats },
    actions,
    downloadSupport: formats.length ? "available" : "not_offered",
    message: formats.length
      ? undefined
      : `No downloadable stream could be extracted for this link right now. ${PLATFORMS[platform].officialOptionsNote}`,
    notices: [formats.length ? DOWNLOAD_NOTICE : NO_STREAMS_NOTICE],
    ...extra,
  };
}

export function notConfigured(platform: PlatformId, canonicalUrl: string): AnalysisResult {
  return {
    status: "not_configured",
    platform,
    message: `Integration not configured. The ${PLATFORMS[platform].name} integration needs server credentials that haven't been added to this site yet.`,
    actions: [openOriginal(canonicalUrl, platform), officialHelp(platform)],
    downloadSupport: "unknown",
  };
}

export function unsupported(platform: PlatformId, canonicalUrl: string, message: string): AnalysisResult {
  return {
    status: "unsupported",
    platform,
    message,
    actions: [openOriginal(canonicalUrl, platform), officialHelp(platform)],
    downloadSupport: "not_offered",
    notices: [NO_STREAMS_NOTICE],
  };
}

export function unavailable(platform: PlatformId, canonicalUrl: string, message: string): AnalysisResult {
  return {
    status: "unavailable",
    platform,
    message,
    actions: [openOriginal(canonicalUrl, platform)],
    downloadSupport: "unknown",
  };
}

export function failed(platform: PlatformId, message = "The platform didn't respond in time. Please try again in a moment."): AnalysisResult {
  return { status: "error", platform, message, actions: [], downloadSupport: "unknown" };
}
