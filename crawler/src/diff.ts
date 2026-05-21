import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { CrawlPage, DiffResult } from "./types.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "..", "output");

function hashContent(pages: CrawlPage[]): string {
  const combined = pages
    .map((page) => `# ${page.url}\n${page.markdown}`)
    .join("\n\n---\n\n");

  return createHash("sha256").update(combined).digest("hex");
}

function cityOutputDir(cityId: string): string {
  return path.join(OUTPUT_DIR, cityId);
}

export function computeContentHash(pages: CrawlPage[]): string {
  return hashContent(pages);
}

export async function checkForChanges(
  cityId: string,
  pages: CrawlPage[],
): Promise<DiffResult> {
  const dir = cityOutputDir(cityId);
  const hashPath = path.join(dir, "hash.txt");
  const llmsPath = path.join(dir, "llms.txt");

  const newHash = hashContent(pages);

  let previousHash: string | null = null;
  try {
    previousHash = (await readFile(hashPath, "utf-8")).trim();
  } catch {
    previousHash = null;
  }

  let previousContent: string | null = null;
  try {
    previousContent = await readFile(llmsPath, "utf-8");
  } catch {
    previousContent = null;
  }

  const changed = previousHash !== newHash;

  return { changed, previousContent };
}

export async function writeHash(cityId: string, hash: string): Promise<void> {
  const dir = cityOutputDir(cityId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "hash.txt"), hash, "utf-8");
}

export function getOutputDir(cityId: string): string {
  return cityOutputDir(cityId);
}
