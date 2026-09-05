import { getProfile } from "@/lib/profile.ts";

export async function GET() {
  return Response.json(getProfile());
}
