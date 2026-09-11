"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, ROLE_ORDER, type Profile } from "@/lib/types";

export default function PeoplePage() {
  return <AppShell><People /></AppShell>;
}

function People() {
  const [rows, setRows] = useState<Profile[] | null>(null);
  useEffect(() => {
    supabase().from("profiles").select("*").eq("status", "active").order("full_name").then(({ data }) => setRows((data ?? []) as Profile[]));
  }, []);
  if (!rows) return <Spinner />;
  const byRole = ROLE_ORDER.map((r) => [r, rows.filter((p) => p.role === r)] as const).filter(([, l]) => l.length);
  const mentorName = (id: string | null) => rows.find((p) => p.id === id)?.full_name;

  return (
    <>
      <PageHeader title="People" subtitle={`${rows.length} active members`} />
      {byRole.length === 0 && <EmptyState icon={<Users className="h-8 w-8" />} title="No members yet" />}
      <div className="space-y-8">
        {byRole.map(([role, list]) => (
          <section key={role}>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{ROLE_LABEL[role]} <span className="text-faint">· {list.length}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar src={p.avatar_url} name={p.full_name} email={p.email} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.full_name ?? p.email}</p>
                      <a href={`mailto:${p.email}`} className="block truncate text-xs text-muted hover:text-accent-text">{p.email}</a>
                      {p.mentor_id && <p className="mt-1 text-xs text-muted">Mentor: {mentorName(p.mentor_id) ?? "—"}</p>}
                    </div>
                  </div>
                  {p.research_interests && <p className="mt-3 line-clamp-2 text-sm text-muted">{p.research_interests}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.joined_on && <Badge>Since {new Date(p.joined_on).getFullYear()}</Badge>}
                    {p.scholar_url && <a href={p.scholar_url} target="_blank" rel="noreferrer"><Badge tone="accent">Scholar</Badge></a>}
                    {p.orcid && <a href={`https://orcid.org/${p.orcid}`} target="_blank" rel="noreferrer"><Badge tone="accent">ORCID</Badge></a>}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
