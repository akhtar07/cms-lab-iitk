"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Check, Circle, Sparkles, X } from "lucide-react";
import { Avatar, Badge, Select } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_ORDER, STALE_DAYS, isLiveStage, type ActionItem, type Project, type ProjectStage } from "@/lib/types";

/* ------------------------------------------------------- Stage pipeline */
export function StagePill({ stage }: { stage: ProjectStage }) {
  const tone = stage === "published" || stage === "accepted" ? "success" : stage === "shelved" ? "neutral"
    : ["submitted", "under_review", "revision"].includes(stage) ? "warn" : "accent";
  return <Badge tone={tone}>{STAGE_LABEL[stage]}</Badge>;
}

/** Horizontal stepper; click a stage to move the project (if editable). */
export function StageStepper({ stage, onChange }: { stage: ProjectStage; onChange?: (s: ProjectStage) => void }) {
  const idx = STAGE_ORDER.indexOf(stage);
  const steps = STAGE_ORDER.filter((s) => s !== "shelved");
  return (
    <ol className="scroll-thin flex items-center gap-1 overflow-x-auto py-1">
      {steps.map((s, i) => {
        const done = i < idx && stage !== "shelved";
        const current = s === stage;
        return (
          <li key={s} className="flex items-center">
            <button type="button" disabled={!onChange} onClick={() => onChange?.(s)} title={STAGE_LABEL[s]}
              className={clsx("flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                current ? "border-accent bg-accent text-white" : done ? "border-transparent bg-accent-soft text-accent-text" : "border-line bg-surface text-muted",
                onChange && !current && "hover:border-accent")}>
              {done ? <Check className="h-3 w-3" /> : <Circle className={clsx("h-2 w-2", current ? "fill-current" : "")} />}
              {STAGE_LABEL[s]}
            </button>
            {i < steps.length - 1 && <span className={clsx("mx-0.5 h-px w-3", done ? "bg-accent" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
export const isStale = (p: Project) => isLiveStage(p.stage) && daysSince(p.last_activity) >= STALE_DAYS;

/* -------------------------------------------------------- Project card */
export function ProjectCard({ p }: { p: Project }) {
  const stale = isStale(p);
  const members = p.members ?? [];
  return (
    <Link href={`/projects/view/?id=${p.id}`} className={clsx("block rounded-xl border bg-surface p-4 shadow-card transition-colors hover:border-accent", stale ? "border-warn/40" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {p.short_code && <p className="text-[11px] font-mono uppercase tracking-wide text-faint">{p.short_code}</p>}
          <p className="font-medium leading-snug">{p.title}</p>
        </div>
        <StagePill stage={p.stage} />
      </div>
      {p.summary && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.summary}</p>}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {members.slice(0, 4).map((m) => <span key={m.profile_id} className="rounded-full ring-2 ring-surface"><Avatar src={m.profile?.avatar_url} name={m.profile?.full_name} email={m.profile?.email} size={22} /></span>)}
          {members.length > 4 && <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-surface-2 text-[10px] text-muted ring-2 ring-surface">+{members.length - 4}</span>}
        </div>
        <span className={clsx("text-[11px]", stale ? "font-medium text-warn" : "text-faint")}>
          {stale ? `Quiet for ${daysSince(p.last_activity)}d` : `Active ${daysSince(p.last_activity) === 0 ? "today" : daysSince(p.last_activity) + "d ago"}`}
        </span>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------- Action item */
export function ActionItemRow({ item, onChanged, showOwner, showProject }: { item: ActionItem; onChanged?: () => void; showOwner?: boolean; showProject?: boolean }) {
  const [busy, setBusy] = useState(false);
  const overdue = item.status === "open" && item.due_on && new Date(item.due_on) < new Date(new Date().toDateString());
  const set = async (status: ActionItem["status"]) => {
    setBusy(true);
    await supabase().from("action_items").update({ status, done_at: status === "done" ? new Date().toISOString() : null }).eq("id", item.id);
    setBusy(false); onChanged?.();
  };
  return (
    <div className={clsx("group flex items-start gap-3 py-2", item.status !== "open" && "opacity-60")}>
      <button type="button" disabled={busy} onClick={() => set(item.status === "done" ? "open" : "done")} aria-label="Toggle done"
        className={clsx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors", item.status === "done" ? "border-accent bg-accent text-white" : "border-line-strong hover:border-accent")}>
        {item.status === "done" && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={clsx("text-sm leading-snug", item.status === "done" && "line-through", item.status === "dropped" && "line-through text-faint")}>{item.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          {showOwner && item.owner && <span className="flex items-center gap-1"><Avatar src={item.owner.avatar_url} name={item.owner.full_name} email={item.owner.email} size={14} />{item.owner.full_name ?? item.owner.email}</span>}
          {showProject && item.project && <span className="text-accent-text">{item.project.short_code ?? item.project.title}</span>}
          {item.due_on && <span className={clsx(overdue && "font-medium text-danger")}>{overdue ? "Overdue · " : "Due "}{fmtDate(item.due_on + "T12:00:00")}</span>}
          {item.meeting_id && <span className="flex items-center gap-0.5 text-faint"><Sparkles className="h-3 w-3" />from meeting</span>}
        </div>
      </div>
      {item.status === "open" && (
        <button type="button" onClick={() => set("dropped")} title="Drop this item" className="rounded p-1 text-faint opacity-0 hover:bg-surface-2 hover:text-text group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );
}

/* --------------------------------------------------- Project selector */
export function ProjectSelect({ projects, value, onChange, allowNone = true }: { projects: Pick<Project, "id" | "title" | "short_code">[]; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">— General / no project —</option>}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.short_code ? `${p.short_code} · ` : ""}{p.title}</option>)}
    </Select>
  );
}

/* ------------------------------------------------ Minimal Markdown view */
/** Renders the subset of Markdown the agent produces: headings, bullets, bold, paragraphs. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="my-1.5 list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  lines.forEach((raw) => {
    const l = raw.trimEnd();
    const m = /^(\s*)[-*•]\s+(.*)/.exec(l);
    if (m) { list.push(m[2]); return; }
    flush();
    if (!l.trim()) return;
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) { blocks.push(<p key={blocks.length} className={clsx("mt-3 font-semibold", h[1].length <= 2 ? "text-[15px]" : "text-sm")}>{inline(h[2])}</p>); return; }
    const n = /^\s*(\d+)[.)]\s+(.*)/.exec(l);
    if (n) { blocks.push(<p key={blocks.length} className="flex gap-2"><span className="text-muted">{n[1]}.</span><span>{inline(n[2])}</span></p>); return; }
    blocks.push(<p key={blocks.length} className="my-1">{inline(l)}</p>);
  });
  flush();
  return <div className={clsx("text-sm leading-relaxed", className)}>{blocks}</div>;
}
function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[12px]">{p.slice(1, -1)}</code> : p);
}
