"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, UserCheck, CalendarDays, Users, Link2, ListTodo, ClipboardList, FolderKanban, AlertTriangle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MeetingCard } from "@/components/MeetingCard";
import { Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ActionItemRow, daysSince, isStale } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { labParts, labStartOfWeek } from "@/lib/format";
import { STAGE_LABEL, type ActionItem, type Meeting, type Project } from "@/lib/types";

export default function DashboardPage() {
  return <AppShell><Dashboard /></AppShell>;
}

const MEETING_SELECT = "*, requester:profiles!meetings_requester_id_fkey(full_name, email, avatar_url, role), project:projects(id, title, short_code)";

function weekKey(d: Date) { const p = labParts(labStartOfWeek(d)); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }

function Dashboard() {
  const { profile, isPi, settings } = useAuth();
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [stale, setStale] = useState<Project[]>([]);
  const [updatePosted, setUpdatePosted] = useState(true);
  const [stats, setStats] = useState({ pending: 0, members: 0, week: 0, calendar: false, missing: 0 });

  const load = useCallback(async () => {
    if (!profile) return;
    const sb = supabase();
    const now = new Date().toISOString();
    const [mt, ai, pj, wu] = await Promise.all([
      sb.from("meetings").select(MEETING_SELECT).eq("status", "confirmed").gte("end_at", now).order("start_at").limit(5),
      sb.from("action_items").select("*, owner:profiles!action_items_owner_id_fkey(full_name, email, avatar_url), project:projects(title, short_code)")
        .eq("owner_id", profile.id).eq("status", "open").order("due_on", { ascending: true, nullsFirst: false }).limit(8),
      sb.from("projects").select("*").not("stage", "in", "(published,shelved)").order("last_activity").limit(50),
      sb.from("weekly_updates").select("id").eq("author_id", profile.id).eq("week_start", weekKey(new Date())).limit(1),
    ]);
    setUpcoming((mt.data ?? []) as Meeting[]);
    setItems((ai.data ?? []) as ActionItem[]);
    setUpdatePosted((wu.data ?? []).length > 0);
    const mine = (pj.data ?? []) as Project[];
    setStale(mine.filter(isStale).slice(0, 5));
    if (isPi) {
      const weekEnd = new Date(Date.now() + 7 * 86400_000).toISOString();
      const [p, m, w, g, st] = await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
        sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("meetings").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("start_at", now).lte("start_at", weekEnd),
        sb.rpc("calendar_connected"),
        sb.from("weekly_update_status").select("submitted"),
      ]);
      setStats({
        pending: p.count ?? 0, members: m.count ?? 0, week: w.count ?? 0, calendar: !!g.data,
        missing: (st.data ?? []).filter((r) => !r.submitted).length,
      });
    }
  }, [isPi, profile]);
  useEffect(() => { load(); }, [load]);

  const hour = labParts(new Date()).hh;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = profile?.full_name?.split(" ")[0] ?? "there";
  const overdue = items.filter((i) => i.due_on && new Date(i.due_on) < new Date(new Date().toDateString())).length;

  return (
    <>
      <PageHeader title={`${greeting}, ${first}`} subtitle={isPi ? `Here's what's happening in ${settings?.lab_name ?? "the lab"}.` : "Your projects, commitments and meetings."}
        action={!isPi && <Link href="/book/"><Button><CalendarPlus className="h-4 w-4" /> Book a meeting</Button></Link>} />

      {isPi ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={UserCheck} label="Pending approvals" value={stats.pending} href="/admin/" tone={stats.pending ? "warn" : "neutral"} />
          <Stat icon={CalendarDays} label="Meetings next 7 days" value={stats.week} href="/meetings/" />
          <Stat icon={ClipboardList} label="Updates missing this week" value={stats.missing} href="/updates/" tone={stats.missing ? "warn" : "neutral"} />
          <Stat icon={Users} label="Active members" value={stats.members} href="/people/" />
        </div>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Stat icon={ListTodo} label="Open action items" value={items.length} href="/projects/" tone={overdue ? "warn" : "neutral"} />
          <Stat icon={CalendarDays} label="Upcoming meetings" value={upcoming.length} href="/meetings/" />
          <Stat icon={FolderKanban} label="Quiet projects" value={stale.length} href="/projects/" tone={stale.length ? "warn" : "neutral"} />
        </div>
      )}

      {isPi && !stats.calendar && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/40 bg-warn-soft p-4">
          <div className="flex items-center gap-3 text-sm"><Link2 className="h-4 w-4 text-warn" /><span>Google Calendar isn&apos;t connected — bookings won&apos;t get Meet links or invites yet.</span></div>
          <Link href="/admin/?tab=calendar"><Button size="sm" variant="secondary">Connect calendar</Button></Link>
        </Card>
      )}
      {!updatePosted && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 text-sm"><ClipboardList className="h-4 w-4 text-accent" /><span>You haven&apos;t posted this week&apos;s update yet. It takes two minutes.</span></div>
          <Link href="/updates/"><Button size="sm">Post update</Button></Link>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming meetings" action={<Link href="/meetings/" className="text-sm text-accent-text hover:underline">All</Link>} />
          <div className="px-5 pb-5">
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming meetings" body={isPi ? "Students will appear here when they book." : "Grab a slot when you need one."} />
            ) : (
              <div className="space-y-3">{upcoming.map((m) => <MeetingCard key={m.id} m={m} showRequester={isPi} onChanged={load} />)}</div>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="My action items" subtitle={overdue ? `${overdue} overdue` : items.length ? "Next up" : undefined} action={<Link href="/assistant/" className="inline-flex items-center gap-1 text-sm text-accent-text hover:underline"><Sparkles className="h-3.5 w-3.5" />Ask</Link>} />
            <div className="divide-y divide-line px-5 pb-5">
              {items.length === 0 ? <p className="py-3 text-sm text-muted">Nothing open. Items appear here from meeting notes and project boards.</p>
                : items.map((i) => <ActionItemRow key={i.id} item={i} showProject onChanged={load} />)}
            </div>
          </Card>

          {stale.length > 0 && (
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" />Quiet projects</span>} subtitle="No activity in two weeks or more" />
              <ul className="divide-y divide-line px-5 pb-5">
                {stale.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/projects/view/?id=${p.id}`} className="min-w-0 truncate hover:underline">{p.title}</Link>
                    <span className="shrink-0 text-xs text-muted">{STAGE_LABEL[p.stage]} · {daysSince(p.last_activity)}d</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, href, tone = "neutral" }: { icon: typeof Users; label: string; value: number; href: string; tone?: "neutral" | "warn" }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className={`h-4 w-4 ${tone === "warn" ? "text-warn" : "text-faint"}`} />
      </div>
      <p className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-warn" : ""}`}>{value}</p>
    </Link>
  );
}
