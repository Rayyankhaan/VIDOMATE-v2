import "server-only";
import { assertPublicUrl } from "@/lib/validation/ssrf";

const UA = "VidoMate/1.0 (+https://vidomate.app; link metadata lookup)";
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MAX_BYTES = 1_000_000;
const MAX_TEXT_BYTES = 3_000_000;

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

/**
 * Fetch JSON from a FIXED, trusted API endpoint (the user's URL is only ever a query parameter).
 * Redirects are refused by default, a hard timeout applies and response size is capped.
 */
export async function fetchJson<T>(
  endpoint: string,
  opts: {
    headers?: Record<string, string>;
    method?: "GET" | "POST";
    body?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    redirect?: RequestRedirect;
  } = {}
): Promise<JsonResponse<T>> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await fetch(endpoint, {
    method: opts.method ?? "GET",
    headers: { "User-Agent": UA, Accept: "application/json", ...opts.headers },
    body: opts.body,
    redirect: opts.redirect ?? "error",
    cache: "no-store",
    signal,
  });

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return { ok: false, status: res.status, data: null };

  const text = await res.text();
  if (text.length > MAX_BYTES) return { ok: false, status: res.status, data: null };

  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Fetch text/HTML/playlist from a verified public URL with timeout and size limits.
 */
export async function fetchText(
  endpoint: string,
  opts: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number; redirect?: RequestRedirect } = {}
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  await assertPublicUrl(new URL(endpoint));
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...opts.headers,
    },
    redirect: opts.redirect ?? "follow",
    cache: "no-store",
    signal,
  });

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_TEXT_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, status: res.status, text: "", finalUrl: res.url || endpoint };
  }

  const text = await res.text();
  if (text.length > MAX_TEXT_BYTES) {
    return { ok: false, status: res.status, text: text.slice(0, MAX_TEXT_BYTES), finalUrl: res.url || endpoint };
  }
  return { ok: res.ok, status: res.status, text, finalUrl: res.url || endpoint };
}

/**
 * Safely resolve a short link (pin.it, redd.it/r/x/s/…, fb.watch …) by following at most 4
 * redirects manually. Every hop must be http(s), resolve to public IPs and satisfy `allowHost`.
 */
export async function resolveRedirect(start: URL, allowHost: (u: URL) => boolean, signal?: AbortSignal): Promise<URL | null> {
  let current = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!allowHost(current)) return null;
    await assertPublicUrl(current);

    const timeout = AbortSignal.timeout(5000);
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": BROWSER_UA },
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    await res.body?.cancel().catch(() => undefined);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, current);
      } catch {
        return null;
      }
      continue;
    }
    return allowHost(current) ? current : null;
  }
  return null;
}
