export type Status = "unknown" | "verified_from_docs" | "confirmed_by_user" | "conflicted";
export type Priority = "high" | "medium" | "low";

export type Chunk = {
  id: string;
  sourceFile: string;
  category: string;
  text: string;
};

export type Asset = {
  sourceFile: string;
  category: string;
};

export type Evidence = {
  sourceFile?: string;
  snippet?: string;
  respondent?: string;
  statement?: string;
  ts: string;
};

export type Conflict = {
  description: string;
  parties: string[];
  resolvedBy?: string;
  resolvedAt?: string;
};

export type ChangeLogEntry = {
  prevAnswer?: string;
  prevStatus?: Status;
  changedAt: string;
  changedBy: string;
  reason?: string;
};

export type QuestionnaireItem = {
  id: string;
  category: string;
  question: string;
  priority: Priority;
  status: Status;
  answer?: string;
  confidence: number;
  evidence: Evidence[];
  conflicts?: Conflict[];
  changeLog?: ChangeLogEntry[];
  lastUpdated: string | null;
};

export type Profile = {
  items: QuestionnaireItem[];
  currentRespondent?: { name: string; role?: string };
  history: Array<{ role: "user" | "assistant"; content: string; ts: string; respondent?: string }>;
};
