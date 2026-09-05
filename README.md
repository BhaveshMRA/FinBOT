# FinBOT — AI Security Analyst

A chatbot that fills out a customer security questionnaire by searching a company's
own documents first, and only asking a human for what the documents don't cover —
detecting contradictions along the way instead of guessing.

Built for the Regodit hackathon track "AI Security Analyst." See `Implementation.md`
for the full architecture/design rationale and `task-phases.md` for the build plan
and progress.

## Status

Phases 0-2 done: ingestion, questionnaire parsing, search, and the profile store
all work and are tested. **No chat route or UI yet (Phase 3)** — the agent doesn't
exist as a conversation yet, only its building blocks do.

- 24 source documents parsed → 257 searchable chunks, 2 diagram assets
- 66 real questionnaire questions parsed across 14 categories (from the actual
  vendor questionnaire xlsx, not hand-written)
- `data/profile.json` — the persistent security profile, evidence-enforced and
  correction-audited (see `lib/profile.ts`)

## Folder layout

```
app/                  Next.js App Router (UI + /api routes)
lib/
  types.ts              shared types: Chunk, Evidence, QuestionnaireItem, Profile
  search.ts             searchDocuments(query, k) - keyword search over index.json
  confidence.ts         computeConfidence(status, opts) - status -> 0-100 score
  profile.ts            getProfile/updateItem/flagConflict/setRespondent -
                         the only way anything gets persisted (data/profile.json)
scripts/
  ingest.mjs             extracts + chunks the 24 source docs -> data/index.json
  parse-questionnaire.mjs  parses the real vendor xlsx -> data/questions.seed.json
  test-profile.ts         assert-based smoke test for lib/profile.ts + lib/search.ts
data/                 generated at ingest time — gitignored, not checked in:
  raw/                  extracted source documents (from the 5 zips below)
  index.json            chunked, searchable text extracted from raw/
  assets.json           non-text files (diagrams) kept as citable references
  questions.seed.json    questionnaire questions parsed from the vendor xlsx
  profile.json           the live, persistent security profile (the "memory")
*.zip                 source documents as provided (gitignored — see below)
Implementation.md     architecture & design decisions
task-phases.md        phased build plan with a hackathon deadline clock
```

### Source documents (not committed — see `.gitignore`)

Five zips sit at the project root, provided by the challenge:
1. Sample vendor questionnaire (`.xlsx`) — the actual question list to fill in
2. Company policies (13 `.docx`)
3. Security assessment reports (VAPT, SOC2 Type II — `.docx`)
4. Contracts & agreements (`.docx`)
5. Infrastructure/internal info (`.xlsx`, `.pdf`, `.docx`, 2 diagram `.png`s)

## Running locally

```bash
npm install
npm run ingest              # extracts + chunks the 5 source zips -> data/
npm run parse-questionnaire # parses the real vendor xlsx -> data/questions.seed.json
npm run test:profile        # sanity-checks lib/profile.ts + lib/search.ts
npm run dev
```

Open http://localhost:3000. A model API key (Anthropic/OpenAI/AI Gateway) will be
required in `.env.local` once the chat route is wired up in Phase 3 — none is
configured yet.

## Mandatory hackathon tooling

- **GIDE** — the IDE this project is being built in.
- **Block Convey PRISM** — agent observability/tracing, connected to
  `github.com/BhaveshMRA/FinBOT`. Live-tracing SDK integration is pending
  confirmation of what its "Live setup" step requires.
