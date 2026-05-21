import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crawlSite } from "./crawl.js";
import {
  checkForChanges,
  computeContentHash,
  writeHash,
} from "./diff.js";
import { writeDryRunArtifacts } from "./dry-run.js";
import { generateLlmsTxt } from "./generate.js";
import type { City } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = path.join(__dirname, "..", "data", "cities.json");

interface CliOptions {
  dryRun: boolean;
  cityId?: string;
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const dryRun =
    args.includes("--dry-run") ||
    process.env.DRY_RUN === "1" ||
    process.env.DRY_RUN === "true";

  let cityId: string | undefined;
  const cityFlagIndex = args.indexOf("--city");
  if (cityFlagIndex !== -1) {
    cityId = args[cityFlagIndex + 1];
  }

  cityId ??= process.env.CITY_ID;

  return { dryRun, cityId };
}

async function loadCities(cityId?: string): Promise<City[]> {
  const raw = await readFile(CITIES_PATH, "utf-8");
  const cities = JSON.parse(raw) as City[];

  if (!cityId) {
    return cities;
  }

  const filtered = cities.filter((city) => city.id === cityId);
  if (filtered.length === 0) {
    throw new Error(
      `Unknown city id "${cityId}". Available: ${cities.map((city) => city.id).join(", ")}`,
    );
  }

  return filtered;
}

async function processCity(city: City, dryRun: boolean): Promise<void> {
  console.log(`\n[${city.id}] Starting crawl for ${city.name}`);

  const pages = await crawlSite(city);
  console.log(`[${city.id}] Crawled ${pages.length} page(s)`);

  if (dryRun) {
    const artifactDir = await writeDryRunArtifacts(city, pages);
    console.log(`[${city.id}] Dry run — wrote artifacts to ${artifactDir}`);
    console.log(`[${city.id}] Skipping llms.txt generation`);
    return;
  }

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
  const { dryRun, cityId } = parseCliOptions();
  const cities = await loadCities(cityId);
  const failures: Array<{ cityId: string; error: string }> = [];

  if (dryRun) {
    console.log("DRY RUN — crawl only, no OpenRouter, no git output files");
    if (cityId) {
      console.log(`Filtering to city: ${cityId}`);
    }
  }

  for (const city of cities) {
    try {
      await processCity(city, dryRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${city.id}] Failed: ${message}`);
      failures.push({ cityId: city.id, error: message });
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Processed: ${cities.length} city/cities`);
  console.log(`Failed: ${failures.length}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "full"}`);

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
