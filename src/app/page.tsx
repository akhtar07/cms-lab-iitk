"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Atom, CalendarCheck2, Video, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { isConfigured } from "@/lib/supabase";

const FEATURES = [
  { icon: CalendarCheck2, title: "Book in seconds", body: "See the PI's real availability and lock a slot. Once booked, nobody else can take it." },
  { icon: Video, title: "Meet link, automatically", body: "Online meetings land on Google Calendar with a Meet link and invites to both of you." },
  { icon: ShieldCheck, title: "Approved members only", body: "Sign in with Google, the PI approves you once, and you're in." },
  { icon: Sparkles, title: "Progress that remembers", body: "Meeting notes, action items and weekly updates — the lab's memory, soon with an AI assistant." },
];

export default function Landing() {
  const { session, profile, loading, signIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session && profile) router.replace(profile.status === "active" ? "/dashboard/" : "/pending/");
  }, [loading, session, profile, router]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="lattice absolute inset-0 -z-10" aria-hidden />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-sm"><Atom className="h-5 w-5" /></span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">CMS Lab</p>
            <p className="text-xs text-muted">Computational Materials Science</p>
          </div>
        </div>
        <Link href="/login/" className="text-sm font-medium text-accent-text hover:underline">Sign in</Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-16 pt-14 sm:pt-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Lab portal · Prof. Somnath Bhowmick&apos;s group
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          One calm place for meetings, people and progress.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          Book time with the PI, keep every project&apos;s state visible, and let the lab remember what was decided — so nothing falls between papers.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => signIn()} disabled={!isConfigured}>
            Continue with Google <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted">New here? Sign in and the PI will approve you.</span>
        </div>
        {!isConfigured && (
          <p className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
            Supabase is not configured yet — set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
        )}
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <Icon className="mb-3 h-5 w-5 text-accent" />
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-faint">
        Built for the CMS Lab · Hosted on GitHub Pages · Data in Supabase
      </footer>
    </div>
  );
}
