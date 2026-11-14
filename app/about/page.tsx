import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "About VidoMate – Multi-Platform Media Downloader",
  description: "VidoMate is a multi-platform media downloader that extracts verified metadata, available resolutions and real downloadable files where permitted.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <PageShell title="About VidoMate" intro="Your Videos. Your Way. Anywhere." crumbs={[{ name: "Home", href: "/" }, { name: "About", href: "/about" }]}>
      <h2>What VidoMate does</h2>
      <p>
        VidoMate is a multi-platform media downloader. Paste a public link from YouTube, Instagram, Facebook, TikTok, Pinterest, Reddit, Threads or Dailymotion and VidoMate identifies the platform, retrieves verified details (title, creator, thumbnail and duration where available), detects genuinely available formats and resolutions, and prepares downloadable files.
      </p>
      <h2>What VidoMate does not do</h2>
      <p>
        VidoMate does not bypass DRM, private accounts, logins or paywalls, and it never fabricates resolutions or fake download links. When a platform restricts unauthenticated access or offers no public stream, VidoMate tells you plainly and links you to the original post.
      </p>
      <h2>Privacy &amp; creators&apos; rights</h2>
      <p>Creators own their work. Submitted links are never stored permanently, temporary download files expire automatically after 15 minutes, and you should only download media you own or have permission to save.</p>
      <p>
        Questions? Visit the <Link href="/contact">contact page</Link>, or read our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.
      </p>
    </PageShell>
  );
}
