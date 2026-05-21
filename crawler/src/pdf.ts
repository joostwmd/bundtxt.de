import pdfParse from "pdf-parse";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

export async function extractPdfText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[pdf] Failed to download ${url}: ${response.status}`);
      return null;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_PDF_BYTES) {
      console.warn(`[pdf] Skipping ${url}: exceeds 5MB limit`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_PDF_BYTES) {
      console.warn(`[pdf] Skipping ${url}: exceeds 5MB limit`);
      return null;
    }

    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim();

    if (!text) {
      console.warn(`[pdf] No text extracted from ${url}`);
      return null;
    }

    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[pdf] Error processing ${url}: ${message}`);
    return null;
  }
}

export function isPdfUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return url.toLowerCase().includes(".pdf");
  }
}
