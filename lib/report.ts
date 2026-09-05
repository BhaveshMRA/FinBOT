import type { Profile, QuestionnaireItem } from "./types.ts";

function evidenceLine(item: QuestionnaireItem): string {
  const last = item.evidence[item.evidence.length - 1];
  if (!last) return "";
  if (last.sourceFile) return `Source: ${last.sourceFile}`;
  if (last.respondent) return `Reported by: ${last.respondent}`;
  return "";
}

export function buildReportMarkdown(profile: Profile): string {
  const verified = profile.items.filter((i) => i.status === "verified_from_docs");
  const confirmed = profile.items.filter((i) => i.status === "confirmed_by_user");
  const conflicted = profile.items.filter((i) => i.status === "conflicted");
  const unknown = profile.items.filter((i) => i.status === "unknown");

  const section = (title: string, items: QuestionnaireItem[], showPriority = false) => {
    if (items.length === 0) return `## ${title}\n\n_None yet._\n`;
    const lines = items.map((item) => {
      const parts = [`- **${item.question}**`];
      if (item.answer) parts.push(item.answer);
      if (item.confidence > 0) parts.push(`(Confidence: ${item.confidence}%)`);
      if (showPriority) parts.push(`(Priority: ${item.priority})`);
      const ev = evidenceLine(item);
      return ev ? `${parts.join(" ")}\n  _${ev}_` : parts.join(" ");
    });
    return `## ${title}\n\n${lines.join("\n")}\n`;
  };

  return [
    `# Security Questionnaire — Generated Report`,
    `_${verified.length + confirmed.length} / ${profile.items.length} questions answered_`,
    section("Verified from company information", verified),
    section("Confirmed by user", confirmed),
    conflicted.length > 0 ? section("⚠ Conflicted — needs resolution", conflicted) : "",
    section("Unknown / needs confirmation", unknown, true),
  ]
    .filter(Boolean)
    .join("\n");
}
