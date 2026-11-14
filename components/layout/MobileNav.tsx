"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { PLATFORM_LIST } from "@/lib/platforms/catalog";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-fg/15 bg-surface/65 text-fg backdrop-blur-xl"
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-bg/95 backdrop-blur-2xl">
          <nav aria-label="Mobile" className="container-x flex flex-col gap-1 py-4">
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={`rounded-xl px-4 py-3 text-base font-medium ${pathname === "/" ? "bg-primary/15 text-primary" : "text-fg hover:bg-fg/[0.06]"}`}
            >
              Home
            </Link>
            {PLATFORM_LIST.map((p) => {
              const active = pathname === `/${p.id}` || pathname.startsWith(`/${p.id}/`);
              return (
                <Link
                  key={p.id}
                  href={`/${p.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium ${active ? "bg-primary/15 text-primary" : "text-fg hover:bg-fg/[0.06]"}`}
                >
                  <PlatformIcon id={p.id} size={32} />
                  {p.name}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
