# FinBOT — AI Security Analyst — Implementation Plan

Author's stance: hackathon, 3-hour clock (11:30–14:30). Every choice below optimizes
for "works end-to-end and demoable" over "correct at scale." Each shortcut is called
out with its upgrade path — do not build the upgrade path now.

## 1. What we're actually building

A chatbot that fills out a security questionnaire by:
1. Searching ingested company docs first.
2. Asking the user only for what docs don't cover.
3. Pushing for specifics on vague answers (follow-up loop).
4. Catching contradictions between sources (or source vs. user) and surfacing them.
5. Persisting a structured profile across the conversation (no re-asking).
6. Emitting a final report split into: Verified from company info / Confirmed by user / Unknown.

The hard part isn't the LLM call — it's the **state machine around the questionnaire
item** (unknown → searching → evidence-found | needs-user → asked → follow-up →
confirmed | conflicted → resolved) and making the agent respect it via tools instead
of freelancing in prose.

## 1a. Bonus scoring criteria — coverage matrix

| Bonus item | Status | How |
|---|---|---|
| Excellent conversational UX | **Core, upgraded** | §6 UI: evidence badges, confidence badge, category progress bar, priority ordering — no longer "nice to have," now required in Phase 3 |
| Persistent memory | **Core** | `profile.json`, unchanged from original plan |
| Conflict detection | **Core** | `flagConflict`, unchanged |
| Evidence for every answer | **Core, tightened** | §3.2 — every `updateItem` call requires ≥1 evidence entry, doc-sourced *or* a verbatim user quote (§5 rule 7) |
| Confidence scores | **New, cheap** | §3.2 `confidence` field, heuristic in `lib/confidence.ts` — no ML, a lookup table (§5a) |
| Intelligent follow-up questions | **Core** | unchanged, §5 rule 3 |
| Prioritizing unanswered questions | **New, cheap** | §3.2 `priority` field, sourced from the vendor questionnaire's own risk/category column if present, else a category heuristic (§5b) |
| User corrections and updates | **New, cheap** | `updateItem` always diffs into `changeLog` before overwriting (§3.2, §5 rule 8) — no new tool needed |
| Multiple employees/stakeholders | **New, moderate** | `setRespondent` tool + `respondent` tag on every evidence/changeLog entry; cross-stakeholder disagreement reuses `flagConflict` (§5c) |
| Automatic questionnaire generation | **Core (main deliverable) + optional stretch** | The completed questionnaire report (§7) *is* this. Generalizing ingestion to an arbitrary uploaded questionnaire file is a stretch add-on (§10), cut first if behind |
| Voice interaction | **Stretch, cheap if time allows** | Browser-native `SpeechRecognition` + `speechSynthesis` — zero dependencies, ladder rung 4 (native platform feature). Phase 6, optional, cut first if behind (§9) |

Net effect: 8 of 11 bonus items are schema/prompt additions to tools we're building
anyway — cheap. Multi-stakeholder is a real (small) addition. Voice and generalized
questionnaire upload are genuinely separable and explicitly sequenced *after* the
core deadline-critical path, so they never put the core demo at risk.

## 2. Stack (lazy-mode justified)

- **Next.js App Router** — one process gives us API route + chat UI, fastest path to
  a running demo. (Vercel default per session context.)
- **Vercel AI SDK v6** (`streamText` + `tool()`) — tool-calling loop + `useChat` on
  the frontend, no hand-rolled streaming/parsing.
- **Model access**: AI Gateway model string (`"anthropic/claude-sonnet-5"` or
  whatever key is available) — swap by string, no provider SDK wiring.
- **Retrieval: keyword/BM25-lite over chunked text, in memory.** No embeddings, no
  vector DB. → *skipped: semantic search, add if keyword recall is visibly bad in
  demo (upgrade: swap `search.ts` scoring fn for embeddings + cosine, same call
  signature).*
- **Persistence: a single JSON file** (`data/profile.json`) read/written with `fs`.
  → *skipped: SQLite/Postgres, add when this needs to survive a serverless deploy or
  multiple concurrent sessions.*
- **Doc parsing**: confirmed from actual zip contents (Phase 0 inventory done) — only
  three formats exist, so only three parsers get installed:
  - `mammoth` → `.docx` (13 policy docs, 2 assessment reports, 2 contracts, 2 more
    in infra zip) — the bulk of the corpus.
  - `xlsx` (npm package `xlsx`) → `.xlsx` (the vendor questionnaire itself, asset
    inventory, access review records).
  - `pdf-parse` → `.pdf` (W-9, network architecture diagram doc).
  - **2 `.png` diagrams** (network segmentation, admin access logging) are **not**
    parsed for text — no OCR, that's real scope creep for 3 hours. They're kept as
    referenceable files (filename + category) an evidence citation can point to,
    but they never enter the search index.

Nothing here needs a database, an auth layer, or a job queue. Resist adding them.

## 3. Data model

### 3.1 Chunk index (`data/index.json`, built once by ingest script)
```ts
type Chunk = {
  id: string;              // `${sourceFile}#${n}`
  sourceFile: string;      // e.g. "Company policies/Regodit_access_control_policy_v1.0.docx"
  category: string;        // zip folder name, numeric prefix stripped:
                            //   "Company policies" | "Security Assessment Reports"
                            //   | "Contracts_agreements" | "Infrastructure_internal info"
                            //   | "Sample_Vendor questionnaire"
  text: string;            // ~300-500 word chunk
};
```
Non-text files (`network-segmentation-diagram.png`, `admin-access-logging-diagram.png`)
are recorded in a separate `data/assets.json` (filename + category only) so they can
still be cited as evidence ("see network diagram") without being chunked/searched.

### 3.1a Question source — not hand-seeded
`1. Sample_Vendor questionnaire/...Clean.xlsx` **is the real questionnaire** (company
sent this exact format), not just another source doc. Phase 0/2 must parse its rows
into `data/questions.seed.json` (question text + category columns as given), rather
than inventing questions from the brief's 7 examples. The brief's 7 bullets are a
subset/illustration, not the actual list to fill in.

### 3.2 Questionnaire profile (`data/profile.json`, mutated during conversation)
```ts
type Status = "unknown" | "verified_from_docs" | "confirmed_by_user" | "conflicted";
type Priority = "high" | "medium" | "low";

type Evidence = {
  sourceFile?: string;    // doc-backed evidence
  snippet?: string;
  respondent?: string;    // user-backed evidence: who said it, e.g. "Priya (DevOps)"
  statement?: string;     // verbatim quote — satisfies "evidence for every answer"
                           // even when there's no source document
  ts: string;
};

type QuestionnaireItem = {
  id: string;               // "mfa_enabled"
  category: string;         // "Access Control"
  question: string;         // "Is MFA enabled?"
  priority: Priority;        // from questionnaire's own risk column, or category heuristic — §5b
  status: Status;
  answer?: string;          // normalized answer, e.g. "Yes, enforced org-wide via Okta"
  confidence: number;        // 0-100, heuristic not asked — §5a
  evidence: Evidence[];      // never empty once status leaves "unknown" — §5 rule 7
  conflicts?: Array<{
    description: string;
    parties: string[];       // e.g. ["doc:mfa-policy.docx", "user:Priya"] — doc-vs-doc
                               // AND user-vs-user both expressed the same way
    resolvedBy?: string; resolvedAt?: string;
  }>;
  changeLog?: Array<{         // every overwrite is audited, not silent — §5 rule 8
    prevAnswer?: string; prevStatus?: Status;
    changedAt: string; changedBy: string; reason?: string;
  }>;
  lastUpdated: string;      // ISO timestamp
};

type Profile = {
  items: QuestionnaireItem[];
  currentRespondent?: { name: string; role?: string };  // §5c, set via setRespondent
  history: Array<{ role: "user" | "assistant"; content: string; ts: string; respondent?: string }>;
};
```

The seed question list comes from the actual vendor questionnaire xlsx (§3.1a), not
hand-written — `data/questions.seed.json`, extendable without code changes.

## 4. Tools exposed to the agent

| Tool | Purpose | Side effect |
|---|---|---|
| `searchDocuments(query)` | keyword search over `index.json`, top-k chunks + source | none (read) |
| `getProfile()` | current state of all questionnaire items, sorted by priority | none (read) |
| `updateItem(id, patch)` | write answer/status/evidence/confidence for one item; auto-diffs prior state into `changeLog` if overwriting a resolved item | writes `profile.json` |
| `flagConflict(id, description, parties)` | records a conflict (doc-vs-doc, doc-vs-user, or user-vs-user), sets status=`conflicted` | writes `profile.json` |
| `setRespondent(name, role?)` | tags the current speaker for all following evidence/changeLog entries | writes `profile.json` |
| `generateReport()` | renders the full categorized questionnaire with confidence + evidence | none (read, formats) |

Tools are the *only* way the model is allowed to persist anything — this is what
makes "remember everything, don't re-ask" enforceable instead of aspirational.
`updateItem` rejects (returns an error to the model) any call that sets a non-unknown
status with an empty `evidence` array — this is what makes "evidence for every
answer" a code-enforced invariant, not a prompt suggestion.

## 5. Agent behavior (system prompt contract)

Non-negotiable rules encoded in the system prompt:
1. Before asking the user about any questionnaire item, call `searchDocuments`.
   Only answer directly (citing the sourceFile) if evidence is unambiguous.
2. If no evidence exists → ask the user. Never fabricate.
3. If the user's answer is vague (e.g. "yes" to a compound question like backup
   cadence/automation), ask one targeted follow-up before calling `updateItem`.
4. If two sources disagree, or a source disagrees with the user, call
   `flagConflict`, tell the user what's contradictory, and ask them to resolve it.
   Do not silently pick one.
5. Before asking about any item, call `getProfile` (or rely on the item list passed
   in context) — never ask about an item already `verified_from_docs` or
   `confirmed_by_user` unless the user is correcting it.
6. On request ("generate the report" / "I think we're done"), call
   `generateReport`.
7. Every `updateItem` call must include at least one evidence entry — a doc citation
   or the user's verbatim statement. No evidence, no status change.
8. If the user contradicts an already-resolved item ("actually that's outdated, we
   switched to..."), call `updateItem` with the new value — the tool itself records
   the old value + timestamp into `changeLog`. Never silently overwrite without the
   model being told this happened; acknowledge the correction back to the user.
9. Work high-`priority` unresolved items before low-priority ones (§5b) — when the
   user asks "what's left," report priority-sorted, not insertion-order.

### 5a. Confidence heuristic (`lib/confidence.ts` — one lookup function, no ML)
| Situation | Confidence |
|---|---|
| `verified_from_docs`, single unambiguous source | 90–100 |
| `verified_from_docs`, partial/ambiguous match | 60–75 |
| `confirmed_by_user`, no doc backing | 70 |
| `confirmed_by_user`, after resolving a conflict | 80 |
| `conflicted`, unresolved | 20–30 |
| `unknown` | 0 |

### 5b. Priority heuristic (confirmed against the real file)
No per-question risk/criticality column exists in the source xlsx (checked
`SecurityQuestionnaireMatrix` — that sheet computes vendor-level risk, not
per-question weight). Priority is assigned by the real 14 categories found in
the "Vendor Security Responses" sheet (66 questions total):
- **high**: Data Security, Vulnerability Management, Incident Response,
  Network & Endpoint Security, Asset Management, Risk Assessment, Physical Security
- **medium** (default): Governance, Third-Party Risk Management,
  Business Continuity & Disaster Recovery, Web Application Security,
  Secure Coding, Privacy
- **low**: Security Awareness & Training

### 5c. Multiple stakeholders
`setRespondent("Priya", "DevOps")` at the start of a segment tags every subsequent
`evidence.respondent` and `changeLog.changedBy`. If two respondents give conflicting
answers to the same item, that's a conflict like any other — `flagConflict` with
`parties: ["user:Priya", "user:Raj"]` — no separate mechanism needed, this is the
same conflict system doc-vs-doc uses, just with `user:<name>` as the party label.

## 6. Conversation flow (happy path)

```
User: "Let's fill out the questionnaire"
  → Agent iterates unresolved items, cheapest-first (docs-answerable before
    user-only), one question at a time.
  → For each: searchDocuments → evidence found? cite + updateItem(verified_from_docs)
                                : ask user → vague? follow-up → updateItem(confirmed_by_user)
  → Conflict mid-stream: flagConflict → ask user → updateItem with resolution note
  → All items resolved (or user says stop): generateReport
```

## 6a. UI requirements (upgraded from "nice to have" — now scored)

Minimal styling (default Tailwind, no custom design system — still lazy on visuals),
but these elements are required, not optional:
- Evidence badge on each answered message: 📄 doc-cited vs 🗣 user-reported.
- Confidence indicator (color: green ≥80, amber 50–79, red <50).
- A sidebar/progress bar: "X / Y answered" + a "Top unanswered (high priority)" list,
  so the user always sees what's left and what matters most.
- Current respondent shown if set (e.g. "Answering as: Priya, DevOps").

## 7. Report output

Markdown (rendered in UI, also downloadable as text) grouped by status, each item
carrying its confidence and evidence:

```md
## Verified from company information
- **Is MFA enabled?** Yes, enforced for Google Workspace and GitHub. (Confidence: 95%)
  _Source: Company policies/access_control_policy_v1.0.docx_

## Confirmed by user
- **How often are backups performed?** Daily, automated. (Confidence: 70%)
  _Reported by: Priya (DevOps)_

## Unknown / needs confirmation
- **Do you conduct background checks on employees?** (Priority: high)
```

## 8. Known limitations (state these to judges, don't build around them)

- Single-user, single-session, local JSON persistence — fine for a demo, not for
  concurrent users or a real deploy.
- Keyword search will miss paraphrased evidence; good enough if source docs use
  similar vocabulary to the questions.
- No auth — this is a local demo app, not a shipped product.

## 9. Stretch bonuses (only after core is demo-ready — cut first if behind)

- **Voice interaction**: browser-native `SpeechRecognition` (mic → fills chat input)
  + `speechSynthesis` (reads agent replies aloud). Zero npm dependencies — this is
  ladder rung 4 (native platform feature), not a service integration. A toggle
  button in the chat header, client-side only, ~40-60 lines. If `SpeechRecognition`
  isn't available in the demo browser, it degrades to text silently — no error UI.
- **Generalized questionnaire ingestion**: today `parse-questionnaire.ts` is hardcoded
  to the one vendor xlsx. Stretch = accept an uploaded doc/xlsx/pdf and reuse the
  same parser + an LLM pass to extract question-shaped rows into the same
  `questions.seed.json` shape. Only attempt this after Phase 4 report generation
  works end-to-end with the known file.

## 10. Post-hackathon upgrade path (do not build now)

- Swap keyword search → embeddings (pgvector/Upstash Vector) once retrieval quality
  needs it.
- Swap JSON file → Postgres (Neon via Vercel Marketplace) for multi-session state.
- Add per-company multi-tenancy and real auth (respondent tagging today is
  self-declared, not authenticated) if this becomes a real product.
