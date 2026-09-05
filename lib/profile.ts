import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computeConfidence } from "./confidence.ts";
import type { Evidence, Profile, QuestionnaireItem, Status } from "./types.ts";

const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");
const SEED_PATH = path.join(process.cwd(), "data", "questions.seed.json");

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const UNRESOLVED: Status[] = ["unknown", "conflicted"];

function load(): Profile {
  if (!existsSync(PROFILE_PATH)) {
    const seedItems: QuestionnaireItem[] = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
    const profile: Profile = { items: seedItems, history: [] };
    save(profile);
    return profile;
  }
  return JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
}

function save(profile: Profile) {
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

export function getProfile(): Profile {
  const profile = load();
  const sorted = [...profile.items].sort((a, b) => {
    const unresolvedDiff = Number(UNRESOLVED.includes(b.status)) - Number(UNRESOLVED.includes(a.status));
    if (unresolvedDiff !== 0) return unresolvedDiff;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
  return { ...profile, items: sorted };
}

export type UpdateItemPatch = {
  status?: Status;
  answer?: string;
  evidence?: Evidence[];
  strong?: boolean;
  afterConflictResolution?: boolean;
  changedBy?: string;
  reason?: string;
};

export class EvidenceRequiredError extends Error {
  constructor(id: string) {
    super(`updateItem(${id}): a non-unknown status requires at least one evidence entry.`);
  }
}

export function updateItem(id: string, patch: UpdateItemPatch): QuestionnaireItem {
  const profile = load();
  const item = profile.items.find((i) => i.id === id);
  if (!item) throw new Error(`updateItem: no questionnaire item with id "${id}"`);

  const resultingStatus = patch.status ?? item.status;
  const resultingEvidence = patch.evidence ?? item.evidence;
  if (resultingStatus !== "unknown" && resultingEvidence.length === 0) {
    throw new EvidenceRequiredError(id);
  }

  const wasResolved = item.status !== "unknown";
  const answerChanged = patch.answer !== undefined && patch.answer !== item.answer;
  if (wasResolved && (answerChanged || (patch.status && patch.status !== item.status))) {
    item.changeLog = item.changeLog ?? [];
    item.changeLog.push({
      prevAnswer: item.answer,
      prevStatus: item.status,
      changedAt: new Date().toISOString(),
      changedBy: patch.changedBy ?? profile.currentRespondent?.name ?? "unknown",
      reason: patch.reason,
    });
  }

  item.status = resultingStatus;
  if (patch.answer !== undefined) item.answer = patch.answer;
  item.evidence = resultingEvidence;
  item.confidence = computeConfidence(resultingStatus, {
    strong: patch.strong,
    afterConflictResolution: patch.afterConflictResolution,
  });
  item.lastUpdated = new Date().toISOString();

  save(profile);
  return item;
}

export function flagConflict(id: string, description: string, parties: string[]): QuestionnaireItem {
  const profile = load();
  const item = profile.items.find((i) => i.id === id);
  if (!item) throw new Error(`flagConflict: no questionnaire item with id "${id}"`);

  item.conflicts = item.conflicts ?? [];
  item.conflicts.push({ description, parties });
  item.status = "conflicted";
  item.confidence = computeConfidence("conflicted");
  item.lastUpdated = new Date().toISOString();

  save(profile);
  return item;
}

export function setRespondent(name: string, role?: string): Profile {
  const profile = load();
  profile.currentRespondent = { name, role };
  save(profile);
  return profile;
}

export function appendHistory(role: "user" | "assistant", content: string): void {
  const profile = load();
  profile.history.push({
    role,
    content,
    ts: new Date().toISOString(),
    respondent: profile.currentRespondent?.name,
  });
  save(profile);
}
