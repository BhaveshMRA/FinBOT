import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel, simulateStreamingMiddleware } from "ai";

// Routes model calls through Block Convey PRISM's zero-code LLM proxy so the
// hackathon's mandatory observability tool sees every call, without adding a
// Python-only SDK to a Node/TypeScript app. Degrades to calling Anthropic
// directly if PRISMTRACE_API_KEY isn't set (e.g. a fresh clone), so the app
// still works without it.
//
// ponytail: PRISM's proxy 500s on `stream: true` (confirmed by curling it
// directly - non-streaming works, streaming doesn't). Rather than wait on a
// fix from Block Convey, `simulateStreamingMiddleware` forces the underlying
// HTTP call to be non-streaming (which PRISM's proxy accepts) while still
// exposing a normal stream to streamText/useChat - the UI is unaffected.
const prismKey = process.env.PRISMTRACE_API_KEY;

const anthropicProvider = createAnthropic(
  prismKey
    ? {
        baseURL: "https://prism-api-prod.up.railway.app/proxy/anthropic/v1",
        headers: { "X-PRISMtrace-Key": prismKey },
      }
    : {}
);

const baseModel = anthropicProvider("claude-sonnet-5");

export const chatModel = prismKey
  ? wrapLanguageModel({ model: baseModel, middleware: simulateStreamingMiddleware() })
  : baseModel;
