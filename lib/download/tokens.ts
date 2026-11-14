import "server-only";
import { randomUUID } from "node:crypto";

export interface DownloadEntry {
  kind: "proxy" | "hls" | "mux";
  url: string;
  audioUrl?: string;
  filename: string;
  contentType: string;
  headers?: Record<string, string>;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 2000;

declare global {
  // eslint-disable-next-line no-var
  var __vidomateDownloads: Map<string, DownloadEntry> | undefined;
}

function getStore(): Map<string, DownloadEntry> {
  if (!globalThis.__vidomateDownloads) {
    globalThis.__vidomateDownloads = new Map<string, DownloadEntry>();
  }
  return globalThis.__vidomateDownloads;
}

function prune(store: Map<string, DownloadEntry>, now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  if (store.size >= MAX_ENTRIES) {
    const excess = store.size - Math.floor(MAX_ENTRIES * 0.8);
    let i = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++i >= excess) break;
    }
  }
}

export function sanitizeFilename(title: string | undefined, suffix: string | undefined, ext: string): string {
  const base = (title || "vidomate-media")
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  const cleanBase = base || "vidomate-media";
  const cleanSuffix = suffix ? `-${suffix.replace(/[^a-zA-Z0-9_-]+/g, "")}` : "";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || "mp4";
  return `${cleanBase}${cleanSuffix}.${cleanExt}`;
}

export function registerDownload(entry: Omit<DownloadEntry, "expiresAt">): string {
  const store = getStore();
  const now = Date.now();
  prune(store, now);
  const token = randomUUID();
  store.set(token, { ...entry, expiresAt: now + TTL_MS });
  return `/api/download?token=${encodeURIComponent(token)}`;
}

export function getDownloadEntry(token: string): DownloadEntry | null {
  if (!token || token.length > 100) return null;
  const store = getStore();
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }
  return entry;
}
