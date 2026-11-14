import { HOW_IT_WORKS } from "@/lib/content/home";

const STEP_HINTS = ["https://tiktok.com/@...", "720p HD · MP4 · 3.4 MB", "FFmpeg Faststart · Saved"];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="container-x pt-20">
      <div className="max-w-2xl">
        <h2 id="how-heading" className="text-3xl font-bold tracking-tight">
          How VidoMate works
        </h2>
        <p className="mt-2 text-muted">Three steps from link to saved media — with real quality detection and FFmpeg processing.</p>
      </div>

      <ol className="mt-8 grid gap-5 md:grid-cols-3">
        {HOW_IT_WORKS.map((s, i) => (
          <li key={s.title} className="card relative flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-fg/10 pb-4">
                <span className="font-mono text-sm font-semibold text-accent tabular-nums">0{i + 1}.</span>
                <span className="font-mono text-[11px] text-muted">{STEP_HINTS[i]}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold leading-snug">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
