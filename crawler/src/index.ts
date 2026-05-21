import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crawlSite } from "./crawl.js";
import {
  checkForChanges,
  computeContentHash,
  writeHash,
} from "./diff.js";
import { generateLlmsTxt } from "./generate.js";
import type { City } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = path.join(__dirname, "..", "data", "cities.json");

async function loadCities(): Promise<City[]> {
  const raw = await readFile(CITIES_PATH, "utf-8");
  return JSON.parse(raw) as City[];
}

async function processCity(city: City): Promise<void> {
  console.log(`\n[${city.id}] Starting crawl for ${city.name}`);

  const pages = await crawlSite(city.url);
  console.log(`[${city.id}] Crawled ${pages.length} page(s)`);

  const diff = await checkForChanges(city.id, pages);

  if (!diff.changed) {
    console.log(`[${city.id}] No changes detected — skipping generation`);
    return;
  }

  console.log(`[${city.id}] Content changed — generating llms.txt`);
  await generateLlmsTxt(city, pages);

  const hash = computeContentHash(pages);
  await writeHash(city.id, hash);

  console.log(`[${city.id}] Updated output/${city.id}/llms.txt`);
}

async function main(): Promise<void> {
  const cities = await loadCities();
  const failures: Array<{ cityId: string; error: string }> = [];

  for (const city of cities) {
    try {
      await processCity(city);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${city.id}] Failed: ${message}`);
      failures.push({ cityId: city.id, error: message });
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Processed: ${cities.length} city/cities`);
  console.log(`Failed: ${failures.length}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`- ${failure.cityId}: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
