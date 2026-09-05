import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

const MIME_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
};

// sourceFile values (e.g. "Company policies/Regodit_password_and_secrets_policy_v1.0.docx")
// are relative paths under data/raw - this just re-serves the original source
// document so a citation can be opened, with path traversal blocked.
export async function GET(req: Request) {
  const sourceFile = new URL(req.url).searchParams.get("sourceFile");
  if (!sourceFile) return new Response("missing sourceFile", { status: 400 });

  const resolved = path.resolve(RAW_DIR, sourceFile);
  if (!resolved.startsWith(RAW_DIR + path.sep) || !existsSync(resolved)) {
    return new Response("not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const buffer = readFileSync(resolved);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${path.basename(resolved)}"`,
    },
  });
}
