"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { TOOLS, toolPath } from "@/lib/content/tools";
import type { PlatformId } from "@/types/platform";

type FilterKey = "popular" | "youtube" | "instagram" | "tiktok" | "facebook" | "more";

const TABS: { key: FilterKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "more", label: "Pinterest · Reddit · More" },
];

const MORE_PLATFORMS = new Set<PlatformId>(["pinterest", "reddit", "threads", "dailymotion"]);

export function PopularTools() {
  const [filter, setFilter] = useState<FilterKey>("popular");

  const items = TOOLS.filter((t) => {
    if (filter === "popular") return Boolean(t.popular);
    if (filter === "more") return MORE_PLATFORMS.has(t.platform);
    return t.platform === filter;
  });

  return (
    <section aria-labelledby="popular-heading" className="container-x pt-20">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-xl">
          <h2 id="popular-heading" className="text-3xl font-bold tracking-tight">
            Specialized downloader tools
          </h2>
          <p className="mt-2 text-muted">Filter by platform or jump directly to a dedicated format tool.</p>
        </div>

        <div
          role="tablist"
          aria-label="Filter downloader tools by platform"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-fg/10 bg-surface/65 p-1 backdrop-blur-xl"
        >
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
                className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tools-tab-pill"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                    className="absolute inset-0 rounded-lg bg-primary/20 ring-1 ring-primary/45"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <li key={toolPath(t)}>
            <Link
              href={toolPath(t)}
              className="card group flex h-full items-start gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50"
            >
              <PlatformIcon id={t.platform} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-fg">{t.name}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </div>
                <span className="mt-1.5 block text-sm leading-relaxed text-muted">{t.lead}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
