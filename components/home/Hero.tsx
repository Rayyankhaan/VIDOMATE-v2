"use client";

import { motion } from "motion/react";
import { PlatformSelector } from "@/components/downloader/PlatformSelector";
import { UrlInput } from "@/components/downloader/UrlInput";

export function Hero() {
  return (
    <section id="downloader-input" className="hero-glow studio-grid relative overflow-hidden border-b border-fg/10">
      <div className="container-x py-16 text-center sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mx-auto mb-4 text-xs font-semibold tracking-[0.18em] text-accent">
            ALL-IN-ONE VIDEO DOWNLOADER
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Download videos. <span className="gradient-text">Anywhere.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Your favorite videos, photos and reels in one place.
          </p>
        </motion.div>

        <motion.div
          className="mx-auto mt-10 max-w-3xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <UrlInput large />
        </motion.div>

        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <PlatformSelector />
          <p className="mt-6 text-xs font-medium tracking-wide text-muted">
            Fast <span aria-hidden="true">·</span> Simple <span aria-hidden="true">·</span> Mobile-friendly
          </p>
        </motion.div>
      </div>
    </section>
  );
}
