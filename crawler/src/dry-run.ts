import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getOutputDir } from "./diff.js";
import { buildGenerationPrompt } from "./generate.js";
import { resolveCrawlPathPrefixes } from "./paths.js";
import type { City, CrawlPage } from "./types.js";

export async function writeDryRunArtifacts(
  city: City,
  pages: CrawlPage[],
): Promise<string> {
  const dir = path.join(getOutputDir(city.id), "dry-run");
  await mkdir(dir, { recursive: true });

  const pathPrefixes = resolveCrawlPathPrefixes(city);
  const crawledContent = pages
    .map((page) => `## ${page.url}\n\n${page.markdown}`)
    .join("\n\n---\n\n");
  const prompt = buildGenerationPrompt(city, pages);

  const summary = {
    cityId: city.id,
    name: city.name,
    rootUrl: city.url,
    crawledAt: new Date().toISOString(),
    pathPrefixes,
    pageCount: pages.length,
    totalMarkdownChars: crawledContent.length,
    promptChars: prompt.length,
    pages: pages.map((page) => ({
      url: page.url,
      markdownChars: page.markdown.length,
      linkCount: page.links.length,
      links: page.links,
    })),
  };

  await writeFile(
    path.join(dir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(path.join(dir, "crawled-content.md"), crawledContent, "utf-8");
  await writeFile(path.join(dir, "prompt-preview.txt"), prompt, "utf-8");
  await writeFile(
    path.join(dir, "pages.json"),
    `${JSON.stringify(pages, null, 2)}\n`,
    "utf-8",
  );

  return dir;
}
