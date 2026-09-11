"use client";

// Google redirects here after OAuth. Supabase JS picks the session out of
// the URL; if this was the PI's "Connect Calendar" flow we also store the
// refresh token, then continue into the app.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/functions";
import { Spinner } from "@/components/ui";

export default function Callback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    const sb = supabase();
    const finish = async () => {
      // PKCE: exchange ?code= for a session if the client hasn't yet.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) { setMsg(`Sign-in failed: ${error.message}`); return; }
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setMsg("Sign-in failed. Please try again."); return; }

      let connect = false;
      try { connect = sessionStorage.getItem("connectCalendar") === "1"; sessionStorage.removeItem("connectCalendar"); } catch { /* ignore */ }
      if (connect && session.provider_refresh_token) {
        setMsg("Connecting Google Calendar…");
        try { await callFn("google-connect", { refresh_token: session.provider_refresh_token }); }
        catch (e) { setMsg(`Calendar connect failed: ${(e as Error).message}`); setTimeout(() => router.replace("/admin/"), 2500); return; }
        router.replace("/admin/?connected=1");
        return;
      }
      const { data: p } = await sb.from("profiles").select("status").eq("id", session.user.id).maybeSingle();
      router.replace(p?.status === "active" ? "/dashboard/" : "/pending/");
    };
    finish();
  }, [router]);

  return <div className="min-h-screen"><Spinner label={msg} /></div>;
}
