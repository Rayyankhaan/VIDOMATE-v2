import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDownloadJob } from "@/lib/download/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = getDownloadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Download job not found or expired." }, { status: 404 });
  }
  if (job.status !== "completed") {
    return NextResponse.json({ error: "Download job is not ready yet." }, { status: 409 });
  }

  try {
    const stat = await fs.stat(job.filePath);
    const stream = Readable.toWeb(createReadStream(job.filePath)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": job.contentType || "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": contentDisposition(job.filename),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Processed file is no longer available." }, { status: 410 });
  }
}
