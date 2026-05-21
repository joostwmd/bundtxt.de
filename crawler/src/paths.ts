import type { City } from "./types.js";

function normalizePathPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export function derivePathPrefixFromUrl(url: string): string {
  const { pathname } = new URL(url);

  if (pathname.endsWith("/")) {
    return pathname;
  }

  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const looksLikeFile = lastSegment.includes(".");

  if (looksLikeFile) {
    const directory = pathname.slice(0, pathname.lastIndexOf("/") + 1);
    return directory || "/";
  }

  return `${pathname}/`;
}

export function resolveCrawlPathPrefixes(city: City): string[] {
  const prefixes = new Set<string>();

  prefixes.add(derivePathPrefixFromUrl(city.url));

  for (const prefix of city.crawlPathPrefixes ?? []) {
    const normalized = normalizePathPrefix(prefix);
    if (normalized) {
      prefixes.add(normalized);
    }
  }

  return [...prefixes];
}

export function matchesCrawlPathPrefix(url: string, prefixes: string[]): boolean {
  try {
    const pathname = new URL(url).pathname;

    return prefixes.some((prefix) => {
      if (prefix.endsWith("/")) {
        return pathname.startsWith(prefix);
      }

      return pathname.startsWith(prefix) || pathname.startsWith(`${prefix}/`);
    });
  } catch {
    return false;
  }
}
