import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BROWSER_UA } from "@/lib/utils/http";
import { assertPublicUrl } from "@/lib/validation/ssrf";
import { getDownloadEntry, type DownloadEntry } from "./tokens";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface DownloadJob {
  id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  filename: string;
  contentType: string;
  filePath: string;
  sizeBytes?: number;
  error?: string;
  createdAt: number;
  expiresAt: number;
}

const JOB_DIR = "/tmp/vidomate-jobs";
const JOB_TTL_MS = 15 * 60 * 1000;
const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250 MB safety cap
const MAX_JOBS = 300;

declare global {
  // eslint-disable-next-line no-var
  var __vidomateJobs: Map<string, DownloadJob> | undefined;
}

function getJobStore(): Map<string, DownloadJob> {
  if (!globalThis.__vidomateJobs) {
    globalThis.__vidomateJobs = new Map<string, DownloadJob>();
  }
  return globalThis.__vidomateJobs;
}

async function cleanupExpiredJobs() {
  const store = getJobStore();
  const now = Date.now();
  for (const [id, job] of store) {
    if (job.expiresAt <= now || store.size > MAX_JOBS) {
      store.delete(id);
      await fs.unlink(job.filePath).catch(() => undefined);
      if (store.size <= Math.floor(MAX_JOBS * 0.8) && job.expiresAt > now) break;
    }
  }
}

function buildHeaderString(headers?: Record<string, string>): string | undefined {
  if (!headers) return undefined;
  const lines = Object.entries(headers)
    .filter(([k]) => k.toLowerCase() !== "user-agent")
    .map(([k, v]) => `${k}: ${v}`);
  return lines.length > 0 ? `${lines.join("\r\n")}\r\n` : undefined;
}

async function runProxyJob(job: DownloadJob, entry: DownloadEntry): Promise<void> {
  job.status = "processing";
  job.stage = "Connecting to media source…";
  job.progress = 5;

  const res = await fetch(entry.url, {
    method: "GET",
    headers: { "User-Agent": BROWSER_UA, ...entry.headers },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Source server returned HTTP ${res.status}.`);
  }

  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES) {
    await res.body.cancel().catch(() => undefined);
    throw new Error("Media file exceeds the 250 MB maximum size limit.");
  }

  const upstreamType = res.headers.get("content-type")?.split(";")[0]?.trim();
  if (upstreamType && (upstreamType.startsWith("video/") || upstreamType.startsWith("audio/") || upstreamType.startsWith("image/"))) {
    job.contentType = upstreamType;
  }

  job.stage = "Downloading media stream…";
  let received = 0;

  const reader = res.body.getReader();
  const nodeStream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        received += value.byteLength;
        if (received > MAX_FILE_BYTES) {
          await reader.cancel().catch(() => undefined);
          this.destroy(new Error("Media file exceeds the 250 MB maximum size limit."));
          return;
        }
        if (declaredLength > 0) {
          job.progress = Math.min(96, Math.max(8, Math.round((received / declaredLength) * 95)));
        } else {
          job.progress = Math.min(92, Math.max(10, job.progress + 2));
        }
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error("Stream read failed"));
      }
    },
  });

  await pipeline(nodeStream, createWriteStream(job.filePath));
  const stat = await fs.stat(job.filePath);
  if (stat.size === 0) throw new Error("Downloaded file was empty.");

  job.sizeBytes = stat.size;
  job.progress = 100;
  job.stage = "Ready for download";
  job.status = "completed";
}

function runFfmpegJob(job: DownloadJob, entry: DownloadEntry, durationSeconds?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    job.status = "processing";
    job.stage = "Processing MP4 with FFmpeg…";
    job.progress = 8;

    const ua = entry.headers?.["User-Agent"] || BROWSER_UA;
    const extra = buildHeaderString(entry.headers);

    const args =
      entry.kind === "mux" && entry.audioUrl
        ? [
            "-y",
            "-loglevel",
            "error",
            "-progress",
            "pipe:2",
            "-user_agent",
            ua,
            ...(extra ? ["-headers", extra] : []),
            "-i",
            entry.url,
            "-user_agent",
            ua,
            ...(extra ? ["-headers", extra] : []),
            "-i",
            entry.audioUrl,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            "-fs",
            String(MAX_FILE_BYTES),
            "-f",
            "mp4",
            job.filePath,
          ]
        : [
            "-y",
            "-loglevel",
            "error",
            "-progress",
            "pipe:2",
            "-user_agent",
            ua,
            ...(extra ? ["-headers", extra] : []),
            "-i",
            entry.url,
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-movflags",
            "+faststart",
            "-fs",
            String(MAX_FILE_BYTES),
            "-f",
            "mp4",
            job.filePath,
          ];

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFmpeg processing timed out."));
    }, 120_000);

    let errTail = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      errTail = (errTail + text).slice(-1000);
      const timeMatch = text.match(/out_time_us=(\d+)/);
      if (timeMatch) {
        const secs = Number(timeMatch[1]) / 1_000_000;
        if (durationSeconds && durationSeconds > 0) {
          job.progress = Math.min(95, Math.max(10, Math.round((secs / durationSeconds) * 92)));
        } else {
          job.progress = Math.min(90, Math.max(12, job.progress + 3));
        }
      }
      if (text.includes("progress=end")) {
        job.stage = "Finalizing MP4 container…";
        job.progress = 97;
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("close", async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("FFmpeg failed to process the media stream."));
        return;
      }
      try {
        const stat = await fs.stat(job.filePath);
        if (stat.size === 0) {
          reject(new Error("Processed MP4 file was empty."));
          return;
        }
        job.sizeBytes = stat.size;
        job.progress = 100;
        job.stage = "Ready for download";
        job.status = "completed";
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function createDownloadJob(token: string, durationSeconds?: number): Promise<DownloadJob | null> {
  const entry = getDownloadEntry(token);
  if (!entry) return null;

  await assertPublicUrl(new URL(entry.url));
  if (entry.audioUrl) await assertPublicUrl(new URL(entry.audioUrl));

  await fs.mkdir(JOB_DIR, { recursive: true });
  void cleanupExpiredJobs();

  const id = randomUUID();
  const ext = path.extname(entry.filename) || ".mp4";
  const filePath = path.join(JOB_DIR, `${id}${ext}`);
  const now = Date.now();

  const job: DownloadJob = {
    id,
    status: "queued",
    progress: 0,
    stage: "Queued for processing…",
    filename: entry.filename,
    contentType: entry.contentType || "video/mp4",
    filePath,
    createdAt: now,
    expiresAt: now + JOB_TTL_MS,
  };

  getJobStore().set(id, job);

  void (async () => {
    try {
      if (entry.kind === "proxy") {
        await runProxyJob(job, entry);
      } else {
        await runFfmpegJob(job, entry, durationSeconds);
      }
    } catch (err) {
      job.status = "failed";
      job.stage = "Processing failed";
      job.error = err instanceof Error ? err.message : "Could not process media file.";
      await fs.unlink(job.filePath).catch(() => undefined);
    }
  })();

  return job;
}

export function getDownloadJob(id: string): DownloadJob | null {
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const job = getJobStore().get(id);
  if (!job) return null;
  if (job.expiresAt <= Date.now()) {
    getJobStore().delete(id);
    void fs.unlink(job.filePath).catch(() => undefined);
    return null;
  }
  return job;
}
