"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { clsx } from "clsx";
import { CalendarPlus, CalendarDays, Home, LogOut, Settings2, User, Users, Atom, FolderKanban, ClipboardList, Sparkles, BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Avatar, Spinner } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/types";

const NAV = [
  { href: "/dashboard/", label: "Overview", icon: Home, short: "Home" },
  { href: "/projects/", label: "Projects", icon: FolderKanban, short: "Projects" },
  { href: "/updates/", label: "Weekly updates", icon: ClipboardList, short: "Updates" },
  { href: "/assistant/", label: "Lab assistant", icon: Sparkles, short: "Assistant" },
  { href: "/book/", label: "Book a meeting", icon: CalendarPlus, short: "Book" },
  { href: "/meetings/", label: "Meetings", icon: CalendarDays, short: "Meetings" },
  { href: "/publications/", label: "Publications", icon: BookOpen, short: "Papers" },
  { href: "/people/", label: "People", icon: Users, short: "People" },
  { href: "/profile/", label: "Profile", icon: User, short: "Profile" },
];
/** The mobile tab bar only has room for a few — the rest live in the sidebar. */
const MOBILE = ["/dashboard/", "/projects/", "/assistant/", "/book/", "/meetings/"];

/**
 * Wraps every signed-in page: redirects visitors to /login, un-approved
 * members to /pending, and renders the sidebar / mobile tab bar.
 */
export function AppShell({ children, requirePi }: { children: ReactNode; requirePi?: boolean }) {
  const { session, profile, settings, loading, isPi, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace("/login/"); return; }
    if (profile && profile.status !== "active") { router.replace("/pending/"); return; }
    if (requirePi && profile && !isPi) router.replace("/dashboard/");
  }, [loading, session, profile, isPi, requirePi, router]);

  if (loading || !session || !profile || profile.status !== "active" || (requirePi && !isPi)) {
    return <div className="min-h-screen"><Spinner /></div>;
  }

  const nav = isPi ? [...NAV, { href: "/admin/", label: "Admin", icon: Settings2, short: "Admin" }] : NAV;
  const mobileNav = nav.filter((n) => MOBILE.includes(n.href));
  const active = (href: string) => pathname?.startsWith(href.replace(/\/$/, ""));

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-surface md:sticky md:top-0 md:h-screen">
        <Link href="/dashboard/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><Atom className="h-4.5 w-4.5" /></span>
          <span className="text-[15px] font-semibold tracking-tight">{settings?.lab_name ?? "CMS Lab"}</span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={clsx("mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active(href) ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar src={profile.avatar_url} name={profile.full_name} email={profile.email} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.full_name ?? profile.email}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[profile.role]}</p>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-white"><Atom className="h-4 w-4" /></span>
          <span className="text-sm font-semibold">{settings?.lab_name ?? "CMS Lab"}</span>
        </Link>
        <button onClick={signOut} className="text-xs text-muted">Sign out</button>
      </header>

      <main className="flex-1 min-w-0 px-4 pb-24 pt-6 sm:px-6 md:px-10 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl fade-in">{children}</div>
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileNav.length}, 1fr)` }}>
        {mobileNav.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href}
            className={clsx("flex flex-col items-center gap-1 py-2 text-[10px] font-medium", active(href) ? "text-accent-text" : "text-muted")}>
            <Icon className="h-5 w-5" />{short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
