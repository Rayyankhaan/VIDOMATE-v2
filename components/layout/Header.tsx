"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MobileNav } from "./MobileNav";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/#platforms-heading", label: "Platforms" },
  { href: "/#faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    `whitespace-nowrap shrink-0 text-sm font-medium transition underline-offset-8 ${
      active ? "text-fg underline decoration-primary decoration-2" : "text-muted hover:text-fg hover:underline hover:decoration-fg/30"
    }`;

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-fg/10 bg-bg/70 backdrop-blur-2xl">
      <div className="container-x flex h-full items-center justify-between gap-8">
        <div className="shrink-0 whitespace-nowrap">
          <Logo />
        </div>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => {
            const isAnchor = item.href.includes("#");
            const active = !isAnchor && pathname === item.href;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          <Link href="/#downloader-input" className="btn-primary hidden !px-4 !py-2 !text-xs sm:inline-flex">
            Free Downloader
          </Link>
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
