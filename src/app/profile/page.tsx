"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Textarea, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL } from "@/lib/types";

export default function ProfilePage() {
  return <AppShell><Profile /></AppShell>;
}

function Profile() {
  const { profile, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", phone: "", research_interests: "", bio: "", scholar_url: "", orcid: "", expected_completion: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "", phone: profile.phone ?? "", research_interests: profile.research_interests ?? "",
      bio: profile.bio ?? "", scholar_url: profile.scholar_url ?? "", orcid: profile.orcid ?? "", expected_completion: profile.expected_completion ?? "",
    });
  }, [profile]);

  if (!profile) return null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const payload = { ...form, expected_completion: form.expected_completion || null };
    const { error } = await supabase().from("profiles").update(payload).eq("id", profile.id);
    setSaving(false);
    if (error) toast(error.message, "danger"); else { toast("Profile saved.", "success"); refresh(); }
  };

  return (
    <>
      <PageHeader title="Your profile" subtitle="What the rest of the lab sees on the People page." />
      <Card className="p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-4">
          <Avatar src={profile.avatar_url} name={profile.full_name} email={profile.email} size={64} />
          <div>
            <p className="text-lg font-semibold">{profile.full_name ?? profile.email}</p>
            <p className="text-sm text-muted">{profile.email}</p>
            <div className="mt-1.5 flex gap-1.5"><Badge tone="accent">{ROLE_LABEL[profile.role]}</Badge>{profile.joined_on && <Badge>Joined {profile.joined_on}</Badge>}</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={form.full_name} onChange={set("full_name")} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+91 …" /></Field>
          <Field label="Google Scholar URL"><Input value={form.scholar_url} onChange={set("scholar_url")} placeholder="https://scholar.google.com/citations?user=…" /></Field>
          <Field label="ORCID"><Input value={form.orcid} onChange={set("orcid")} placeholder="0000-0000-0000-0000" /></Field>
          <Field label="Expected completion" hint="Thesis / internship end date"><Input type="date" value={form.expected_completion} onChange={set("expected_completion")} /></Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Research interests" hint="One line: e.g. 2D magnets, DFT+U, machine-learned potentials"><Input value={form.research_interests} onChange={set("research_interests")} /></Field>
          <Field label="Short bio"><Textarea value={form.bio} onChange={set("bio")} /></Field>
        </div>
        <div className="mt-6 flex justify-end"><Button onClick={save} loading={saving}>Save changes</Button></div>
      </Card>
    </>
  );
}
