import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { PLATFORM_LIST } from "@/lib/platforms/catalog";

const CAPABILITIES: Record<string, string> = {
  youtube: "MP4 · Shorts · M4A Audio",
  tiktok: "HD MP4 · Standard · MP3 Audio",
  instagram: "Reels · Posts · Carousel",
  facebook: "HD Video · SD Video · Reels",
  pinterest: "Video Pins · Original Images",
  reddit: "Muxed MP4 · GIF · Images",
  threads: "Video Posts · Photos",
  dailymotion: "HLS to MP4 · Multi-Resolution",
};

export function PlatformGrid() {
  const featuredIds = new Set(["tiktok", "dailymotion"]);
  const featured = PLATFORM_LIST.filter((p) => featuredIds.has(p.id));
  const rest = PLATFORM_LIST.filter((p) => !featuredIds.has(p.id));

  return (
    <section aria-labelledby="platforms-heading" className="container-x pt-16">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <h2 id="platforms-heading" className="text-3xl font-bold tracking-tight">
            Eight platforms, one studio
          </h2>
          <p className="mt-2 text-muted">
            Select any platform to open its dedicated downloader, supported formats, and usage guide.
          </p>
        </div>
        <span className="font-mono text-xs font-medium text-muted tabular-nums">8 integrations active</span>
      </div>

      {/* Featured 2-column liquid glass row */}
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {featured.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${p.id}`}
              className="card group relative flex h-full flex-col justify-between gap-5 overflow-hidden p-6 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-80"
                style={{ backgroundColor: p.tint }}
              />
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <PlatformIcon id={p.id} size={46} />
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                    <p className="mt-0.5 text-xs font-medium text-accent">{CAPABILITIES[p.id]}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-1" aria-hidden="true" />
              </div>
              <p className="text-sm leading-relaxed text-muted">{p.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Secondary 3-column bento grid */}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${p.id}`}
              className="card group flex h-full flex-col justify-between gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon id={p.id} size={38} />
                    <div>
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <p className="text-xs text-muted">{p.short}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.blurb}</p>
              </div>
              <span className="border-t border-fg/10 pt-3 font-mono text-[11px] text-muted">{CAPABILITIES[p.id]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
