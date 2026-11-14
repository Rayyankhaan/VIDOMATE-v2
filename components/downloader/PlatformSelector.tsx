import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { PLATFORM_LIST } from "@/lib/platforms/catalog";
import type { PlatformId } from "@/types/platform";

/** Liquid glass platform quick-access row. */
export function PlatformSelector({ active }: { active?: PlatformId }) {
  return (
    <nav
      aria-label="Supported platforms"
      className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-fg/[0.1] bg-surface/55 p-2 backdrop-blur-2xl"
    >
      {PLATFORM_LIST.map((p) => {
        const isActive = active === p.id;
        return (
          <Link
            key={p.id}
            href={`/${p.id}`}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-medium transition sm:text-sm ${
              isActive
                ? "bg-primary/20 text-fg ring-1 ring-primary/50"
                : "text-muted hover:bg-fg/[0.06] hover:text-fg"
            }`}
          >
            <PlatformIcon id={p.id} size={20} />
            <span>{p.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
