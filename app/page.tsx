"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Profile, QuestionnaireItem } from "@/lib/types.ts";

function confidenceColor(confidence: number) {
  if (confidence >= 80) return "bg-green-100 text-green-800 border-green-300";
  if (confidence >= 50) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function ToolPart({ type, output }: { type: string; output: unknown }) {
  const toolName = type.slice("tool-".length);
  const item = output as Partial<QuestionnaireItem> & { error?: string };

  if (item?.error) {
    return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 my-1">⚠ {item.error}</div>;
  }

  if (toolName === "updateItem" && item?.status) {
    const lastEvidence = item.evidence?.[item.evidence.length - 1];
    const isDoc = Boolean(lastEvidence?.sourceFile);
    return (
      <div className={`text-xs border rounded px-2 py-1 my-1 ${confidenceColor(item.confidence ?? 0)}`}>
        {isDoc ? "📄" : "🗣"} {item.answer ?? item.status} — confidence {item.confidence}%
        {lastEvidence?.sourceFile && <div className="opacity-70">source: {lastEvidence.sourceFile}</div>}
        {lastEvidence?.respondent && <div className="opacity-70">reported by: {lastEvidence.respondent}</div>}
      </div>
    );
  }

  if (toolName === "flagConflict") {
    return <div className="text-xs bg-red-50 text-red-800 border border-red-300 rounded px-2 py-1 my-1">⚠ Conflict flagged — needs your input</div>;
  }

  if (toolName === "setRespondent" && item) {
    const p = output as Profile;
    return <div className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-1 my-1">👤 Now answering as: {p.currentRespondent?.name}{p.currentRespondent?.role ? ` (${p.currentRespondent.role})` : ""}</div>;
  }

  if (toolName === "searchDocuments") {
    const results = output as Array<{ sourceFile: string }>;
    return <div className="text-xs text-neutral-500 my-1">🔍 searched documents ({Array.isArray(results) ? results.length : 0} hit{Array.isArray(results) && results.length === 1 ? "" : "s"})</div>;
  }

  return null;
}

function ProgressSidebar() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/profile").then((r) => r.json()).then(setProfile);
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!profile) return null;

  const resolved = profile.items.filter((i) => i.status === "verified_from_docs" || i.status === "confirmed_by_user").length;
  const total = profile.items.length;
  const topUnanswered = profile.items.filter((i) => i.status === "unknown" || i.status === "conflicted").slice(0, 6);

  return (
    <aside className="w-72 shrink-0 border-l border-neutral-200 p-4 text-sm overflow-y-auto">
      {profile.currentRespondent && (
        <div className="mb-3 text-xs text-blue-700">
          Answering as: <strong>{profile.currentRespondent.name}</strong>
          {profile.currentRespondent.role ? ` (${profile.currentRespondent.role})` : ""}
        </div>
      )}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span>{resolved} / {total} answered</span>
          <span>{Math.round((resolved / total) * 100)}%</span>
        </div>
        <div className="h-2 bg-neutral-200 rounded overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: `${(resolved / total) * 100}%` }} />
        </div>
      </div>
      <div>
        <div className="font-medium text-xs uppercase tracking-wide text-neutral-500 mb-2">Top unanswered (priority)</div>
        <ul className="space-y-2">
          {topUnanswered.map((item) => (
            <li key={item.id} className="text-xs">
              <span className={`inline-block px-1.5 py-0.5 rounded mr-1 ${item.priority === "high" ? "bg-red-100 text-red-700" : item.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>
                {item.priority}
              </span>
              {item.question.slice(0, 70)}{item.question.length > 70 ? "…" : ""}
              {item.status === "conflicted" && <span className="text-red-600"> ⚠ conflict</span>}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  return (
    <div className="flex h-screen">
      <div className="flex flex-col flex-1 max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">FinBOT — AI Security Analyst</h1>
          <Link href="/report" className="text-sm text-blue-600 hover:underline">View report →</Link>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.role === "user" ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-900"}`}>
                {message.parts.map((part, i) => {
                  if (part.type === "text") return <span key={i} className="whitespace-pre-wrap">{part.text}</span>;
                  if (part.type.startsWith("tool-") && "state" in part && part.state === "output-available") {
                    return <ToolPart key={i} type={part.type} output={part.output} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
          {status === "submitted" && <div className="text-xs text-neutral-400">thinking…</div>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            sendMessage({ text: input });
            setInput("");
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 border border-neutral-300 rounded px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Let's fill out the questionnaire..."
          />
          <button type="submit" className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50" disabled={status !== "ready"}>
            Send
          </button>
        </form>
      </div>
      <ProgressSidebar />
    </div>
  );
}
