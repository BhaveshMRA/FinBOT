# FinBOT — AI Security Analyst

A chatbot that fills out a customer security questionnaire by searching a company's
own documents first, and only asking a human for what the documents don't cover —
detecting contradictions along the way instead of guessing.

Built for the Regodit hackathon track "AI Security Analyst." See `Implementation.md`
for the full architecture/design rationale and `task-phases.md` for the build plan
and progress.

## Status

Phase 0 (scaffolding) in progress. Not yet functional — no chat route or ingestion
pipeline exists yet.

## Folder layout

```
app/                  Next.js App Router (UI + /api routes)
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

Run `npm run ingest` (added in Phase 1) to extract and index them into `data/`.

## Running locally

```bash
npm install
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
