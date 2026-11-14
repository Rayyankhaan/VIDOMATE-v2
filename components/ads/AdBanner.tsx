"use client";

import { useEffect } from "react";

type Placement = "top" | "mid" | "bottom";

const SLOT_LABELS: Record<Placement, string> = {
  top: "728 × 90 Leaderboard Banner",
  mid: "728 × 90 In-Content Banner",
  bottom: "728 × 90 Footer Banner",
};

function resolveSlotId(placement: Placement): string | undefined {
  if (placement === "top") return process.env.NEXT_PUBLIC_AD_SLOT_TOP;
  if (placement === "mid") return process.env.NEXT_PUBLIC_AD_SLOT_MID;
  return process.env.NEXT_PUBLIC_AD_SLOT_BOTTOM;
}

/**
 * Non-intrusive, banner-only advertisement slot (never full-screen, modal, or sticky overlay).
 * Reserves fixed height to prevent Cumulative Layout Shift (CLS).
 */
export function AdBanner({ placement, className = "" }: { placement: Placement; className?: string }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slot = resolveSlotId(placement);
  const hasLiveAd = Boolean(client && slot);

  useEffect(() => {
    if (!hasLiveAd) return;
    try {
      const w = window as Window & { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      /* ignore ad script blocker errors */
    }
  }, [hasLiveAd]);

  return (
    <aside aria-label="Advertisement" className={`container-x ${className}`}>
      <div className="mx-auto flex max-w-[760px] flex-col items-center">
        <span className="mb-1.5 text-[11px] font-medium tracking-wide text-muted/75">Advertisement</span>
        <div className="flex min-h-[76px] w-full items-center justify-center overflow-hidden rounded-xl border border-fg/10 bg-surface/60 px-4 py-2 backdrop-blur-xl sm:min-h-[90px]">
          {hasLiveAd ? (
            <ins
              className="adsbygoogle block w-full"
              style={{ display: "block", minHeight: "90px" }}
              data-ad-client={client}
              data-ad-slot={slot}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          ) : (
            <div className="flex w-full items-center justify-between gap-4 text-xs text-muted/80">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fg/10 bg-fg/[0.04] font-mono text-[11px] text-primary">
                  AD
                </span>
                <div>
                  <p className="font-medium text-fg/85">Banner Ad Placement ({SLOT_LABELS[placement]})</p>
                  <p className="text-[11px] text-muted">Non-intrusive horizontal banner only · No popups or full-screen ads</p>
                </div>
              </div>
              <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted sm:inline">728×90 / 320×50</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
