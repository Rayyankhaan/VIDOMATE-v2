import { spawn } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";
import { createDownloadJob } from "@/lib/download/jobs";
import { getDownloadEntry } from "@/lib/download/tokens";
import { BROWSER_UA } from "@/lib/utils/http";
import { clientKey, rateLimit } from "@/lib/utils/rateLimit";
import { isSameOrigin, readJson } from "@/lib/utils/request";
import { assertPublicUrl } from "@/lib/validation/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function streamFfmpeg(args: string[], signal: AbortSignal): ReadableStream<Uint8Array> {
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  let closed = false;

  const killProc = () => {
    if (!closed) {
      closed = true;
      proc.kill("SIGKILL");
    }
  };
  signal.addEventListener("abort", killProc, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout.on("data", (chunk: Buffer) => {
        if (!closed) controller.enqueue(new Uint8Array(chunk));
      });
      proc.stdout.on("end", () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
      proc.on("error", (err) => {
        if (!closed) {
          closed = true;
          controller.error(err);
        }
      });
      proc.on("close", (code) => {
        if (!closed) {
          closed = true;
          if (code && code !== 0) {
            controller.error(new Error(`ffmpeg exited with code ${code}`));
          } else {
            controller.close();
          }
        }
      });
    },
    cancel() {
      killProc();
    },
  });
}

function buildHeaderString(headers?: Record<string, string>): string | undefined {
  if (!headers) return undefined;
  const lines = Object.entries(headers)
    .filter(([k]) => k.toLowerCase() !== "user-agent")
    .map(([k, v]) => `${k}: ${v}`);
  return lines.length > 0 ? `${lines.join("\r\n")}\r\n` : undefined;
}

/** POST /api/download — starts a background media-processing job with live progress tracking. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }

  const rl = await rateLimit(clientKey(req.headers, "download"), 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Please wait ${rl.retryAfterSec}s before starting another download.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const body = await readJson<{ token?: unknown; href?: unknown; durationSeconds?: unknown }>(req, 4096);
  if (!body) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  let token = typeof body.token === "string" ? body.token : "";
  if (!token && typeof body.href === "string") {
    try {
      const parsed = new URL(body.href, "http://localhost");
      token = parsed.searchParams.get("token") ?? "";
    } catch {
      token = "";
    }
  }

  if (!token) {
    return NextResponse.json({ error: "Missing download token." }, { status: 400 });
  }

  const durationSeconds = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds) ? body.durationSeconds : undefined;

  try {
    const job = await createDownloadJob(token, durationSeconds);
    if (!job) {
      return NextResponse.json({ error: "Download link expired. Please analyze the URL again." }, { status: 410 });
    }
    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        filename: job.filename,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Blocked or invalid media source." }, { status: 403 });
  }
}

/** GET /api/download?token=... — direct streaming fallback. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const entry = getDownloadEntry(token);
  if (!entry) {
    return NextResponse.json({ error: "Download link expired. Please analyze the URL again." }, { status: 410 });
  }

  try {
    await assertPublicUrl(new URL(entry.url));
    if (entry.audioUrl) await assertPublicUrl(new URL(entry.audioUrl));
  } catch {
    return NextResponse.json({ error: "Blocked media source." }, { status: 403 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Disposition": contentDisposition(entry.filename),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (entry.kind === "hls") {
    const extra = buildHeaderString(entry.headers);
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-user_agent",
      entry.headers?.["User-Agent"] || BROWSER_UA,
      ...(extra ? ["-headers", extra] : []),
      "-i",
      entry.url,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    ];
    return new Response(streamFfmpeg(args, req.signal), {
      status: 200,
      headers: { ...baseHeaders, "Content-Type": entry.contentType || "video/mp4" },
    });
  }

  if (entry.kind === "mux" && entry.audioUrl) {
    const extra = buildHeaderString(entry.headers);
    const ua = entry.headers?.["User-Agent"] || BROWSER_UA;
    const args = [
      "-y",
      "-loglevel",
      "error",
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
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    ];
    return new Response(streamFfmpeg(args, req.signal), {
      status: 200,
      headers: { ...baseHeaders, "Content-Type": entry.contentType || "video/mp4" },
    });
  }

  const reqHeaders: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    ...entry.headers,
  };
  const range = req.headers.get("range");
  if (range) reqHeaders.Range = range;

  try {
    const upstream = await fetch(entry.url, {
      method: "GET",
      headers: reqHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]),
    });

    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => undefined);
      return NextResponse.json({ error: `Source server returned ${upstream.status}. Please re-analyze the link.` }, { status: 502 });
    }

    const resHeaders = new Headers(baseHeaders);
    resHeaders.set("Content-Type", upstream.headers.get("content-type") || entry.contentType);
    const len = upstream.headers.get("content-length");
    if (len) resHeaders.set("Content-Length", len);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) resHeaders.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders.set("Content-Range", contentRange);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch {
    return NextResponse.json({ error: "Could not stream media from the source server." }, { status: 502 });
  }
}
