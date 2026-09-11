"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, Select, Spinner, useToast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, ROLE_ORDER, type MemberRole } from "@/lib/types";

export default function Pending() {
  const { session, profile, loading, refresh, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [req, setReq] = useState<MemberRole | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login/");
    else if (profile?.status === "active") router.replace("/dashboard/");
  }, [loading, session, profile, router]);

  useEffect(() => { setReq(profile?.requested_role ?? ""); }, [profile]);

  if (loading || !profile) return <div className="min-h-screen"><Spinner /></div>;

  const save = async () => {
    if (!req) return;
    setSaving(true);
    const { error } = await supabase().from("profiles").update({ requested_role: req }).eq("id", profile.id);
    setSaving(false);
    if (error) toast(error.message, "danger"); else { toast("Saved — the PI has been notified.", "success"); refresh(); }
  };

  const rejected = profile.status === "rejected" || profile.status === "left";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 fade-in">
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-full ${rejected ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
            {rejected ? <XCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{rejected ? "Access not granted" : "Waiting for approval"}</h1>
            <p className="text-sm text-muted">{profile.email}</p>
          </div>
        </div>
        {rejected ? (
          <p className="mt-5 text-sm text-muted">Your request was not approved. If you believe this is a mistake, contact the PI directly.</p>
        ) : (
          <>
            <p className="mt-5 text-sm text-muted">The PI approves new members once. Tell us your position so the right role is set up.</p>
            <div className="mt-4">
              <Field label="I am joining as">
                <Select value={req} onChange={(e) => setReq(e.target.value as MemberRole)}>
                  <option value="">Select…</option>
                  {ROLE_ORDER.filter((r) => r !== "pi" && r !== "alumni").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={save} loading={saving} disabled={!req}>Save</Button>
              <Button variant="secondary" onClick={() => refresh()}>Check status</Button>
            </div>
          </>
        )}
        <button onClick={signOut} className="mt-6 text-xs text-muted hover:text-text">Sign out</button>
      </Card>
    </div>
  );
}
