# BundTxt

BundTxt crawls German government websites (starting with Ausländerbehörden), extracts their content, and generates `llms.txt` files that help AI models answer questions from users who may not speak German. The crawler runs daily via GitHub Actions and uses a self-hosted [crawl4ai](https://github.com/unclecode/crawl4ai) instance on Railway for web scraping.

## Adding a new city

Edit [`crawler/data/cities.json`](crawler/data/cities.json) and add an object with:

- `id` — slug used for the output folder (e.g. `"berlin"`)
- `name` — full Behörde name
- `url` — main website URL
- `language` — source language (usually `"de"`)
- `hotline` — phone number
- `appointmentUrl` — appointment booking URL

The crawler will pick up the new city on the next run.

## Running locally

```bash
cp .env.example .env
# Fill in CRAWL4AI_URL and OPENROUTER_API_KEY

cd crawler
npm install
npm start
```

Generated files are written to `output/{city-id}/llms.txt`.

## Railway + GitHub Actions

1. **Railway** hosts crawl4ai as a stateless scraping API (see [`docker-compose.yml`](docker-compose.yml)). Set `OPENROUTER_API_KEY` as a Railway environment variable — never commit it.

2. **GitHub Actions** (`.github/workflows/daily-crawl.yml`) runs every morning at 06:00 UTC:
   - Checks out the repo
   - Runs the TypeScript crawler on the Actions runner
   - Calls Railway for scraping and OpenRouter for `llms.txt` generation
   - Commits updated `output/` files back to the repo

Add these GitHub repository secrets:

- `CRAWL4AI_URL` — your Railway crawl4ai URL
- `OPENROUTER_API_KEY` — your OpenRouter API key

## Output

Generated `llms.txt` files live in [`output/`](output/). The [`web/`](web/) app (coming soon) will serve them publicly.
