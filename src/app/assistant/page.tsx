"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Bot, KeyRound, Newspaper, RefreshCw, Send, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, CardHeader, PageHeader, Segmented, Spinner, Textarea, useToast } from "@/components/ui";
import { Markdown } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/functions";
import { fmtDateTime } from "@/lib/format";
import type { Digest } from "@/lib/types";

export default function AssistantPage() {
  return <AppShell><Assistant /></AppShell>;
}

const PI_PROMPTS = [
  "Who hasn't posted a weekly update this week, and what were they working on last time?",
  "Which action items are overdue, per person?",
  "Which papers are with a journal right now and what are the next deadlines?",
  "Summarise what each student decided with me in the last month.",
];
const STUDENT_PROMPTS = [
  "What did I commit to in my last meeting?",
  "What's overdue on my list?",
  "Summarise my progress over the last month for my thesis committee.",
  "What was decided about my project stage-by-stage?",
];

interface Turn { q: string; a?: string; error?: string }

function Assistant() {
  const { isPi } = useAuth();
  const [tab, setTab] = useState<"ask" | "digests">("ask");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    callFn<{ configured: boolean }>("agent", { action: "status" }).then((r) => setConfigured(r.configured)).catch(() => setConfigured(false));
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ(""); setBusy(true);
    setTurns((t) => [...t, { q: question }]);
    try {
      const r = await callFn<{ answer: string }>("agent", { action: "ask", question });
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, a: r.answer } : x));
    } catch (e) {
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, error: (e as Error).message } : x));
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Lab assistant" subtitle={isPi ? "Ask anything about the lab's projects, meetings and updates. It only uses your lab's own records." : "Ask about your own projects, decisions and action items."}
        action={isPi ? <Segmented value={tab} onChange={setTab} options={[{ value: "ask", label: "Ask" }, { value: "digests", label: "Weekly digests" }]} /> : undefined} />

      {configured === false && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-warn/40 bg-warn-soft p-4 text-sm">
          <KeyRound className="h-4 w-4 text-warn" />
          <span>No AI key configured yet. {isPi ? <>Get a free key at <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> and add it as <code className="font-mono">GEMINI_API_KEY</code> in Supabase → Edge Functions → Secrets.</> : "Ask the PI to enable it."}</span>
        </Card>
      )}

      {tab === "digests" && isPi ? <Digests /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
          <Card className="flex min-h-[28rem] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {turns.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-muted">
                  <Bot className="h-8 w-8 text-faint" />
                  <p className="text-sm">Ask a question, or pick one on the right.</p>
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} className="space-y-2">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">{t.q}</div>
                  <div className={clsx("max-w-[95%] rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-4 py-3", t.error && "border-danger/30 bg-danger-soft")}>
                    {t.a ? <Markdown text={t.a} /> : t.error ? <p className="text-sm text-danger">{t.error}</p> : <p className="flex items-center gap-2 text-sm text-muted"><Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />Reading the lab&apos;s records…</p>}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="border-t border-line p-3">
              <div className="flex items-end gap-2">
                <Textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} placeholder="Ask about progress, decisions, blockers, deadlines…" className="min-h-11 flex-1" rows={1} />
                <Button onClick={() => ask(q)} loading={busy} disabled={!q.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
              </div>
              <p className="mt-1.5 text-[11px] text-faint">Enter to send · Shift+Enter for a new line · Answers come from your lab&apos;s records, not the internet.</p>
            </div>
          </Card>
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Try asking</p>
            {(isPi ? PI_PROMPTS : STUDENT_PROMPTS).map((p) => (
              <button key={p} onClick={() => ask(p)} disabled={busy} className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50">{p}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Digests() {
  const toast = useToast();
  const [rows, setRows] = useState<Digest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase().from("digests").select("*").order("created_at", { ascending: false }).limit(12);
    setRows((data ?? []) as Digest[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  const gen = async () => {
    setBusy(true);
    try { await callFn("agent", { action: "digest" }); toast("Digest ready.", "success"); load(); }
    catch (e) { toast((e as Error).message, "danger"); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 text-sm"><Newspaper className="h-4 w-4 text-accent" /><span>A &ldquo;state of the lab&rdquo; digest is generated automatically every Friday evening. You can also run it now.</span></div>
        <Button size="sm" onClick={gen} loading={busy}><RefreshCw className="h-3.5 w-3.5" />Generate now</Button>
      </Card>
      {rows === null ? <Spinner /> : rows.length === 0 ? <Card className="p-8 text-center text-sm text-muted">No digests yet.</Card> : rows.map((d, i) => (
        <Card key={d.id}>
          <CardHeader title={<span className="flex items-center gap-2">Digest · {fmtDateTime(d.created_at)} {i === 0 && <Badge tone="accent">Latest</Badge>}</span>} />
          <div className="px-5 pb-5"><Markdown text={d.content} /></div>
        </Card>
      ))}
    </div>
  );
}
