export interface City {
  id: string;
  name: string;
  url: string;
  language: string;
  hotline: string;
  appointmentUrl: string;
  /** Extra URL path prefixes to crawl, e.g. ["/ukraine/"]. The prefix from `url` is always included automatically. */
  crawlPathPrefixes?: string[];
}

export interface CrawlPage {
  url: string;
  markdown: string;
  links: string[];
}

export interface DiffResult {
  changed: boolean;
  previousContent: string | null;
}

export interface Crawl4AiTaskResponse {
  task_id?: string;
  status?: string;
  result?: Crawl4AiCrawlResult;
  error?: string;
}

export interface Crawl4AiCrawlResult {
  url?: string;
  markdown?: string | MarkdownResult;
  links?:
    | string[]
    | { href?: string; url?: string }[]
    | {
        internal?: Array<{ href?: string } | string>;
        external?: Array<{ href?: string } | string>;
      };
  success?: boolean;
  error_message?: string;
}

export interface MarkdownResult {
  raw_markdown?: string;
  fit_markdown?: string;
  markdown_with_citations?: string;
}

export interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}
