import type { Crawl4AiCrawlResult, Crawl4AiTaskResponse, City, CrawlPage } from "./types.js";
import { extractPdfText, isPdfUrl } from "./pdf.js";
import {
  matchesCrawlPathPrefix,
  resolveCrawlPathPrefixes,
} from "./paths.js";
import { cleanCrawlResults } from "./filter.js";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PAGES = 150;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

function getCrawl4AiUrl(): string {
  const url = process.env.CRAWL4AI_URL;
  if (!url) {
    throw new Error("CRAWL4AI_URL environment variable is required");
  }
  return url.replace(/\/$/, "");
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(url, baseUrl);
    resolved.hash = "";
    // Clean up malformed URLs from markdown parsing (title attributes in hrefs)
    let cleanUrl = resolved.toString();
    if (cleanUrl.includes("%20%22")) {
      cleanUrl = cleanUrl.split("%20%22")[0];
    }
    return cleanUrl;
  } catch {
    return null;
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function pickMarkdownField(
  record: Record<string, string | undefined>,
  field: string,
): string | undefined {
  const value = record[field];
  if (!value?.trim()) {
    return undefined;
  }
  return value;
}

function extractMarkdown(result: Crawl4AiCrawlResult): string {
  const markdown = result.markdown;

  if (typeof markdown === "string") {
    return markdown.trim();
  }

  if (markdown && typeof markdown === "object") {
    const record = markdown as Record<string, string | undefined>;
    const content =
      pickMarkdownField(record, "fit_markdown") ??
      pickMarkdownField(record, "raw_markdown") ??
      pickMarkdownField(record, "markdown_with_citations") ??
      "";

    return content.trim();
  }

  return "";
}

function extractLinks(result: Crawl4AiCrawlResult, pageUrl: string): string[] {
  const links = new Set<string>();

  const rawLinks = result.links;
  if (Array.isArray(rawLinks)) {
    for (const link of rawLinks) {
      if (typeof link === "string") {
        links.add(link);
      } else if (link && typeof link === "object") {
        const href = link.href ?? link.url;
        if (href) {
          links.add(href);
        }
      }
    }
  } else if (rawLinks && typeof rawLinks === "object") {
    const grouped = rawLinks as {
      internal?: Array<{ href?: string } | string>;
      external?: Array<{ href?: string } | string>;
    };

    for (const link of grouped.internal ?? []) {
      if (typeof link === "string") {
        links.add(link);
      } else if (link?.href) {
        links.add(link.href);
      }
    }
  }

  const markdown = extractMarkdown(result);
  const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const href = match[1]?.trim();
    if (href) {
      links.add(href);
    }
  }

  return [...links]
    .map((link) => normalizeUrl(link, pageUrl))
    .filter((link): link is string => Boolean(link));
}

async function pollCrawlJob(
  baseUrl: string,
  taskId: string,
): Promise<Crawl4AiCrawlResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(`${baseUrl}/crawl/job/${taskId}`);

    if (!response.ok) {
      throw new Error(
        `Failed to poll crawl job ${taskId}: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as Crawl4AiTaskResponse & {
      result?: {
        results?: Crawl4AiCrawlResult[];
        success?: boolean;
        error?: string;
      };
    };

    if (payload.status === "failed") {
      throw new Error(payload.error ?? `Crawl job ${taskId} failed`);
    }

    if (payload.status === "completed") {
      const result = payload.result?.results?.[0];
      if (!result) {
        throw new Error(`Crawl job ${taskId} completed without results`);
      }
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for crawl job ${taskId}`);
}

async function crawlSingleUrl(
  baseUrl: string,
  url: string,
): Promise<Crawl4AiCrawlResult> {
  const requestBody = {
    urls: [url],
    browser_config: {},
    crawler_config: {
      word_count_threshold: 10,
      exclude_external_links: true,
      cache_mode: "bypass",
    },
  };

  const jobResponse = await fetch(`${baseUrl}/crawl/job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (jobResponse.ok) {
    const jobPayload = (await jobResponse.json()) as Crawl4AiTaskResponse;
    if (jobPayload.task_id) {
      return pollCrawlJob(baseUrl, jobPayload.task_id);
    }
  }

  const syncResponse = await fetch(`${baseUrl}/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!syncResponse.ok) {
    const errorText = await syncResponse.text();
    throw new Error(
      `Crawl4AI request failed for ${url}: ${syncResponse.status} ${errorText}`,
    );
  }

  const syncPayload = (await syncResponse.json()) as {
    results?: Crawl4AiCrawlResult[];
    success?: boolean;
    error?: string;
  };

  const result = syncPayload.results?.[0];
  if (!result) {
    throw new Error(`Crawl4AI returned no result for ${url}`);
  }

  return result;
}

export async function crawlSite(city: City): Promise<CrawlPage[]> {
  const baseUrl = getCrawl4AiUrl();
  const rootUrl = city.url;
  const origin = new URL(rootUrl).origin;
  const pathPrefixes = resolveCrawlPathPrefixes(city);
  const maxDepth = city.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = city.maxPages ?? DEFAULT_MAX_PAGES;

  console.log(
    `[crawl] path prefixes for ${city.id}: ${pathPrefixes.join(", ")}`,
  );
  console.log(`[crawl] max depth: ${maxDepth}, max pages: ${maxPages}`);

  const visited = new Set<string>();
  const rawPages: CrawlPage[] = [];

  const isInScope = (url: string): boolean =>
    isSameOrigin(url, origin) && matchesCrawlPathPrefix(url, pathPrefixes);

  type QueueItem = { url: string; depth: number };
  const queue: QueueItem[] = [{ url: rootUrl, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const normalizedCurrent = normalizeUrl(current.url, rootUrl);
    if (!normalizedCurrent || visited.has(normalizedCurrent)) {
      continue;
    }

    if (!isInScope(normalizedCurrent)) {
      continue;
    }

    visited.add(normalizedCurrent);

    if (isPdfUrl(normalizedCurrent)) {
      const pdfText = await extractPdfText(normalizedCurrent);
      if (pdfText) {
        rawPages.push({
          url: normalizedCurrent,
          markdown: pdfText,
          links: [],
        });
      }
      continue;
    }

    console.log(`[crawl] depth=${current.depth} ${normalizedCurrent}`);

    const result = await crawlSingleUrl(baseUrl, normalizedCurrent);
    const markdown = extractMarkdown(result);
    const links = extractLinks(result, normalizedCurrent).filter(isInScope);

    rawPages.push({
      url: normalizedCurrent,
      markdown,
      links,
    });

    if (current.depth >= maxDepth) {
      continue;
    }

    for (const link of links) {
      const normalizedLink = normalizeUrl(link, normalizedCurrent);
      if (!normalizedLink || visited.has(normalizedLink)) {
        continue;
      }

      if (!isInScope(normalizedLink)) {
        continue;
      }

      if (isPdfUrl(normalizedLink)) {
        const pdfText = await extractPdfText(normalizedLink);
        if (pdfText) {
          visited.add(normalizedLink);
          rawPages.push({
            url: normalizedLink,
            markdown: pdfText,
            links: [],
          });
        }
        continue;
      }

      queue.push({ url: normalizedLink, depth: current.depth + 1 });
    }
  }

  console.log(`[crawl] Raw crawl complete: ${rawPages.length} pages`);
  
  const cleanedPages = cleanCrawlResults(rawPages, {
    maxPages,
    skipEnglish: city.skipEnglish ?? true,
    skipLowValue: true,
  });

  return cleanedPages;
}
