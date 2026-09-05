import type { UIMessage } from "ai";

// Saved chat transcripts, client-side only (matches ClassCast's own Notebook
// pattern - localStorage, no backend). This is separate from data/profile.json,
// which is the actual persistent security-assessment memory (guideline 5);
// this is just a way to revisit or hand off a past conversation's transcript.
const STORAGE_KEY = "finbot_chat_history";

export type SavedChat = {
  id: string;
  title: string;
  savedAt: string;
  messages: UIMessage[];
};

export function getSavedChats(): SavedChat[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function titleFromMessages(messages: UIMessage[]): string {
  const firstUserText = messages
    .find((m) => m.role === "user")
    ?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text;
  if (!firstUserText) return `Chat ${new Date().toLocaleString()}`;
  return firstUserText.length > 50 ? firstUserText.slice(0, 50) + "…" : firstUserText;
}

export function saveChat(messages: UIMessage[]): SavedChat {
  const chats = getSavedChats();
  const entry: SavedChat = {
    id: crypto.randomUUID(),
    title: titleFromMessages(messages),
    savedAt: new Date().toISOString(),
    messages,
  };
  chats.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  return entry;
}

export function deleteChat(id: string): SavedChat[] {
  const chats = getSavedChats().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  return chats;
}
