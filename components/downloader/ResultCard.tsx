"use client";

import { AlertCircle, ArrowUpRight, CheckCircle2, Download, EyeOff, Loader2, Play } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { PLATFORMS } from "@/lib/platforms/catalog";
import { formatBytes, formatDuration, isHttpsUrl } from "@/lib/utils/format";
import type { AnalysisResult, MediaFormat } from "@/types/media";

const BANNERS: Record<string, { title: string; tone: string }> = {
  not_configured: { title: "Integration not configured", tone: "border-amber-400/30 bg-amber-400/10" },
  unsupported: { title: "Not supported for this link", tone: "border-primary/30 bg-primary/10" },
  unavailable: { title: "Media unavailable", tone: "border-amber-400/30 bg-amber-400/10" },
};

type JobState =
  | { phase: "idle" }
  | { phase: "working"; formatId: string; progress: number; stage: string }
  | { phase: "ready"; formatId: string; downloadUrl: string; filename: string; sizeBytes?: number }
  | { phase: "error"; formatId: string; message: string };

export function ResultCard({ result }: { result: AnalysisResult }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const formats = result.media?.formats ?? [];
  const [selectedId, setSelectedId] = useState<string>(formats[0]?.id ?? "");
  const [job, setJob] = useState<JobState>({ phase: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSelectedId(result.media?.formats?.[0]?.id ?? "");
    setJob({ phase: "idle" });
    setThumbFailed(false);
    setPreviewOpen(false);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [result]);

  if (!result.platform) return null;

  const platform = PLATFORMS[result.platform];
  const media = result.media;
  const banner = BANNERS[result.status];
  const duration = formatDuration(media?.durationSeconds);
  const showThumb = isHttpsUrl(media?.thumbnailUrl) && !thumbFailed;
  const hasFormats = formats.length > 0;
  const selectedFormat: MediaFormat | undefined = formats.find((f) => f.id === selectedId) ?? formats[0];
  const canPreviewVideo = Boolean(selectedFormat && selectedFormat.container === "mp4");

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function triggerBrowserSave(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function startDownload(format: MediaFormat) {
    stopPolling();
    setJob({ phase: "working", formatId: format.id, progress: 4, stage: "Starting download job…" });

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href: format.href, durationSeconds: media?.durationSeconds }),
      });
      const init = (await res.json()) as { jobId?: string; error?: string; progress?: number; stage?: string };
      if (!res.ok || !init.jobId) {
        setJob({ phase: "error", formatId: format.id, message: init.error || "Could not start download job." });
        return;
      }

      const jobId = init.jobId;
      setJob({ phase: "working", formatId: format.id, progress: init.progress ?? 8, stage: init.stage || "Preparing media…" });

      pollRef.current = setInterval(async () => {
        try {
          const poll = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
          const data = (await poll.json()) as {
            status?: string;
            progress?: number;
            stage?: string;
            downloadUrl?: string;
            filename?: string;
            sizeBytes?: number;
            error?: string;
          };

          if (!poll.ok) {
            stopPolling();
            setJob({ phase: "error", formatId: format.id, message: data.error || "Job status check failed." });
            return;
          }

          if (data.status === "completed" && data.downloadUrl) {
            stopPolling();
            const filename = data.filename || "vidomate-download.mp4";
            setJob({
              phase: "ready",
              formatId: format.id,
              downloadUrl: data.downloadUrl,
              filename,
              sizeBytes: data.sizeBytes,
            });
            triggerBrowserSave(data.downloadUrl, filename);
            return;
          }

          if (data.status === "failed") {
            stopPolling();
            setJob({ phase: "error", formatId: format.id, message: data.error || "Media processing failed." });
            return;
          }

          setJob({
            phase: "working",
            formatId: format.id,
            progress: typeof data.progress === "number" ? data.progress : 25,
            stage: data.stage || "Processing media…",
          });
        } catch {
          stopPolling();
          setJob({ phase: "error", formatId: format.id, message: "Lost connection while checking processing progress." });
        }
      }, 450);
    } catch {
      setJob({ phase: "error", formatId: format.id, message: "Network error starting download." });
    }
  }

  return (
    <motion.article
      aria-label="Analysis result"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="card overflow-hidden text-left"
    >
      {banner && (
        <div className={`border-b px-5 py-3 ${banner.tone}`}>
          <p className="text-sm font-semibold">{banner.title}</p>
          {result.message && <p className="mt-1 text-sm leading-relaxed text-fg/80">{result.message}</p>}
        </div>
      )}

      <div className="p-5 sm:p-6">
        {media && (
          <div className="flex flex-col gap-5 sm:flex-row">
            {showThumb ? (
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-fg/10 bg-bg sm:w-60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media.thumbnailUrl}
                  alt={media.title ? `Thumbnail for ${media.title}` : "Media thumbnail"}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbFailed(true)}
                  className="h-full w-full object-cover"
                />
                {duration && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 font-mono text-xs font-medium text-white tabular-nums">
                    {duration}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-xl border border-fg/10 bg-bg sm:w-60">
                <PlatformIcon id={platform.id} size={48} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <PlatformIcon id={platform.id} size={20} />
                <span className="font-medium text-fg/90">{platform.name}</span>
                {media.mediaType && media.mediaType !== "unknown" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{media.mediaType}</span>
                  </>
                )}
                {duration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{duration}</span>
                  </>
                )}
              </div>
              <h3 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">{media.title || "Untitled media"}</h3>
              {media.creator && (
                <p className="mt-2 truncate text-sm text-muted">
                  By <span className="text-fg/90">{media.creator}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {previewOpen && selectedFormat && canPreviewVideo && (
          <div className="mt-5 overflow-hidden rounded-xl border border-fg/10 bg-black">
            <video key={selectedFormat.href} src={selectedFormat.href} controls playsInline className="max-h-80 w-full" />
          </div>
        )}

        {result.status === "ok" && (
          <div className="mt-6 border-t border-fg/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Select quality &amp; format</h4>
              {hasFormats && <span className="font-mono text-xs text-muted tabular-nums">{formats.length} available</span>}
            </div>

            {hasFormats ? (
              <>
                <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Available download qualities">
                  {formats.map((f) => {
                    const sizeLabel = formatBytes(f.sizeBytes);
                    const isSelected = selectedFormat?.id === f.id;
                    return (
                      <label
                        key={f.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                          isSelected ? "border-primary bg-primary/15" : "border-fg/10 bg-bg/55 hover:border-fg/25"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <input
                            type="radio"
                            name="quality-format"
                            value={f.id}
                            checked={isSelected}
                            onChange={() => {
                              setSelectedId(f.id);
                              if (job.phase !== "working") setJob({ phase: "idle" });
                            }}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-fg">{f.label}</span>
                            <span className="block font-mono text-xs text-muted">
                              {[f.quality, f.container?.toUpperCase(), f.hasAudio === false ? "Video only" : null].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{sizeLabel ?? "Stream"}</span>
                      </label>
                    );
                  })}
                </fieldset>

                {selectedFormat && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={job.phase === "working"}
                        onClick={() => void startDownload(selectedFormat)}
                        className="btn-primary"
                      >
                        {job.phase === "working" ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            <span>Processing ({job.progress}%)…</span>
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" aria-hidden="true" />
                            <span>
                              Download {selectedFormat.quality ? `${selectedFormat.quality} ` : ""}
                              {(selectedFormat.container || "MP4").toUpperCase()}
                            </span>
                          </>
                        )}
                      </button>

                      {canPreviewVideo && (
                        <button type="button" onClick={() => setPreviewOpen((p) => !p)} className="btn-ghost">
                          {previewOpen ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                          <span>{previewOpen ? "Hide preview" : "Preview video"}</span>
                        </button>
                      )}

                      {job.phase === "ready" && (
                        <a href={job.downloadUrl} download={job.filename} className="btn-ghost">
                          <Download className="h-4 w-4" aria-hidden="true" />
                          <span>Save file{job.sizeBytes ? ` (${formatBytes(job.sizeBytes)})` : ""}</span>
                        </a>
                      )}
                    </div>

                    {job.phase === "working" && (
                      <div className="rounded-xl border border-fg/10 bg-bg/70 p-3.5" role="status" aria-live="polite">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-fg">{job.stage}</span>
                          <span className="font-mono text-accent tabular-nums">{job.progress}%</span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-fg/10">
                          <motion.div
                            className="h-full rounded-full bg-brand-gradient"
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ duration: 0.25 }}
                          />
                        </div>
                      </div>
                    )}

                    {job.phase === "ready" && (
                      <p className="inline-flex items-center gap-2 text-xs text-accent" role="status">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          Download ready: <span className="font-medium">{job.filename}</span>
                          {job.sizeBytes ? ` (${formatBytes(job.sizeBytes)})` : ""}.
                        </span>
                      </p>
                    )}

                    {job.phase === "error" && (
                      <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-200" role="alert">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{job.message}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted">{result.message}</p>
            )}
          </div>
        )}

        {result.actions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {result.actions.map((a) => (
              <a
                key={a.id}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                title={a.description}
                className={a.kind === "download" ? "btn-primary" : "btn-ghost"}
              >
                <span>{a.label}</span>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </div>
        )}

        {result.notices && result.notices.length > 0 && (
          <ul className="mt-5 space-y-1 border-t border-fg/10 pt-4 text-xs leading-relaxed text-muted">
            {result.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
}
