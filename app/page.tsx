import type { Metadata } from "next";
import { AdBanner } from "@/components/ads/AdBanner";
import { FAQ } from "@/components/home/FAQ";
import { Features } from "@/components/home/Features";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { PlatformGrid } from "@/components/home/PlatformGrid";
import { PopularTools } from "@/components/home/PopularTools";
import { JsonLd } from "@/components/seo/JsonLd";
import { HOME_FAQS } from "@/lib/content/home";
import { buildMetadata } from "@/lib/seo/metadata";
import { faqLd, siteLd } from "@/lib/seo/jsonld";

export const metadata: Metadata = buildMetadata({
  title: "VidoMate – Multi-Platform Video & Media Downloader",
  description:
    "Paste a public link from TikTok, Dailymotion, Pinterest, Instagram, Facebook, Reddit, Threads or YouTube to detect available resolutions and download media.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[...siteLd(), faqLd(HOME_FAQS)]} />
      <Hero />
      <AdBanner placement="top" className="pt-8" />
      <PlatformGrid />
      <PopularTools />
      <AdBanner placement="mid" className="pt-16" />
      <HowItWorks />
      <Features />
      <FAQ faqs={HOME_FAQS} />
      <AdBanner placement="bottom" className="pt-16" />
    </>
  );
}
