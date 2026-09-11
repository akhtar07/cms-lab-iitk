"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MeetingCard } from "@/components/MeetingCard";
import { Button, EmptyState, PageHeader, Segmented, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Meeting } from "@/lib/types";

export default function MeetingsPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Meetings /></Suspense></AppShell>;
}

const SELECT = "*, requester:profiles!meetings_requester_id_fkey(full_name, email, avatar_url, role), project:projects(id, title, short_code)";

function Meetings() {
  const { isPi } = useAuth();
  const params = useSearchParams();
  const highlight = params.get("new");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [rows, setRows] = useState<Meeting[] | null>(null);

  const load = useCallback(async () => {
    const q = supabase().from("meetings").select(SELECT);
    const now = new Date().toISOString();
    const { data } = tab === "upcoming"
      ? await q.gte("end_at", now).order("start_at", { ascending: true })
      : await q.lt("end_at", now).order("start_at", { ascending: false }).limit(100);
    setRows((data ?? []) as Meeting[]);
  }, [tab]);

  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <>
      <PageHeader title={isPi ? "All meetings" : "My meetings"}
        subtitle={isPi ? "Everything booked with you." : "Bookings with the PI. Cancel at least a couple of hours ahead."}
        action={<Segmented value={tab} onChange={setTab} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />} />
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-8 w-8" />} title={tab === "upcoming" ? "Nothing scheduled" : "No past meetings"}
          body={tab === "upcoming" ? "Pick a slot from the PI's office hours." : undefined}
          action={tab === "upcoming" && !isPi ? <Link href="/book/"><Button>Book a meeting</Button></Link> : undefined} />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => <MeetingCard key={m.id} m={m} showRequester={isPi} onChanged={load} highlight={m.id === highlight} />)}
        </div>
      )}
    </>
  );
}
