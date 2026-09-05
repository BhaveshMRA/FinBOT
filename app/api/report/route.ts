import { getProfile } from "@/lib/profile.ts";
import { buildReportMarkdown } from "@/lib/report.ts";

export async function GET() {
  const markdown = buildReportMarkdown(getProfile());
  return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
