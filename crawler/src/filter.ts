import type { CrawlPage } from "./types.js";

const MIN_MEANINGFUL_CHARS = 200;

const LOW_VALUE_PATHS = [
  "/impressum",
  "/datenschutz", 
  "/barrierefreiheit",
  "/stellenangebote",
  "/karriere",
  "/praktikum",
  "/presse",
  "/artikel.903718.de-plain.php", // accessibility plain text
];

function isLowValuePath(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return LOW_VALUE_PATHS.some(path => pathname.includes(path));
}

function isEnglishPath(url: string): boolean {
  const pathname = new URL(url).pathname;
  return pathname.includes("/en/");
}

function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash
    const cleanPath = parsed.pathname.replace(/\/$/, "") || "/";
    // Remove URL-encoded title artifacts from malformed markdown links
    const cleanedPath = cleanPath.split("%20%22")[0];
    return `${parsed.origin}${cleanedPath}`;
  } catch {
    return url;
  }
}

export function cleanCrawlResults(
  pages: CrawlPage[], 
  options: {
    maxPages?: number;
    skipEnglish?: boolean;
    skipLowValue?: boolean;
  } = {}
): CrawlPage[] {
  const {
    maxPages = 150,
    skipEnglish = true,
    skipLowValue = true,
  } = options;

  console.log(`[filter] Starting with ${pages.length} pages`);

  // Step 1: Remove empty pages
  let filtered = pages.filter(page => {
    const hasContent = page.markdown.trim().length >= MIN_MEANINGFUL_CHARS;
    if (!hasContent) {
      console.log(`[filter] Skipping empty: ${page.url}`);
    }
    return hasContent;
  });
  console.log(`[filter] After empty removal: ${filtered.length} pages`);

  // Step 2: Skip English pages
  if (skipEnglish) {
    filtered = filtered.filter(page => {
      const isEn = isEnglishPath(page.url);
      if (isEn) {
        console.log(`[filter] Skipping English: ${page.url}`);
      }
      return !isEn;
    });
    console.log(`[filter] After English removal: ${filtered.length} pages`);
  }

  // Step 3: Skip low-value pages
  if (skipLowValue) {
    filtered = filtered.filter(page => {
      const isLowValue = isLowValuePath(page.url);
      if (isLowValue) {
        console.log(`[filter] Skipping low-value: ${page.url}`);
      }
      return !isLowValue;
    });
    console.log(`[filter] After low-value removal: ${filtered.length} pages`);
  }

  // Step 4: Deduplicate by normalized URL
  const seen = new Set<string>();
  const deduplicated: CrawlPage[] = [];
  
  for (const page of filtered) {
    const normalizedUrl = normalizeUrlForDedup(page.url);
    if (seen.has(normalizedUrl)) {
      console.log(`[filter] Skipping duplicate: ${page.url} -> ${normalizedUrl}`);
      continue;
    }
    seen.add(normalizedUrl);
    deduplicated.push({
      ...page,
      url: normalizedUrl, // Use normalized URL consistently
    });
  }
  console.log(`[filter] After deduplication: ${deduplicated.length} pages`);

  // Step 5: Sort by content length (longest first) and limit
  const sorted = deduplicated
    .sort((a, b) => b.markdown.length - a.markdown.length)
    .slice(0, maxPages);

  if (sorted.length < deduplicated.length) {
    console.log(`[filter] Limited to top ${maxPages} pages by content length`);
  }

  const totalChars = sorted.reduce((sum, page) => sum + page.markdown.length, 0);
  console.log(`[filter] Final: ${sorted.length} pages, ${totalChars} total chars`);

  return sorted;
}