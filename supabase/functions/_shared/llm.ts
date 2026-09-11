// Pluggable LLM adapter. Default is Gemini's free tier; any OpenAI-compatible
// endpoint (Groq, OpenRouter, Ollama behind a tunnel, …) works by setting
//   LLM_PROVIDER=openai  LLM_BASE_URL=https://…/v1  LLM_API_KEY=…  LLM_MODEL=…
const provider = Deno.env.get("LLM_PROVIDER") ?? "gemini";
const model = Deno.env.get("LLM_MODEL") ?? (provider === "gemini" ? "gemini-3.6-flash" : "llama-3.3-70b-versatile");

export interface ChatOptions { system: string; user: string; json?: boolean; maxTokens?: number }

export async function chat({ system, user, json, maxTokens = 4096 }: ChatOptions): Promise<string> {
  if (provider === "gemini") return gemini({ system, user, json, maxTokens });
  return openai({ system, user, json, maxTokens });
}

async function gemini({ system, user, json, maxTokens }: ChatOptions) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set. Ask the PI to add it in Supabase → Edge Functions → Secrets.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.3,
        // Gemini 3.x counts reasoning tokens against this budget, so keep it roomy
        // and keep reasoning shallow — these are summarisation tasks, not puzzles.
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingLevel: "low" },
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) {
    const why = data.candidates?.[0]?.finishReason;
    throw new Error(why === "MAX_TOKENS" ? "The model ran out of output budget — try a shorter question." : "The model returned an empty response.");
  }
  return text;
}

async function openai({ system, user, json, maxTokens }: ChatOptions) {
  const base = (Deno.env.get("LLM_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const key = Deno.env.get("LLM_API_KEY");
  if (!key) throw new Error("LLM_API_KEY is not set.");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.3, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Tolerant JSON parse — strips ```json fences some models add. */
export function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}
