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
- [x] `create-next-app` (App Router, TS, Tailwind) scaffolded — Next.js 16.3.4,
      React 19.2.8.
- [x] `npm i mammoth xlsx pdf-parse ai @ai-sdk/react zod` — installed.
      **BLOCKER (open)**: no model API key in the environment yet
      (Anthropic/OpenAI/AI Gateway) — needed before Phase 3's `/api/chat` route
      can actually call a model. Ask user for one before starting Phase 3.
- [x] Extracted each zip into `data/raw/<category>/...`, numeric prefix stripped.
      Confirmed contents match the Phase 0 inventory exactly (13 docx in Company
      policies, etc. — see README.md).
- [x] `git init`, remote `github.com/BhaveshMRA/FinBOT` added, initial commit
      pushed — unblocks PRISM's GitHub discovery (was failing with HTTP 409 on
      an empty repo).
- [x] README v0 written: what this app is, folder layout, how to run, mandatory
      tooling section (GIDE + PRISM status).

## Phase 1 — Ingestion Pipeline (11:50–12:30, 40 min) — DONE
- [x] `scripts/ingest.mjs` (plain ESM, no ts-node/tsx dep) — mammoth for docx,
      `XLSX.read(buffer)` for xlsx (note: `XLSX.readFile` isn't exported under
      ESM import, had to read the buffer myself), `new PDFParse({data}).getText()`
      for pdf (v2 API, not the old `pdf(buffer)` callable). PNGs recorded into
      `data/assets.json`, not parsed.
- [x] Chunker: fixed 400-word windows, no overlap (ponytail: add overlap only if
      demo search misses evidence split across a chunk boundary).
- [x] `npm run ingest` — **257 chunks across 24 files, 2 non-text assets.** All
      24 real documents parsed successfully, zero failures on the second run.
- [x] `scripts/parse-questionnaire.mjs` — parses the REAL vendor questionnaire's
      "Vendor Security Responses" sheet (not the 7 brief examples): **66 real
      questions across 14 categories** (Governance, Third-Party Risk Mgmt,
      Security Awareness & Training, Privacy, Data Security, Physical Security,
      Web App Security, Secure Coding, Vulnerability Mgmt, BC/DR, Incident
      Response, Network & Endpoint Security, Asset Management, Risk Assessment).
      Priority assigned per category (Implementation.md §5b, updated with real
      category names).
- [x] Data quality note for the demo: **question #52 in the source file has no
      question text** (a genuine gap in the provided spreadsheet — merged-cell
      artifact). Parser doesn't drop it or guess; it's kept with a flagged
      placeholder so the agent surfaces it as unknown/needs-attention rather
      than silently skipping a question ID. Worth mentioning to judges — it's
      a live example of "ambiguous/incomplete source data."
- [x] README: ingestion section added.

## Phase 2 — Search & Profile Store (12:30–13:05, 35 min) — DONE
- [x] `lib/search.ts`: `searchDocuments(query, k=5)` — keyword/term-overlap
      scoring over `index.json`. Verified: "encryption" query returns 3 hits.
- [x] `scripts/parse-questionnaire.mjs` (see Phase 1 — done there since it
      needed the raw file inspection first).
- [x] `lib/confidence.ts`: `computeConfidence(status, opts)` lookup
      (Implementation.md §5a) — no ML, no config file.
- [x] `lib/profile.ts`: `getProfile()` (unresolved-first, then priority-sorted),
      `updateItem(id, patch)` (throws `EvidenceRequiredError` on empty evidence
      for a non-unknown status; auto-diffs into `changeLog` on overwrite),
      `flagConflict(id, description, parties)`, `setRespondent(name, role?)`,
      `appendHistory(role, content)` — backed by `data/profile.json`, seeded
      from `questions.seed.json` on first read.
- [x] `lib/types.ts`: shared `Chunk`/`Evidence`/`QuestionnaireItem`/`Profile`
      types, matching Implementation.md §3.
- [x] `scripts/test-profile.ts` — assert-based smoke test (backs up/restores
      any real `profile.json` so it's safe to run anytime): evidence
      enforcement ✓, changeLog on correction ✓, conflict flagging ✓, search
      returns hits ✓. Run via `npm run test:profile`.
      Note: internal `lib/*.ts` imports use explicit `.ts` extensions —
      required for this test script to run directly under Node's native TS
      type-stripping (Node 25); harmless for Next.js's bundler resolution.
- [x] README: data model + how to run the smoke test.

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
