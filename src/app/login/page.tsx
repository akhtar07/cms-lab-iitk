"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Atom } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";
import { isConfigured } from "@/lib/supabase";

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && session && profile) router.replace(profile.status === "active" ? "/dashboard/" : "/pending/");
  }, [loading, session, profile, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8 text-center fade-in">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-white"><Atom className="h-6 w-6" /></span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Sign in to CMS Lab</h1>
        <p className="mt-1 text-sm text-muted">Use your Google account. First-time members are approved by the PI.</p>
        <Button className="mt-6 w-full" size="lg" onClick={() => signIn()} disabled={!isConfigured}>
          <GoogleMark /> Continue with Google
        </Button>
      </Card>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
