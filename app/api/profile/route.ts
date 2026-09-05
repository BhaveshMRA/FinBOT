import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { getProfile } from "@/lib/profile.ts";

const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");

export async function GET() {
  return Response.json(getProfile());
}

// Resets the demo to a fresh, unanswered state - profile.json regenerates
// from questions.seed.json on the next read. Used by the "Reset demo" button
// so a live demo doesn't need terminal access between runs.
export async function DELETE() {
  if (existsSync(PROFILE_PATH)) rmSync(PROFILE_PATH);
  return Response.json(getProfile());
}
