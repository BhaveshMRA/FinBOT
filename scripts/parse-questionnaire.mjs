// Parses the real vendor security questionnaire (not hand-seeded - see
// Implementation.md §3.1a) into data/questions.seed.json.
//
// Source sheet "Vendor Security Responses" is laid out as:
//   ["Topic", "<category name>"]  -> starts a new category
//   [<numeric id>, "<question text>"]  -> one question
// Row 52 in the source file is missing its question text (a real data gap in
// the provided file, not a parsing bug) - kept as a flagged placeholder rather
// than silently dropped, since "never guess, surface gaps" is the point of this app.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const FILE = path.join(
  process.cwd(),
  "data/raw/Sample_Vendor questionnaire/Regodit_Comprehensive_Vendor_Security_Questionnaire_Clean.xlsx"
);
const OUT = path.join(process.cwd(), "data/questions.seed.json");

// Implementation.md §5b: no per-question risk column in the source file, so
// priority is assigned by category. Categories not listed default to "medium".
const HIGH = new Set([
  "Data Security",
  "Vulnerability Management",
  "Incident Response",
  "Network & Endpoint Security",
  "Asset Management",
  "Risk Assessment",
  "Physical Security",
]);
const LOW = new Set(["Security Awareness & Training"]);

function priorityFor(category) {
  if (HIGH.has(category)) return "high";
  if (LOW.has(category)) return "low";
  return "medium";
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

async function main() {
  const buffer = await readFile(FILE);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Vendor Security Responses"], {
    header: 1,
    blankrows: false,
    defval: null,
  });

  const items = [];
  let category = "Uncategorized";

  for (const row of rows) {
    if (row[0] === "Topic") {
      category = String(row[1]).trim();
      continue;
    }
    if (typeof row[0] !== "number") continue; // header/vendor-info rows

    const id = row[0];
    let question = row[1];
    if (question === null || question === undefined || question === id) {
      question = `[Question text missing in source questionnaire for item #${id} - flag to the vendor contact]`;
    } else {
      question = String(question).trim();
    }

    items.push({
      id: `q${id}_${slugify(question)}` || `q${id}`,
      category,
      question,
      priority: priorityFor(category),
      status: "unknown",
      confidence: 0,
      evidence: [],
      lastUpdated: null,
    });
  }

  await writeFile(OUT, JSON.stringify(items, null, 2));
  console.log(`[parse-questionnaire] wrote ${items.length} questions across ${new Set(items.map(i => i.category)).size} categories -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
