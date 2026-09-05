// Manual smoke test for lib/profile.ts + lib/search.ts + lib/confidence.ts.
// ponytail: assert-based, no framework - this is the "one runnable check" for
// the non-trivial logic in the profile store (evidence enforcement, changeLog).
import assert from "node:assert/strict";
import { existsSync, rmSync, copyFileSync } from "node:fs";
import path from "node:path";
import { getProfile, updateItem, flagConflict, setRespondent, EvidenceRequiredError } from "../lib/profile.ts";
import { searchDocuments } from "../lib/search.ts";

const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");
const BACKUP_PATH = PROFILE_PATH + ".bak";

// don't clobber a real in-progress demo profile - back it up, restore after.
const hadExisting = existsSync(PROFILE_PATH);
if (hadExisting) copyFileSync(PROFILE_PATH, BACKUP_PATH);
if (hadExisting) rmSync(PROFILE_PATH);

try {
  const profile = getProfile();
  assert.ok(profile.items.length > 60, "expected ~66 seeded questions");
  const firstItem = profile.items[0];
  assert.equal(firstItem.status, "unknown");

  // 1. evidence enforcement
  assert.throws(
    () => updateItem(firstItem.id, { status: "confirmed_by_user", answer: "yes", evidence: [] }),
    EvidenceRequiredError
  );

  // 2. normal update with evidence
  const updated = updateItem(firstItem.id, {
    status: "confirmed_by_user",
    answer: "Yes, daily automated backups",
    evidence: [{ respondent: "test-user", statement: "Yes, daily automated backups", ts: new Date().toISOString() }],
  });
  assert.equal(updated.status, "confirmed_by_user");
  assert.equal(updated.confidence, 70);

  // 3. correction produces a changeLog entry, not a silent overwrite
  setRespondent("Priya", "DevOps");
  const corrected = updateItem(firstItem.id, {
    answer: "Actually, backups are weekly, not daily",
    evidence: [{ respondent: "Priya", statement: "Actually, backups are weekly, not daily", ts: new Date().toISOString() }],
  });
  assert.equal(corrected.changeLog?.length, 1);
  assert.equal(corrected.changeLog?.[0].prevAnswer, "Yes, daily automated backups");
  assert.equal(corrected.changeLog?.[0].changedBy, "Priya");

  // 4. conflict flagging
  const conflicted = flagConflict(profile.items[1].id, "Doc says MFA mandatory; user says otherwise", [
    "doc:access_control_policy.docx",
    "user:test-user",
  ]);
  assert.equal(conflicted.status, "conflicted");
  assert.equal(conflicted.confidence, 25);

  // 5. search returns something for an obviously-present term
  const results = searchDocuments("encryption", 3);
  assert.ok(results.length > 0, "expected at least one search hit for 'encryption'");

  console.log("[test-profile] all assertions passed:", {
    questions: profile.items.length,
    searchHitsForEncryption: results.length,
  });
} finally {
  rmSync(PROFILE_PATH, { force: true });
  if (hadExisting) {
    copyFileSync(BACKUP_PATH, PROFILE_PATH);
    rmSync(BACKUP_PATH);
  }
}
