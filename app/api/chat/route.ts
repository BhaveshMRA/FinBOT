import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/search.ts";
import { getProfile, updateItem, flagConflict, setRespondent, appendHistory } from "@/lib/profile.ts";
import { SYSTEM_PROMPT } from "@/lib/system-prompt.ts";
import { chatModel } from "@/lib/model.ts";

export const maxDuration = 300;

const evidenceSchema = z.object({
  sourceFile: z.string().optional(),
  snippet: z.string().optional(),
  respondent: z.string().optional(),
  statement: z.string().optional(),
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    const text = lastUserMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
    if (text) appendHistory("user", text);
  }

  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    tools: {
      searchDocuments: tool({
        description:
          "Search company documents (policies, assessment reports, contracts, infra docs) for evidence relevant to a questionnaire question. Always call this before asking the user.",
        inputSchema: z.object({ query: z.string().describe("keywords describing what to look for") }),
        execute: async ({ query }) => searchDocuments(query, 5),
      }),
      getProfile: tool({
        description:
          "Get the current state of all 66 questionnaire items, sorted unresolved-first then by priority.",
        inputSchema: z.object({}),
        execute: async () => getProfile(),
      }),
      updateItem: tool({
        description:
          "Persist an answer for one questionnaire item. Requires at least one evidence entry unless status is 'unknown' - the call is rejected otherwise. Automatically logs the prior value when overwriting an already-resolved item.",
        inputSchema: z.object({
          id: z.string(),
          status: z.enum(["unknown", "verified_from_docs", "confirmed_by_user", "conflicted"]).optional(),
          answer: z.string().optional(),
          evidence: z.array(evidenceSchema).optional(),
          strong: z.boolean().optional().describe("true if the doc evidence was an unambiguous single-source match"),
          afterConflictResolution: z.boolean().optional(),
          reason: z.string().optional(),
        }),
        execute: async ({ id, evidence, ...rest }) => {
          const stampedEvidence = evidence?.map((e) => ({ ...e, ts: new Date().toISOString() }));
          try {
            return updateItem(id, { ...rest, evidence: stampedEvidence });
          } catch (err) {
            // never let a hallucinated id or other bad input crash the stream -
            // surface it to the model as a tool result so it can recover (e.g.
            // call getProfile again to find the right id).
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
      flagConflict: tool({
        description:
          "Record a conflict between sources (doc-vs-doc, doc-vs-user, or user-vs-user) for one questionnaire item. Sets its status to conflicted.",
        inputSchema: z.object({
          id: z.string(),
          description: z.string(),
          parties: z.array(z.string()).describe('e.g. ["doc:mfa-policy.docx", "user:Priya"]'),
        }),
        execute: async ({ id, description, parties }) => {
          try {
            return flagConflict(id, description, parties);
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      }),
      setRespondent: tool({
        description: "Tag the current speaker so their answers/evidence are attributed to them by name.",
        inputSchema: z.object({ name: z.string(), role: z.string().optional() }),
        execute: async ({ name, role }) => setRespondent(name, role),
      }),
    },
    onFinish: ({ text }) => {
      if (text) appendHistory("assistant", text);
    },
  });

  return result.toUIMessageStreamResponse();
}
