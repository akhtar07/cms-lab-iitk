"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, appUrl, isConfigured } from "./supabase";
import { setLabTimezone } from "./format";
import type { LabSettings, Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  settings: LabSettings | null;
  loading: boolean;
  isPi: boolean;
  isActive: boolean;
  refresh: () => Promise<void>;
  signIn: (opts?: { connectCalendar?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<LabSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setSettings(null); return; }
    const sb = supabase();
    const [{ data: p }, { data: st }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      sb.from("lab_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setProfile(p as Profile | null);
    setSettings(st as LabSettings | null);
    if (st?.timezone) setLabTimezone(st.timezone);
  }, []);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    const sb = supabase();
    let cancelled = false;
    sb.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      await load(s);
      setLoading(false);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [load]);

  const refresh = useCallback(async () => { await load(session); }, [load, session]);

  const signIn = useCallback(async (opts?: { connectCalendar?: boolean }) => {
    const connect = !!opts?.connectCalendar;
    try { sessionStorage.setItem("connectCalendar", connect ? "1" : ""); } catch { /* ignore */ }
    await supabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: appUrl("/auth/callback/"),
        // Only the PI's "Connect Calendar" flow asks for calendar access.
        scopes: connect ? "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly" : undefined,
        queryParams: connect ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" },
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setSession(null); setProfile(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, profile, settings, loading,
    isPi: profile?.role === "pi" && profile.status === "active",
    isActive: profile?.status === "active",
    refresh, signIn, signOut,
  }), [session, profile, settings, loading, refresh, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
