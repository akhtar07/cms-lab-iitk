"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, useToast } from "@/components/ui";
import { ProjectSelect } from "@/components/research";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Project, Publication } from "@/lib/types";

export default function PublicationsPage() {
  return <AppShell><Publications /></AppShell>;
}

function Publications() {
  const { profile, isPi } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Publication[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from("publications").select("*").order("year", { ascending: false }).order("created_at", { ascending: false });
    setRows((data ?? []) as Publication[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (p: Publication) => {
    if (!confirm(`Remove "${p.title}"?`)) return;
    await supabase().from("publications").delete().eq("id", p.id); load();
  };
  const bibtex = (p: Publication) => {
    const key = `${(p.authors ?? "lab").split(/[,\s]+/)[0].toLowerCase()}${p.year ?? ""}`;
    const s = `@article{${key},\n  title = {${p.title}},\n  author = {${(p.authors ?? "").split(", ").join(" and ")}},\n  journal = {${p.journal ?? ""}},\n  year = {${p.year ?? ""}},\n  doi = {${p.doi ?? ""}}\n}`;
    navigator.clipboard.writeText(s).then(() => toast("BibTeX copied.", "success"));
  };

  const years = [...new Set((rows ?? []).map((r) => r.year ?? 0))].sort((a, b) => b - a);

  return (
    <>
      <PageHeader title="Publications" subtitle="Papers and preprints from the group. Paste a DOI and the details fill in automatically."
        action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add paper</Button>} />
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="h-8 w-8" />} title="No publications listed yet" body="Add the group's papers by DOI or arXiv ID." action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add paper</Button>} /></Card>
      ) : (
        <div className="space-y-6">
          {years.map((y) => (
            <section key={y}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{y || "Undated"}</h2>
              <Card className="divide-y divide-line">
                {rows.filter((r) => (r.year ?? 0) === y).map((p) => (
                  <div key={p.id} className="group flex items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{p.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{p.authors}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {p.journal && <span className="italic">{p.journal}</span>}
                        <Badge tone={p.status === "published" ? "success" : "neutral"}>{p.status}</Badge>
                        {p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-text hover:underline">doi:{p.doi}<ExternalLink className="h-3 w-3" /></a>}
                        {p.arxiv_id && <a href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-text hover:underline">arXiv:{p.arxiv_id}<ExternalLink className="h-3 w-3" /></a>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => bibtex(p)} title="Copy BibTeX" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text"><Copy className="h-4 w-4" /></button>
                      {(isPi || p.added_by === profile?.id) && <button onClick={() => remove(p)} title="Remove" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
      <AddModal open={adding} onClose={() => setAdding(false)} onSaved={load} />
    </>
  );
}

interface CrossrefWork { title?: string[]; author?: { given?: string; family?: string }[]; "container-title"?: string[]; issued?: { "date-parts": number[][] }; DOI?: string; URL?: string }

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [lookup, setLookup] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Pick<Project, "id" | "title" | "short_code">[]>([]);
  const [f, setF] = useState({ title: "", authors: "", journal: "", year: "", doi: "", arxiv_id: "", url: "", status: "published" as Publication["status"], project_id: "" });

  useEffect(() => {
    if (!open) return;
    supabase().from("projects").select("id, title, short_code").order("title").then(({ data }) => setProjects((data ?? []) as Pick<Project, "id" | "title" | "short_code">[]));
  }, [open]);

  const fetchMeta = async () => {
    const id = lookup.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:/i, "").replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/^arxiv:/i, "");
    if (!id) return;
    setBusy(true);
    try {
      if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(id)) {
        // arXiv: public Atom API, no key needed.
        const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${id}`)).text();
        const doc = new DOMParser().parseFromString(xml, "text/xml");
        const entry = doc.querySelector("entry");
        if (!entry || !entry.querySelector("title")) throw new Error("arXiv ID not found");
        setF({ ...f, title: entry.querySelector("title")!.textContent!.replace(/\s+/g, " ").trim(),
          authors: [...entry.querySelectorAll("author name")].map((n) => n.textContent).join(", "),
          journal: "arXiv preprint", year: entry.querySelector("published")!.textContent!.slice(0, 4), arxiv_id: id, url: `https://arxiv.org/abs/${id}`, status: "preprint" });
      } else {
        const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("DOI not found on Crossref");
        const w = (await res.json()).message as CrossrefWork;
        setF({ ...f, title: w.title?.[0] ?? "", authors: (w.author ?? []).map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", "),
          journal: w["container-title"]?.[0] ?? "", year: String(w.issued?.["date-parts"]?.[0]?.[0] ?? ""), doi: w.DOI ?? id, url: w.URL ?? `https://doi.org/${id}`, status: "published" });
      }
    } catch (e) { toast((e as Error).message, "danger"); }
    setBusy(false);
  };

  const save = async () => {
    if (!f.title.trim()) { toast("Title is required.", "danger"); return; }
    setBusy(true);
    const { error } = await supabase().from("publications").insert({
      title: f.title.trim(), authors: f.authors || null, journal: f.journal || null, year: f.year ? Number(f.year) : null,
      doi: f.doi || null, arxiv_id: f.arxiv_id || null, url: f.url || null, status: f.status, project_id: f.project_id || null, added_by: profile!.id,
    });
    setBusy(false);
    if (error) { toast(error.message.includes("doi") ? "That DOI is already listed." : error.message, "danger"); return; }
    setF({ title: "", authors: "", journal: "", year: "", doi: "", arxiv_id: "", url: "", status: "published", project_id: "" }); setLookup("");
    onClose(); onSaved(); toast("Added.", "success");
  };

  return (
    <Modal open={open} onClose={onClose} title="Add publication" wide>
      <div className="mb-4 flex gap-2">
        <Input value={lookup} onChange={(e) => setLookup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchMeta()} placeholder="DOI (10.1103/…) or arXiv ID (2409.12345)" className="flex-1" autoFocus />
        <Button variant="secondary" onClick={fetchMeta} loading={busy}>Look up</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Authors"><Input value={f.authors} onChange={(e) => setF({ ...f, authors: e.target.value })} placeholder="A. Kumar, S. Bhowmick" /></Field></div>
        <Field label="Journal"><Input value={f.journal} onChange={(e) => setF({ ...f, journal: e.target.value })} /></Field>
        <Field label="Year"><Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /></Field>
        <Field label="DOI"><Input value={f.doi} onChange={(e) => setF({ ...f, doi: e.target.value })} /></Field>
        <Field label="arXiv ID"><Input value={f.arxiv_id} onChange={(e) => setF({ ...f, arxiv_id: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Publication["status"] })}><option value="published">Published</option><option value="preprint">Preprint</option></Select></Field>
        <Field label="Project"><ProjectSelect projects={projects} value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Add</Button></div>
    </Modal>
  );
}
