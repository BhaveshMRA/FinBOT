// Extracts text from data/raw/<category>/<file> and writes:
//   data/index.json    - chunked, searchable text (Chunk[])
//   data/assets.json   - non-text files kept as citable references (Asset[])
//
// ponytail: no overlap between chunks, fixed ~400-word windows. Add overlap only
// if search quality demo shows evidence getting split across chunk boundaries.

import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUT_DIR = path.join(process.cwd(), "data");
const CHUNK_WORDS = 400;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }
  if (ext === ".xlsx") {
    const buffer = await readFile(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      return `Sheet: ${name}\n${csv}`;
    }).join("\n\n");
  }
  if (ext === ".pdf") {
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }
  return null; // .png and anything else -> asset, not text
}

function chunkText(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
  }
  return chunks;
}

async function main() {
  const files = await walk(RAW_DIR);
  const chunks = [];
  const assets = [];

  for (const filePath of files) {
    const relPath = path.relative(RAW_DIR, filePath);
    const category = relPath.split(path.sep)[0];
    const sourceFile = relPath;

    let text;
    try {
      text = await extractText(filePath);
    } catch (err) {
      console.warn(`[ingest] failed to parse ${sourceFile}: ${err.message}`);
      continue;
    }

    if (text === null) {
      assets.push({ sourceFile, category });
      continue;
    }

    const pieces = chunkText(text);
    pieces.forEach((piece, i) => {
      chunks.push({ id: `${sourceFile}#${i}`, sourceFile, category, text: piece });
    });
    console.log(`[ingest] ${sourceFile}: ${pieces.length} chunk(s)`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(chunks, null, 2));
  await writeFile(path.join(OUT_DIR, "assets.json"), JSON.stringify(assets, null, 2));

  console.log(`\n[ingest] done: ${chunks.length} chunks across ${files.length - assets.length} files, ${assets.length} non-text asset(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
