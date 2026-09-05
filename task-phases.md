# Task Phases — 11:30 → 14:30 (3h clock)

Rule for every phase: **last item is always a README update.** If a phase runs
long, cut the README update to one paragraph, not to zero.

---

## Phase 0 — Environment & Data Prep (11:30–11:50, 20 min)
- [x] 5 zips confirmed present at project root, contents inventoried (no
      extraction needed to know this — `unzip -l`):
      - **1. Sample_Vendor questionnaire** → 1 `.xlsx` (the actual question list)
      - **2. Company policies** → 13 `.docx`
      - **3. Security Assessment Reports** → 2 `.docx` (VAPT, SOC2 Type II)
      - **4. Contracts_agreements** → 2 `.docx`
      - **5. Infrastructure_internal info** → 2 `.xlsx`, 1 `.pdf`, 2 `.docx`, 2 `.png`
      Formats needed: `mammoth` (docx), `xlsx`, `pdf-parse`. No OCR for the 2 PNGs.
- [ ] `create-next-app` (App Router, TS) in this directory.
- [ ] `npm i mammoth xlsx pdf-parse ai @ai-sdk/anthropic` (or gateway equivalent) —
      only these, nothing speculative.
- [ ] Extract each zip into `data/raw/<category>/...`, category = folder name with
      numeric prefix stripped (e.g. `Company policies`, not `2. Company policies`).
- [ ] README v0: what this app is, folder layout, how to run `npm run dev`.

## Phase 1 — Ingestion Pipeline (11:50–12:30, 40 min)
- [ ] Parsers: `mammoth` (13+ docx), `xlsx` (asset inventory, access review
      records — NOT the vendor questionnaire xlsx, that's Phase 2), `pdf-parse`
      (W-9, network architecture doc). PNGs → just record filename+category into
      `data/assets.json`, no parsing.
- [ ] Chunker: ~300–500 words/chunk, keep source file + category as metadata.
- [ ] `scripts/ingest.ts` → writes `data/index.json` (array of `Chunk`).
- [ ] `npm run ingest` script in package.json.
- [ ] Sanity check: log chunk count per source file, spot-check 2–3 chunks read
      correctly (no binary garbage) — docx via mammoth can leave odd whitespace,
      trim it.
- [ ] README: ingestion section — what it does, how to re-run after adding docs.

## Phase 2 — Search & Profile Store (12:30–13:05, 35 min) [+5 min for bonus fields]
- [ ] `lib/search.ts`: `searchDocuments(query, k=5)` — keyword/term-overlap scoring
      over `index.json`, returns `{sourceFile, text}[]`.
- [ ] `scripts/parse-questionnaire.ts`: parse
      `Regodit_Comprehensive_Vendor_Security_Questionnaire_Clean.xlsx` rows into
      `data/questions.seed.json`. **Check for an existing risk/category/criticality
      column while parsing** — if present, map it straight to `priority`; if not,
      apply the category-keyword fallback (Implementation.md §5b).
- [ ] `lib/confidence.ts`: one function, status → confidence lookup
      (Implementation.md §5a). No ML, no config file — a switch statement.
- [ ] `lib/profile.ts`: `getProfile()` (priority-sorted), `updateItem(id, patch)`
      (rejects empty `evidence[]` on non-unknown status; auto-diffs previous
      answer/status into `changeLog` before overwriting), `flagConflict(id,
      description, parties)`, `setRespondent(name, role?)` — read/write
      `data/profile.json`, seeded from `questions.seed.json` on first run.
- [ ] Quick manual test: call search + profile functions from a scratch script —
      confirm round-trip, confirm `updateItem` rejects no-evidence calls, confirm
      a second `updateItem` on the same id produces a `changeLog` entry.
- [ ] README: data model section (Chunk + QuestionnaireItem shapes incl.
      confidence/priority/evidence/changeLog, one example) + note that questions
      come from the actual vendor questionnaire file.

## Phase 3 — Conversational Agent (13:05–13:50, 45 min)
- [ ] `/api/chat` route: `streamText` with tools `searchDocuments`, `getProfile`,
      `updateItem`, `flagConflict`, `setRespondent` wired to Phase 1/2 modules.
- [ ] System prompt encodes all 9 rules in Implementation.md §5 (search-first,
      ask-if-missing, follow-up, conflict detection, no re-asking, generate-report
      trigger, evidence-required, corrections-via-updateItem, priority-first) —
      paste near-verbatim, don't hand-summarize under time pressure.
- [ ] Chat UI (`app/page.tsx`) via `useChat` — message list + input, PLUS
      (Implementation.md §6a, now required not optional):
      doc/user evidence badge (📄/🗣), confidence color (green/amber/red),
      "X/Y answered" + top-unanswered-by-priority sidebar, current respondent
      label if set.
- [ ] Manual run-through of 4 scenarios: (a) doc-answerable question (e.g. MFA —
      check `access_control_policy`/`password_and_secrets_policy`), (b) vague
      answer needing follow-up (backup cadence — check `business_continuity_and_
      disaster_recovery_policy` first, then push for automation detail), (c) a
      conflict (check VAPT/SOC2 vs. a policy doc first; plant one if nothing real
      surfaces), (d) a correction — resolve an item, then tell the bot it's wrong,
      confirm `changeLog` records the prior value instead of silently vanishing.
- [ ] README: agent architecture — tool list, system prompt summary, state
      machine, and how confidence/priority/respondent tagging work.

## Phase 4 — Report Generation & Polish (13:50–14:15, 25 min)
- [ ] `generateReport` tool (or a `/report` view) rendering the profile grouped
      into Verified from company info / Confirmed by user / Unknown, each item
      with confidence %, evidence citation (doc or respondent quote), and
      priority shown for unresolved items.
- [ ] Guardrails: empty search results handled gracefully, empty profile handled
      on first load, no unhandled promise rejections visible in the demo.
- [ ] README final pass: architecture diagram (ASCII is fine), full run
      instructions, a scripted demo walkthrough for judges (include the bonus
      features in the script — confidence, priority, correction, multi-
      stakeholder), "known limitations" section from Implementation.md §8.

## Phase 5 — Demo Rehearsal (14:15–14:25, 10 min, hard stop)
- [ ] One clean end-to-end run of the scripted demo (fresh `profile.json`).
- [ ] Fix anything that breaks the narrative; do not start new features here.
- [ ] Final commit.

## Phase 6 — Stretch bonuses (14:25–14:30, ONLY if Phase 5 finished early)
- [ ] Voice: browser `SpeechRecognition` mic button + `speechSynthesis` read-aloud
      toggle (Implementation.md §9). Client-side only, degrades silently if
      unsupported. Skip entirely rather than let this bleed past 14:30.
- [ ] Generalized questionnaire upload (Implementation.md §9) — only attempt if
      Phase 6 voice is already done with time to spare. Realistically this is a
      "next version" talking point in the README, not a built feature today.

---

## Cut list if time runs out (in order of what to drop first)
1. Voice interaction and generalized questionnaire upload (Phase 6 — never core).
2. UI styling beyond default/minimal (keep the required badges/sidebar, drop polish).
3. Multiple conflict scenarios in the demo script (keep just one).
4. Multi-stakeholder demo scenario (keep `setRespondent` wired, skip showing a
   second respondent live — mention it in the README instead).
5. Extra seed questions beyond what's in the actual vendor questionnaire xlsx
   (there shouldn't be extra — it's the real source — but if parsing surfaces an
   unwieldy number of rows, demo a representative subset, not all of them).

Never cut: search-before-ask, follow-up on vague answers, conflict flagging,
evidence-required-for-every-answer, confidence scores, priority sort, the
three-way status split in the final report — these are the graded criteria.
