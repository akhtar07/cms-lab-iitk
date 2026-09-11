"use client";

// Google redirects here after OAuth. Supabase JS picks the session out of
// the URL; if this was the PI's "Connect Calendar" flow we also store the
// refresh token, then continue into the app.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/functions";
import { Button, Spinner } from "@/components/ui";

type Fail = { title: string; body: string };

// Google and Supabase report refusals in the query string or the hash.
function oauthError(): Fail | null {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = q.get("error_code") ?? h.get("error_code") ?? q.get("error") ?? h.get("error");
  if (!code) return null;
  const detail = q.get("error_description") ?? h.get("error_description") ?? "";
  if (code === "access_denied") {
    return {
      title: "Google blocked the sign-in",
      body: detail.includes("verification") || detail.includes("testing")
        ? "The OAuth app is still in Testing mode, so only listed test users can sign in. In Google Cloud → Google Auth Platform → Audience, press Publish app, then try again."
        : "You cancelled the consent screen, or Google refused the request. " + detail,
    };
  }
  return { title: "Sign-in failed", body: detail || code };
}

export default function Callback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");
  const [fail, setFail] = useState<Fail | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    const sb = supabase();
    const finish = async () => {
      const refused = oauthError();
      if (refused) { setFail(refused); return; }

      // PKCE: exchange ?code= for a session if the client hasn't yet.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) { setFail({ title: "Sign-in failed", body: error.message }); return; }
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setFail({ title: "Sign-in failed", body: "Google sent us back without a session. Please try again." }); return; }

      let connect = false;
      try { connect = sessionStorage.getItem("connectCalendar") === "1"; sessionStorage.removeItem("connectCalendar"); } catch { /* ignore */ }
      if (connect) {
        // Google only returns a refresh token on a fresh consent. If it withheld
        // one, saying so beats landing on a dashboard that claims "not connected".
        if (!session.provider_refresh_token) {
          setFail({
            title: "Google didn't return a refresh token",
            body: "This happens when the account has already granted access, so Google skips the consent screen. Open myaccount.google.com/permissions, remove this app, then press Connect again. Also check that the Calendar API is enabled in your Google Cloud project and that both calendar scopes are listed on the consent screen.",
          });
          return;
        }
        setMsg("Connecting Google Calendar…");
        try { await callFn("google-connect", { refresh_token: session.provider_refresh_token }); }
        catch (e) { setFail({ title: "Calendar connect failed", body: (e as Error).message }); return; }
        router.replace("/admin/?connected=1");
        return;
      }
      const { data: p } = await sb.from("profiles").select("status").eq("id", session.user.id).maybeSingle();
      router.replace(p?.status === "active" ? "/dashboard/" : "/pending/");
    };
    finish();
  }, [router]);

  if (fail) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card">
          <h1 className="text-lg font-semibold">{fail.title}</h1>
          <p className="mt-2 text-sm text-muted">{fail.body}</p>
          <div className="mt-5 flex gap-2">
            <Link href="/admin/?tab=calendar"><Button size="sm">Back to admin</Button></Link>
            <Link href="/"><Button size="sm" variant="ghost">Home</Button></Link>
          </div>
        </div>
      </div>
    );
  }
  return <div className="min-h-screen"><Spinner label={msg} /></div>;
}
