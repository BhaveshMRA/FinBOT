import type { Status } from "./types.ts";

// Implementation.md §5a - a lookup, not a model. Ambiguity within a bucket
// (e.g. "partial doc match" vs "single unambiguous source") is decided by the
// caller passing `strong: false` when a search result was a weak keyword match.
export function computeConfidence(status: Status, opts: { strong?: boolean; afterConflictResolution?: boolean } = {}): number {
  switch (status) {
    case "verified_from_docs":
      return opts.strong === false ? 65 : 95;
    case "confirmed_by_user":
      return opts.afterConflictResolution ? 80 : 70;
    case "conflicted":
      return 25;
    case "unknown":
    default:
      return 0;
  }
}
