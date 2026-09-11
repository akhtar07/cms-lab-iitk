import { supabase } from "./supabase";

/** Call a Supabase edge function with the current user's JWT. */
export async function callFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) {
    // Surface the function's own error message when it returned JSON
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") msg = (await ctx.json()).error ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Broadcast channel used to tell every open booking page that slots changed. */
export const SLOTS_CHANNEL = "slots";
export async function announceSlotsChanged() {
  const ch = supabase().channel(SLOTS_CHANNEL);
  await new Promise<void>((resolve) => ch.subscribe((s) => s === "SUBSCRIBED" && resolve()));
  await ch.send({ type: "broadcast", event: "changed", payload: {} });
  await supabase().removeChannel(ch);
}
