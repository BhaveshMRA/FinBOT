"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ReportPage() {
  const [markdown, setMarkdown] = useState("Loading…");

  const load = () => fetch("/api/report").then((r) => r.text()).then(setMarkdown);
  useEffect(() => {
    load();
  }, []);

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "security-questionnaire-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to chat</Link>
        <div className="flex gap-2">
          <button onClick={load} className="text-sm border border-neutral-300 rounded px-3 py-1.5">Refresh</button>
          <button onClick={download} className="text-sm bg-blue-600 text-white rounded px-3 py-1.5">Download .md</button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{markdown}</pre>
    </div>
  );
}
