# FinBOT: AI Security Analyst

An AI chatbot that fills out a vendor security questionnaire by talking to a
company employee and interrogating the company's own documents, instead of
making someone manually hunt through policies, reports, and contracts to
answer the same 60+ questions every time a customer sends a questionnaire.

## Problem Statement

When a startup sells to an enterprise, the customer sends a security
questionnaire: Is MFA enabled? Where is customer data stored? Do you encrypt
data at rest? Who has access to production? The answers exist, but they're
scattered across policy documents, audit reports, contracts, and people's
heads, they're incomplete, and sometimes they contradict each other. Filling
the questionnaire out by hand is slow, error-prone, and nobody wants to do it
before a deal deadline.

## Our Solution

FinBOT is a conversational agent that:
1. **Searches the company's own documents first** for every question, and only
   asks a human for what the documents don't cover.
2. **Never guesses.** If nothing is documented, it asks, and remembers the
   answer for next time.
3. **Pushes back on vague answers** with targeted follow-ups instead of
   accepting a one-word "yes."
4. **Catches contradictions** (a policy says one thing, a person says another)
   and asks for clarification instead of silently picking a side.
5. **Remembers everything** in a persistent profile, so it never re-asks a
   resolved question and any correction is logged, not silently overwritten.
6. **Generates the finished questionnaire**, clearly split into what's verified
   from company documents, what's confirmed by a human, and what's still
   unknown, each with a confidence score and a clickable source.

## Key Features

| Feature | What it does |
|---|---|
| Search before asking | Every question triggers a document search first; only unanswerable ones go to a human |
| Evidence for every answer | Every answer carries a clickable link to the exact source document, or the respondent's own quote |
| Confidence scores | Each answer gets a 0-100% confidence score based on how it was sourced |
| Smart follow-ups | Vague or compound answers get a targeted follow-up instead of being accepted at face value |
| Conflict detection | Doc-vs-doc, doc-vs-user, or user-vs-user disagreements are flagged and resolved explicitly, never guessed away |
| Persistent memory | A profile survives across the whole conversation (and across sessions) - no re-asking, and corrections are audit-logged |
| Priority-driven | Unanswered questions are worked high-priority-first, and the sidebar always shows what matters most |
| Multi-stakeholder support | Different people can answer different sections; who-said-what is tracked and cross-checked |
| Auto-generated report | One click produces the full categorized questionnaire, downloadable as Markdown |
| Voice interaction | Speak your answers (browser mic) and optionally hear replies read aloud (ElevenLabs) |

## Tech Stack

- **Next.js 16 (App Router) + React 19** - single app for both the UI and the API
- **Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`)** - the agent's
  tool-calling loop (`streamText`) and the chat UI (`useChat`)
- **Claude Sonnet 5** as the reasoning model
- **`mammoth` / `xlsx` / `pdf-parse`** - extract text from the real source
  documents (`.docx`, `.xlsx`, `.pdf`)
- **`react-markdown`** - renders the agent's formatted responses (bold, quotes,
  lists) instead of showing raw markdown syntax
- **ElevenLabs API** - text-to-speech for spoken replies; the browser's native
  `SpeechRecognition` handles speech-to-text (no extra service needed)
- **Plain JSON files** as the datastore (`data/index.json` for search,
  `data/profile.json` for the live security profile) - deliberately simple for
  a single-session demo; see Implementation.md for the production upgrade path
- No vector DB, no embeddings: retrieval is keyword/term-overlap search, which
  is enough for policy documents that share vocabulary with the questions
- **Block Convey PRISM** (zero-code LLM proxy) - every model call is traced
  for observability; see "Hackathon Sponsor Tooling" below

## How It Works

```
5 source zips (real company docs)
        |
        v
scripts/ingest.mjs  --------->  data/index.json   (257 searchable text chunks)
scripts/parse-questionnaire.mjs -> data/questions.seed.json  (66 real questions, 14 categories)
        |
        v
data/profile.json  <-- the persistent "memory": one entry per question,
        |               with status, answer, confidence, evidence, and a
        |               change log for corrections
        v
Chat UI  <-->  /api/chat (agent loop)  <-->  5 tools:
                 |                            searchDocuments
                 | system prompt encodes      getProfile
                 | 9 behavioral rules:        updateItem   (rejects a save with no evidence)
                 | search-first, no           flagConflict
                 | guessing, follow-ups,      setRespondent
                 | conflicts, memory,
                 | priority ordering
                 v
        /report page  -->  deterministic categorized questionnaire
                            (code-rendered from profile.json, not an LLM
                            summary, so nothing gets dropped or hallucinated)
```

The agent can only persist anything by calling a tool, and `updateItem` itself
refuses to save a non-trivial answer with zero evidence attached. That's what
makes "show your evidence" and "never guess" enforced behavior rather than a
prompt suggestion the model could ignore.

## How to Run / Use It

```bash
npm install
npm run ingest              # extract + chunk the 5 source documents -> data/
npm run parse-questionnaire # parse the real vendor questionnaire -> data/questions.seed.json
npm run test:profile        # sanity check (evidence enforcement, conflict flagging, search)
```

Add a `.env.local` file:
```
ANTHROPIC_API_KEY=<your key>
ELEVENLABS_API_KEY=<optional, enables spoken replies>
PRISMTRACE_API_KEY=<optional, routes model calls through Block Convey PRISM for observability>
```

Then:
```bash
npm run dev
```

Open http://localhost:3000 and talk to it, for example:
- *"Is MFA enabled?"* - it searches, finds the policy, cites it.
- *"Do we perform backups?"* then answer vaguely - it pushes for specifics.
- *"I'm Priya from DevOps"* - tags who's answering.
- Click **View report** any time to see the categorized questionnaire so far.

To reset to a clean, fully-unanswered state, delete `data/profile.json` (it
regenerates from `questions.seed.json` on the next request).

## Project Documents

- `Implementation.md` - full architecture, data model, and design rationale
- `task-phases.md` - the phased build log against the hackathon deadline

## Known Limitations

- Single-session, local JSON persistence: fine for this demo, not for
  concurrent users or a production deploy (upgrade path: Postgres/Neon).
- Keyword search misses evidence that's paraphrased far from the question's
  own wording (upgrade path: embeddings-based retrieval).
- Respondent identity is self-declared (`setRespondent`), not authenticated.

## Hackathon Sponsor Tooling

- **GIDE** (mandatory) - the IDE this project was built in.
- **Block Convey PRISM** (mandatory) - live agent observability. PRISM's
  official SDK is Python-only (LangChain/LangGraph-oriented), so instead we
  use its zero-code LLM proxy: `lib/model.ts` points the Anthropic client at
  PRISM's proxy URL with an `X-PRISMtrace-Key` header, so every real model
  call is traced without adding a Python dependency to a Node/TypeScript app.
  PRISM's proxy currently 500s on streaming requests, worked around with the
  AI SDK's `simulateStreamingMiddleware` (forces a non-streaming call to the
  proxy, which works, while still streaming the response to the browser).
  Verified live: real requests appear in PRISM's Traces dashboard with
  correct model, latency, and token counts. Falls back to calling Anthropic
  directly if `PRISMTRACE_API_KEY` isn't set.
- **Prelint** (optional) - product-decision review on every pull request.
  Connected to `github.com/BhaveshMRA/FinBOT` with automatic reviews enabled.
  Verified live on PR #1 ("Add a Reset demo button"): Spec Review returned
  "LGTM," and the Decision Review flagged a real tradeoff (the reset button
  destroys audit-trail data with no undo) and correctly concluded it's
  acceptable for a demo tool, a genuine catch, not a rubber stamp.
- **ElevenLabs** (optional) - text-to-speech for the voice bonus; see
  "Voice interaction" in Key Features and `app/api/speak/route.ts`.
- **Tavily** (optional) - not used. FinBOT's whole premise is grounding
  answers in the company's own internal documents rather than the public
  web, so a web-search tool doesn't fit the core product without diluting
  the "search your own docs first" guarantee.
