import { NextResponse } from "next/server";
import { getDownloadJob } from "@/lib/download/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = getDownloadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Download job not found or expired." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      filename: job.filename,
      contentType: job.contentType,
      sizeBytes: job.sizeBytes,
      error: job.error,
      downloadUrl: job.status === "completed" ? `/api/jobs/${job.id}/download` : undefined,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
