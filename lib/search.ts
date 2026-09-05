import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "./types.ts";

// ponytail: keyword/term-overlap scoring, no embeddings, no vector DB.
// Implementation.md §2 - swap for embeddings + cosine if recall is visibly bad.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "your", "you", "of", "to", "in",
  "on", "for", "and", "or", "if", "any", "have", "has", "with", "that", "this",
  "will", "be", "by", "at", "as", "it", "please", "describe", "there",
]);

let cachedChunks: Chunk[] | null = null;

function loadChunks(): Chunk[] {
  if (cachedChunks) return cachedChunks;
  const indexPath = path.join(process.cwd(), "data", "index.json");
  if (!existsSync(indexPath)) {
    console.warn("[search] data/index.json not found - run `npm run ingest` first. Returning no results.");
    cachedChunks = [];
    return cachedChunks;
  }
  cachedChunks = JSON.parse(readFileSync(indexPath, "utf-8"));
  return cachedChunks!;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export type SearchResult = { sourceFile: string; category: string; text: string; score: number };

export function searchDocuments(query: string, k = 5): SearchResult[] {
  const chunks = loadChunks();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scored = chunks.map((chunk) => {
    const chunkTextLower = chunk.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const occurrences = chunkTextLower.split(term).length - 1;
      score += occurrences;
    }
    return { sourceFile: chunk.sourceFile, category: chunk.category, text: chunk.text, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
