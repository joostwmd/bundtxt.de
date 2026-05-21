import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { City, CrawlPage } from "./types.js";
import { getOutputDir } from "./diff.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-flash-1.5";

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
  return key;
}

function buildCrawledMarkdown(pages: CrawlPage[]): string {
  return pages
    .map((page) => `## ${page.url}\n\n${page.markdown}`)
    .join("\n\n---\n\n");
}

export function buildGenerationPrompt(city: City, pages: CrawlPage[]): string {
  const markdown = buildCrawledMarkdown(pages);

  return `You are generating an llms.txt file for a German government website.
This file will be read by AI models to answer questions from users — 
many of whom do not speak German.

Website: ${city.name}
Main URL: ${city.url}
Hotline: ${city.hotline}
Appointment booking: ${city.appointmentUrl}

Crawled content:
---
${markdown}
---

Generate a valid llms.txt file (following llmstxt.org spec) that:
1. Is written in English
2. Lists canonical URLs for: appointments, required documents, contact, opening hours
3. Contains explicit bail-out rules: for eligibility questions ("Am I eligible for...?") 
   and specific legal amounts/deadlines, instruct the model to route users to the hotline 
   or appointment URL instead of answering
4. Includes a language note that the source site is in German
5. Includes Last-Crawled and Crawl-Frequency metadata

Output only the llms.txt content, no explanation.`;
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:txt|markdown)?\s*([\s\S]*?)```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function generateLlmsTxt(
  city: City,
  pages: CrawlPage[],
): Promise<string> {
  const prompt = buildGenerationPrompt(city, pages);

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://bundtxt.de",
      "X-Title": "BundTxt Crawler",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter request failed: ${response.status} ${errorText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw new Error(`OpenRouter error: ${payload.error.message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned empty content");
  }

  const llmsTxt = stripCodeFence(content);
  const outputDir = getOutputDir(city.id);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "llms.txt"), llmsTxt, "utf-8");

  return llmsTxt;
}
