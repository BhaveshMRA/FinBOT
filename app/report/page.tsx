"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const outlineButton = {
  blue: "border border-[#1a3e7e] bg-[#e8efff] text-[#1a3e7e]",
  neutral: "border border-[#d9d9d6] bg-[#fafaf9] text-[#555]",
};

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-xl font-semibold mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[13px] font-semibold text-[#555] uppercase tracking-wide mt-6 mb-2">{children}</h2>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-[#666]">{children}</em>,
  ul: ({ children }) => <ul className="space-y-3 mb-2">{children}</ul>,
  li: ({ children }) => <li className="border-b border-[#efefec] pb-2 last:border-0">{children}</li>,
};

export default function ReportPage() {
  const [markdown, setMarkdown] = useState("Loading...");

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
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-sm text-[#1a3e7e] hover:underline">← Back to chat</Link>
          <div className="flex gap-2">
            <button onClick={load} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${outlineButton.neutral}`}>Refresh</button>
            <button onClick={download} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${outlineButton.blue}`}>Download .md</button>
          </div>
        </div>
        <div className="bg-white border border-[#e5e5e3] rounded-xl p-6 text-sm leading-relaxed">
          <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
