import type { AnalysisStatus, PlatformId } from "./platform";

export interface MediaFormat {
  id: string;
  label: string;
  container?: string;
  quality?: string;
  sizeBytes?: number;
  hasAudio?: boolean;
  /** Download endpoint (/api/download?token=...) or direct authorized URL. */
  href: string;
}

export interface MediaInfo {
  title?: string;
  creator?: string;
  creatorUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  mediaType?: "video" | "image" | "audio" | "post" | "unknown";
  canonicalUrl: string;
  /** Downloadable formats for this media item. */
  formats: MediaFormat[];
}

export interface MediaAction {
  id: string;
  label: string;
  description?: string;
  href: string;
  kind: "open_original" | "official_help" | "download";
}

export interface AnalysisResult {
  status: AnalysisStatus;
  platform: PlatformId | null;
  /** User-facing explanation for any non-"ok" status (and context for "ok"). */
  message?: string;
  media?: MediaInfo;
  actions: MediaAction[];
  /** Statement of whether downloadable files were extracted. */
  downloadSupport: "available" | "not_offered" | "unknown";
  notices?: string[];
}
