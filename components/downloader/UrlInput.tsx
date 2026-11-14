"use client";

import { ArrowRight, ClipboardPaste, History, Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { PLATFORM_LIST, PLATFORMS } from "@/lib/platforms/catalog";
import { detectPlatform } from "@/lib/platforms/detector";
import { parseUserUrl } from "@/lib/validation/url";
import type { AnalysisResult } from "@/types/media";
import type { PlatformId } from "@/types/platform";
import { AnalysisLoader } from "./AnalysisLoader";
import { ErrorState } from "./ErrorState";
import { ResultCard } from "./ResultCard";

type State =
  | { phase: "idle" }
  | { phase: "loading"; platform: PlatformId | null }
  | { phase: "done"; result: AnalysisResult }
  | { phase: "error"; title?: string; message: string };

interface RecentItem {
  url: string;
  platform: PlatformId;
  title: string;
  formatCount: number;
}

const SUPPORTED_NAMES = PLATFORM_LIST.map((p) => p.name).join(", ");
const RECENT_KEY = "vm-recent-links";

const SAMPLES: { platform: PlatformId; label: string; url: string }[] = [
  { platform: "tiktok", label: "TikTok video", url: "https://www.tiktok.com/@tiktok/video/7106594312292453675" },
  { platform: "dailymotion", label: "Dailymotion clip", url: "https://www.dailymotion.com/video/x84sh87" },
  { platform: "pinterest", label: "Pinterest pin", url: "https://www.pinterest.com/pin/99360735500167749/" },
];

export function UrlInput({ platformHint, large = false }: { platformHint?: PlatformId; large?: boolean }) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RecentItem[];
        if (Array.isArray(parsed)) setRecent(parsed.slice(0, 4));
      }
    } catch {
      /* ignore storage errors */
    }
  }, []);

  function saveRecent(url: string, result: AnalysisResult) {
    if (!result.platform || result.status !== "ok") return;
    const item: RecentItem = {
      url,
      platform: result.platform,
      title: result.media?.title || `${PLATFORMS[result.platform].name} media`,
      formatCount: result.media?.formats.length ?? 0,
    };
    setRecent((prev) => {
      const next = [item, ...prev.filter((x) => x.url !== url)].slice(0, 4);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
  }

  const detected = useMemo<PlatformId | null>(() => {
    if (!value.trim()) return null;
    const parsed = parseUserUrl(value);
    return parsed.ok ? detectPlatform(parsed.url) : null;
  }, [value]);

  const mismatch = platformHint && detected && detected !== platformHint ? detected : null;

  async function runAnalyze(rawUrl: string) {
    setPasteNote(null);

    const parsed = parseUserUrl(rawUrl);
    if (!parsed.ok) {
      setState({ phase: "error", title: "Check your link", message: parsed.reason });
      inputRef.current?.focus();
      return;
    }
    const platform = detectPlatform(parsed.url);
    if (!platform) {
      setState({ phase: "error", title: "Unsupported platform", message: `This link isn't from a supported platform. Supported: ${SUPPORTED_NAMES}.` });
      inputRef.current?.focus();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: "loading", platform });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.url.toString() }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      const data = (await res.json()) as AnalysisResult;
      if (!data || typeof data.status !== "string") throw new Error("bad response");

      if (data.status === "invalid_url" || data.status === "rate_limited" || data.status === "error") {
        setState({
          phase: "error",
          title: data.status === "rate_limited" ? "Slow down a little" : data.status === "invalid_url" ? "Check your link" : "Couldn't complete the check",
          message: data.message ?? "Something went wrong. Please try again.",
        });
      } else {
        setState({ phase: "done", result: data });
        saveRecent(parsed.url.toString(), data);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        phase: "error",
        title: "Network problem",
        message: err instanceof DOMException && err.name === "TimeoutError" ? "The request took too long. Please try again." : "We couldn't reach VidoMate. Check your connection and try again.",
      });
    }
  }

  function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    void runAnalyze(value);
  }

  function trySample(sampleUrl: string) {
    setValue(sampleUrl);
    void runAnalyze(sampleUrl);
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteNote("Your clipboard is empty.");
        return;
      }
      setValue(text.trim());
      setPasteNote(null);
      setState({ phase: "idle" });
      inputRef.current?.focus();
    } catch {
      setPasteNote("Clipboard access was blocked. Click the box and press Ctrl/⌘ + V instead.");
      inputRef.current?.focus();
    }
  }

  function clear() {
    abortRef.current?.abort();
    setValue("");
    setPasteNote(null);
    setState({ phase: "idle" });
    inputRef.current?.focus();
  }

  const loading = state.phase === "loading";

  return (
    <div className="w-full">
      <form onSubmit={analyze} noValidate className={`glass-dock flex flex-col gap-3 p-3 sm:flex-row sm:items-center ${large ? "sm:p-3.5" : ""}`}>
        <label htmlFor={inputId} className="sr-only">
          Media URL
        </label>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (state.phase === "error") setState({ phase: "idle" });
            }}
            placeholder="Paste your video URL here..."
            aria-describedby={hintId}
            className={`w-full rounded-xl border border-fg/10 bg-bg/80 px-4 pr-24 text-fg placeholder:text-muted/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 ${large ? "h-14 text-base" : "h-12 text-sm"}`}
          />
          {value && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear link"
              className="absolute right-16 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition hover:text-fg"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={paste}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-lg border border-fg/10 bg-fg/[0.06] px-2.5 py-1.5 text-xs font-semibold text-fg transition hover:bg-fg/[0.12]"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Paste</span>
          </button>
        </div>
        <button type="submit" disabled={loading} className={`btn-primary ${large ? "h-14 px-7" : "h-12"}`}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Fetching…</span>
            </>
          ) : (
            <>
              <span>Download video</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted">
        <div id={hintId} aria-live="polite">
          {detected ? (
            <span className="inline-flex items-center gap-2 text-fg">
              <PlatformIcon id={detected} size={18} />
              Detected: <strong>{PLATFORMS[detected].name}</strong>
            </span>
          ) : pasteNote ? (
            <span>{pasteNote}</span>
          ) : (
            <span>Try a sample:</span>
          )}
        </div>

        {!detected && !pasteNote && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {SAMPLES.filter((s) => !platformHint || s.platform === platformHint).map((s) => (
              <button
                key={s.platform}
                type="button"
                onClick={() => trySample(s.url)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-fg/10 bg-surface/65 px-2.5 py-1 text-xs font-medium text-fg/90 backdrop-blur-md transition hover:border-primary/50 hover:text-fg"
              >
                <PlatformIcon id={s.platform} size={14} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {mismatch && (
        <p className="mt-2 text-center text-sm text-muted">
          This looks like a {PLATFORMS[mismatch].name} link.{" "}
          <Link href={`/${mismatch}`} className="text-accent underline-offset-4 hover:underline">
            Visit the {PLATFORMS[mismatch].name} page
          </Link>{" "}
          — or just press Download video.
        </p>
      )}

      <div className="mt-6" aria-live="polite">
        <AnimatePresence mode="wait">
          {state.phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <AnalysisLoader platform={state.platform} />
            </motion.div>
          )}
          {state.phase === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <ErrorState title={state.title} message={state.message} onRetry={value ? () => void analyze() : undefined} />
            </motion.div>
          )}
          {state.phase === "done" && (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              <ResultCard result={state.result} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {recent.length > 0 && state.phase === "idle" && (
        <div className="card mt-6 p-4 text-left">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg/90">
              <History className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              Recent links
            </span>
            <button type="button" onClick={clearRecent} className="inline-flex items-center gap-1 text-muted transition hover:text-fg">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              <span>Clear</span>
            </button>
          </div>
          <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {recent.map((item) => (
              <li key={item.url}>
                <button
                  type="button"
                  onClick={() => trySample(item.url)}
                  className="flex w-full items-center gap-3 rounded-xl border border-fg/10 bg-bg/60 px-3 py-2 text-left transition hover:border-primary/40"
                >
                  <PlatformIcon id={item.platform} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-fg">{item.title}</span>
                    <span className="block font-mono text-[11px] text-muted tabular-nums">
                      {PLATFORMS[item.platform].name} · {item.formatCount} {item.formatCount === 1 ? "format" : "formats"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
