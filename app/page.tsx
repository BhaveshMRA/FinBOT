"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { Profile, QuestionnaireItem } from "@/lib/types.ts";
import type { UIMessage } from "ai";
import { getSavedChats, saveChat, deleteChat, type SavedChat } from "@/lib/chatHistory.ts";

// Voice bonus (Implementation.md §9): browser-native STT, ElevenLabs TTS.
// Both degrade silently when unsupported/unconfigured - never blocks the core chat.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function useSpeechToText(onResult: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setSupported(true);
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, [onResult]);

  const toggle = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  return { supported, listening, toggle };
}

async function speak(text: string) {
  try {
    const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) return; // no key configured, or ElevenLabs error - degrade silently
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play().catch(() => {});
  } catch {
    // network error, autoplay block, etc. - voice is a bonus, never surface this
  }
}

function messageText(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ");
}

// ClassCast palette (see ClassCast-Lecture-Assistant/frontend/index.html):
// warm off-white background, white bordered panels, three-color status system.
const pill = {
  green: "bg-[#d4f4dd] text-[#1a5e2e]",
  amber: "bg-[#fff4d4] text-[#7a5d00]",
  red: "bg-[#f8d7d7] text-[#7a1a1a]",
  blue: "bg-[#e8efff] text-[#1a3e7e]",
  neutral: "bg-[#f0f0ee] text-[#555]",
};
const outlineButton = {
  blue: "border border-[#1a3e7e] bg-[#e8efff] text-[#1a3e7e]",
  red: "border border-[#7a1a1a] bg-[#f8d7d7] text-[#7a1a1a]",
  neutral: "border border-[#d9d9d6] bg-[#fafaf9] text-[#555]",
};

function confidencePill(confidence: number) {
  if (confidence >= 80) return pill.green;
  if (confidence >= 50) return pill.amber;
  return pill.red;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[#d9d9d6] pl-2 italic opacity-80 my-2">{children}</blockquote>,
  ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
  code: ({ children }) => <code className="bg-black/10 rounded px-1 text-[0.85em]">{children}</code>,
};

function Markdown({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap">
      <ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>
    </div>
  );
}

function documentUrl(sourceFile: string) {
  return `/api/document?sourceFile=${encodeURIComponent(sourceFile)}`;
}

function ToolPart({ type, output }: { type: string; output: unknown }) {
  const toolName = type.slice("tool-".length);
  const item = output as Partial<QuestionnaireItem> & { error?: string };

  if (item?.error) {
    return <div className={`text-xs rounded-lg px-2 py-1 my-1 ${pill.red}`}>⚠ {item.error}</div>;
  }

  if (toolName === "updateItem" && item?.status) {
    const lastEvidence = item.evidence?.[item.evidence.length - 1];
    const isDoc = Boolean(lastEvidence?.sourceFile);
    return (
      <div className={`text-xs rounded-lg px-2 py-1.5 my-1 ${confidencePill(item.confidence ?? 0)}`}>
        {isDoc ? "📄" : "🗣"} {item.answer ?? item.status} (confidence: {item.confidence}%)
        {lastEvidence?.sourceFile && (
          <div className="opacity-70">
            source:{" "}
            <a href={documentUrl(lastEvidence.sourceFile)} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-100">
              {lastEvidence.sourceFile}
            </a>
          </div>
        )}
        {lastEvidence?.respondent && <div className="opacity-70">reported by: {lastEvidence.respondent}</div>}
      </div>
    );
  }

  if (toolName === "flagConflict") {
    return <div className={`text-xs rounded-lg px-2 py-1 my-1 ${pill.red}`}>⚠ Conflict flagged: needs your input</div>;
  }

  if (toolName === "setRespondent" && item) {
    const p = output as Profile;
    return <div className={`text-xs rounded-lg px-2 py-1 my-1 ${pill.blue}`}>👤 Now answering as: {p.currentRespondent?.name}{p.currentRespondent?.role ? ` (${p.currentRespondent.role})` : ""}</div>;
  }

  if (toolName === "searchDocuments") {
    const results = output as Array<{ sourceFile: string }>;
    return <div className="text-xs text-[#999] my-1">🔍 searched documents ({Array.isArray(results) ? results.length : 0} hit{Array.isArray(results) && results.length === 1 ? "" : "s"})</div>;
  }

  return null;
}

function ListeningWaveform() {
  return (
    <div className="flex items-end justify-center gap-0.5 h-4 w-5" aria-label="Listening">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-0.5 bg-[#7a1a1a] rounded-full"
          style={{ animation: "wave-bar 0.9s ease-in-out infinite", animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { style: string; label: string }> = {
    ready: { style: pill.green, label: "Ready" },
    submitted: { style: pill.amber, label: "Thinking..." },
    streaming: { style: pill.amber, label: "Responding..." },
    error: { style: pill.red, label: "Error, try again" },
  };
  const { style, label } = map[status] ?? map.ready;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium ${style}`}>
      <span className="w-2 h-2 rounded-full bg-current" />
      {label}
    </div>
  );
}

function ProgressSidebar() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = () => fetch("/api/profile").then((r) => r.json()).then(setProfile);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const reset = () => {
    if (!confirm("Reset the demo? This clears all answers back to unknown.")) return;
    fetch("/api/profile", { method: "DELETE" }).then((r) => r.json()).then(setProfile);
  };

  if (!profile) return null;

  const resolved = profile.items.filter((i) => i.status === "verified_from_docs" || i.status === "confirmed_by_user").length;
  const total = profile.items.length;
  const topUnanswered = profile.items.filter((i) => i.status === "unknown" || i.status === "conflicted").slice(0, 6);
  const priorityPill = { high: pill.red, medium: pill.amber, low: pill.neutral };

  return (
    <aside className="w-72 shrink-0 flex flex-col gap-4">
      <div className="bg-white border border-[#e5e5e3] rounded-xl p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[13px] font-semibold text-[#555] uppercase tracking-wide">Progress</h2>
          <button onClick={reset} className="text-xs text-[#999] hover:text-[#7a1a1a]" title="Reset the demo to a fresh, unanswered state">
            Reset demo
          </button>
        </div>
        {profile.currentRespondent && (
          <div className="mb-3 text-xs text-[#1a3e7e]">
            Answering as <strong>{profile.currentRespondent.name}</strong>
            {profile.currentRespondent.role ? ` (${profile.currentRespondent.role})` : ""}
          </div>
        )}
        <div className="flex justify-between text-xs mb-1 text-[#555]">
          <span>{resolved} / {total} answered</span>
          <span>{Math.round((resolved / total) * 100)}%</span>
        </div>
        <div className="h-2 bg-[#f0f0ee] rounded-full overflow-hidden">
          <div className="h-full bg-[#1a5e2e]" style={{ width: `${(resolved / total) * 100}%` }} />
        </div>
      </div>
      <div className="bg-white border border-[#e5e5e3] rounded-xl p-5">
        <h2 className="text-[13px] font-semibold text-[#555] uppercase tracking-wide mb-3">Top unanswered (priority)</h2>
        <ul className="space-y-2">
          {topUnanswered.map((item) => (
            <li key={item.id} className="text-xs text-[#1c1c1c]">
              <span className={`inline-block px-1.5 py-0.5 rounded-full mr-1 ${priorityPill[item.priority]}`}>
                {item.priority}
              </span>
              {item.question.slice(0, 70)}{item.question.length > 70 ? "…" : ""}
              {item.status === "conflicted" && <span className="text-[#7a1a1a]"> ⚠ conflict</span>}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function HistorySidebar({
  open,
  onClose,
  chats,
  onLoad,
  onDelete,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  chats: SavedChat[];
  onLoad: (chat: SavedChat) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-[350px] bg-[#f5f5f4] shadow-xl z-50 flex flex-col transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-[#e5e5e3] bg-white flex justify-between items-center">
          <h2 className="text-base font-semibold m-0">Chat history</h2>
          <button onClick={onClose} className="text-[#888] text-xl hover:text-[#555]">✕</button>
        </div>
        <div className="p-4">
          <button onClick={onNewChat} className={`w-full text-sm font-semibold px-3 py-2 rounded-md ${outlineButton.blue}`}>
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {chats.length === 0 ? (
            <div className="text-sm text-[#999] text-center mt-5">No saved chats yet.</div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className="bg-white border border-[#e5e5e3] rounded-lg p-3 mb-3 cursor-pointer hover:border-[#1a3e7e]"
                onClick={() => onLoad(chat)}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="text-sm font-medium text-[#1c1c1c]">{chat.title}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat.id);
                    }}
                    className="text-[#999] hover:text-[#7a1a1a] text-sm"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs text-[#999] mt-1">{new Date(chat.savedAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default function Chat() {
  const { messages, sendMessage, status, setMessages } = useChat();
  const [input, setInput] = useState("");
  const [voiceOut, setVoiceOut] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const lastSpokenId = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyOpen) setSavedChats(getSavedChats());
  }, [historyOpen]);

  const handleSaveChat = () => {
    if (messages.length === 0) return;
    saveChat(messages as UIMessage[]);
    setSavedChats(getSavedChats());
  };

  const handleLoadChat = (chat: SavedChat) => {
    setMessages(chat.messages);
    setHistoryOpen(false);
  };

  const handleDeleteChat = (id: string) => {
    setSavedChats(deleteChat(id));
  };

  const handleNewChat = () => {
    setMessages([]);
    setHistoryOpen(false);
  };

  const { supported: micSupported, listening, toggle: toggleMic } = useSpeechToText((transcript) => {
    if (transcript.trim()) sendMessage({ text: transcript });
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Global shortcut: Cmd + Right Shift toggles the mic from anywhere on the page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.code === "ShiftRight" && !e.repeat) {
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleMic]);

  useEffect(() => {
    if (!voiceOut || status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.id === lastSpokenId.current) return;
    const text = messageText(last);
    if (text) {
      lastSpokenId.current = last.id;
      speak(text);
    }
  }, [status, voiceOut, messages]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex justify-between items-center mb-1">
          <h1 className="text-[22px] font-semibold m-0">FinBOT</h1>
          <div className="flex items-center gap-4">
            <label className="text-sm text-[#555] flex items-center gap-2">
              <input type="checkbox" className="w-4 h-4" checked={voiceOut} onChange={(e) => setVoiceOut(e.target.checked)} />
              🔊 voice replies
            </label>
            <Link href="/report" className={`text-sm font-semibold px-4 py-2 rounded-md ${outlineButton.blue}`}>
              View report
            </Link>
            <button
              onClick={() => setHistoryOpen(true)}
              className="text-2xl text-[#555] hover:text-[#1c1c1c]"
              title="Chat history"
            >
              ☰
            </button>
          </div>
        </div>
        <div className="text-[#666] text-sm mb-4">AI Security Analyst</div>
        <div className="mb-6 flex items-center gap-3">
          <StatusPill status={status} />
          <span className="text-xs text-[#999]">⌘+Return to send &middot; ⌘+Right Shift for mic</span>
        </div>

        <div className="flex gap-4 items-start">
          <div className="bg-white border border-[#e5e5e3] rounded-xl p-5 flex-1 flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
            <h2 className="text-[13px] font-semibold text-[#555] uppercase tracking-wide mb-3">Conversation</h2>
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="text-[#999] text-sm">Say hello, or ask about a control (e.g. &ldquo;Is MFA enabled?&rdquo;).</div>
              )}
              {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
                  <div
                    className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === "user" ? `${pill.blue} border border-[#c9d8ff]` : "bg-[#fafaf9] border border-[#efefec] text-[#1c1c1c]"
                    }`}
                  >
                    {message.parts.map((part, i) => {
                      if (part.type === "text") return <Markdown key={i} text={part.text} />;
                      if (part.type.startsWith("tool-") && "state" in part && part.state === "output-available") {
                        return <ToolPart key={i} type={part.type} output={part.output} />;
                      }
                      return null;
                    })}
                    {message.role === "assistant" && status === "ready" && (
                      <button
                        onClick={() => speak(messageText(message))}
                        className="block mt-1 text-xs text-[#999] hover:text-[#555]"
                        title="Speak this response"
                      >
                        🔊 speak
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {status === "submitted" && <div className="text-xs text-[#999]">thinking...</div>}
              <div ref={bottomRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim()) return;
                sendMessage({ text: input });
                setInput("");
              }}
              className="flex gap-2 mt-4"
            >
              <input
                className="flex-1 border border-[#d9d9d6] rounded-md px-3 py-2 text-sm bg-white"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (!input.trim()) return;
                    sendMessage({ text: input });
                    setInput("");
                  }
                }}
                placeholder="Let's fill out the questionnaire..."
              />
              {micSupported && (
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`text-sm px-3 py-2 rounded-md font-semibold flex items-center justify-center min-w-[44px] ${listening ? outlineButton.red : outlineButton.neutral}`}
                  title="Speak your answer (⌘+Right Shift)"
                >
                  {listening ? <ListeningWaveform /> : "🎤"}
                </button>
              )}
              <button
                type="submit"
                className={`text-sm px-4 py-2 rounded-md font-semibold disabled:opacity-50 ${outlineButton.blue}`}
                disabled={status !== "ready"}
              >
                Send
              </button>
            </form>
            <button
              onClick={handleSaveChat}
              disabled={messages.length === 0}
              className="self-start mt-2 text-xs text-[#999] hover:text-[#1a3e7e] disabled:opacity-40"
            >
              💾 Save this chat
            </button>
          </div>
          <ProgressSidebar />
        </div>
      </div>
      <HistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        chats={savedChats}
        onLoad={handleLoadChat}
        onDelete={handleDeleteChat}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
