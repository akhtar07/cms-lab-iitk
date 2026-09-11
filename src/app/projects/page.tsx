"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { ProjectCard, isStale } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { STAGE_LABEL, STAGE_ORDER, isLiveStage, type Project, type ProjectStage } from "@/lib/types";

export default function ProjectsPage() {
  return <AppShell><Projects /></AppShell>;
}

const GROUPS: { label: string; stages: ProjectStage[] }[] = [
  { label: "Exploring", stages: ["idea", "literature"] },
  { label: "Computing", stages: ["calculations", "analysis"] },
  { label: "Writing", stages: ["writing"] },
  { label: "With journal", stages: ["submitted", "under_review", "revision", "accepted"] },
  { label: "Done", stages: ["published", "shelved"] },
];

function Projects() {
  const { profile, isPi } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState<"mine" | "all" | "stale">(isPi ? "all" : "mine");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from("projects")
      .select("*, members:project_members(project_id, profile_id, role, profile:profiles(id, full_name, email, avatar_url, role))")
      .order("last_activity", { ascending: false });
    setProjects((data ?? []) as Project[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!projects) return [];
    if (filter === "mine") return projects.filter((p) => p.members?.some((m) => m.profile_id === profile?.id));
    if (filter === "stale") return projects.filter(isStale);
    return projects;
  }, [projects, filter, profile]);
  const staleCount = projects?.filter(isStale).length ?? 0;

  return (
    <>
      <PageHeader title="Projects" subtitle="Every paper and thesis chapter the lab is working on, by stage."
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New project</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: "mine", label: "Mine" }, { value: "all", label: "Whole lab" },
          { value: "stale", label: <span>Quiet{staleCount ? <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{staleCount}</span> : null}</span> },
        ]} />
      </div>

      {!projects ? <Spinner /> : shown.length === 0 ? (
        <Card><EmptyState icon={<FolderKanban className="h-8 w-8" />} title={filter === "stale" ? "Nothing is stale — nice." : "No projects yet"}
          body={filter === "mine" ? "Create a project for each paper or thesis chapter you're working on, then track it here." : undefined}
          action={filter !== "stale" ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New project</Button> : undefined} /></Card>
      ) : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = shown.filter((p) => g.stages.includes(p.stage));
            if (!items.length) return null;
            return (
              <section key={g.label}>
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{g.label}<span className="rounded-full bg-surface-2 px-1.5 text-[11px]">{items.length}</span></h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
              </section>
            );
          })}
        </div>
      )}
      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<ProjectStage>("idea");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (title.trim().length < 4) { toast("Give the project a title.", "danger"); return; }
    setBusy(true);
    const sb = supabase();
    const { data, error } = await sb.from("projects").insert({
      title: title.trim(), short_code: code.trim() || null, stage, summary: summary.trim() || null, lead_id: profile!.id, created_by: profile!.id,
    }).select().single();
    if (error) { setBusy(false); toast(error.message.includes("short_code") ? "That short code is already used." : error.message, "danger"); return; }
    await sb.from("project_members").insert({ project_id: data.id, profile_id: profile!.id, role: "lead" });
    setBusy(false); onClose();
    router.push(`/projects/view/?id=${data.id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Charged defects in monolayer MoS₂ under strain" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short code" hint="Used in updates and chat"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MoS2-defects" /></Field>
          <Field label="Stage"><Select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)}>{STAGE_ORDER.filter(isLiveStage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select></Field>
        </div>
        <Field label="One-paragraph summary" hint="The scientific question and approach. The assistant uses this for context."><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Create</Button></div>
    </Modal>
  );
}
