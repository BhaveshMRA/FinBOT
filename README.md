# FinBOT — AI Security Analyst

A chatbot that fills out a customer security questionnaire by searching a company's
own documents first, and only asking a human for what the documents don't cover —
detecting contradictions along the way instead of guessing.

Built for the Regodit hackathon track "AI Security Analyst." See `Implementation.md`
for the full architecture/design rationale and `task-phases.md` for the build plan
and progress.

## Status: functional end-to-end (Phases 0-5 done, Phase 6 voice bonus done)

- 24 source documents parsed → 257 searchable chunks, 2 diagram assets
- 66 real questionnaire questions across 14 categories (parsed from the actual
  vendor questionnaire xlsx, not hand-written)
- A live chat agent that searches docs first, cites evidence, asks smart
  follow-ups instead of accepting vague answers, flags conflicts, tags multiple
  respondents, and never re-asks a resolved question
- A deterministic `/report` page (+ downloadable `.md`) grouping every question
  into Verified from company info / Confirmed by user / Conflicted / Unknown
- Voice: speak your answer (browser mic) and optionally hear replies aloud
  (ElevenLabs) — see "Voice (optional)" below
- `npx tsc --noEmit` and `npm run build` both verified clean

## Demo script

1. Open http://localhost:3000. Say: **"Hi, I'm Priya from DevOps. Is MFA enabled?"**
   → the sidebar tags "Answering as: Priya (DevOps)"; the agent searches docs,
   finds the Password & Secrets Policy, cites it, logs 95% confidence.
2. Ask something vague: **"Do we perform backups?"** → watch it search the SOC2
   report instead of guessing, then ask a pointed follow-up about whether the
   documented setup is still current.
3. Ask about something not in any doc (e.g. background checks) → it asks you
   directly rather than fabricating an answer.
4. Correct something you already answered → the agent updates it and the change
   is logged (not silently overwritten) - visible in `data/profile.json`'s
   `changeLog`.
5. Click **"View report"** → the full 66-question categorized report, each
   answered item showing confidence and its evidence source or respondent.
6. (if `ELEVENLABS_API_KEY` is set) Toggle **"🔊 voice replies"** and ask
   another question, or click **🎤** and speak your answer instead of typing.

## Folder layout

```
app/
  page.tsx               chat UI: messages, evidence/confidence badges, sidebar
  report/page.tsx        the generated questionnaire report view
  api/chat/route.ts      the agent: streamText + 5 tools, system prompt rules
  api/profile/route.ts   GET - current profile (used by the sidebar)
  api/report/route.ts    GET - the report as markdown
  api/speak/route.ts     POST {text} -> audio/mpeg via ElevenLabs (501 if no key set)
lib/
  types.ts                shared types: Chunk, Evidence, QuestionnaireItem, Profile
  search.ts               searchDocuments(query, k) - keyword search over index.json
  confidence.ts           computeConfidence(status, opts) - status -> 0-100 score
  profile.ts              getProfile/updateItem/flagConflict/setRespondent -
                           the only way anything gets persisted (data/profile.json)
  report.ts               buildReportMarkdown(profile) - deterministic report render
  system-prompt.ts        the 9 behavioral rules the agent follows
scripts/
  ingest.mjs               extracts + chunks the 24 source docs -> data/index.json
  parse-questionnaire.mjs  parses the real vendor xlsx -> data/questions.seed.json
  test-profile.ts          assert-based smoke test for lib/profile.ts + lib/search.ts
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
```

Add `.env.local` with `ANTHROPIC_API_KEY=<your key>` (gitignored, never committed),
then:

```bash
npm run dev
```

Open http://localhost:3000. To reset the demo to a fresh, unanswered state, delete
`data/profile.json` before starting the server (it's regenerated from
`questions.seed.json` on first read).

### Voice (optional)

Add `ELEVENLABS_API_KEY=<your key>` to `.env.local` to enable spoken replies (the
mic input works with no key needed — it's the browser's own `SpeechRecognition`).
No key configured → the voice toggle just does nothing silently; nothing breaks.

## Known limitations

- Single-user, single-session, local JSON persistence — fine for a demo, not for
  concurrent users or a real deploy.
- Keyword search will miss paraphrased evidence not sharing vocabulary with the
  source docs.
- No auth — respondent identity is self-declared (`setRespondent`), not verified.
- Report page renders raw markdown syntax rather than styled HTML — readable,
  not polished (no markdown-rendering dependency added, by design).

## Mandatory hackathon tooling

- **GIDE** — the IDE this project is being built in.
- **Block Convey PRISM** — agent observability/tracing, connected to
  `github.com/BhaveshMRA/FinBOT`. Live-tracing SDK integration is pending
  confirmation of what its "Live setup" step requires.
