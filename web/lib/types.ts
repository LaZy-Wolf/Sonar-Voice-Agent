/** One turn's latency record, published by the agent on the `sonar.metrics` topic. */
export type TurnMetrics = {
  ts: number;
  speech_id: string;
  eou_delay_ms: number;
  transcription_delay_ms?: number;
  llm_ttft_ms: number;
  llm_provider?: string;
  llm_completion_tokens?: number;
  llm_tokens_per_s?: number;
  tts_ttfb_ms: number;
  tts_provider?: string;
  tts_audio_duration_ms?: number;
  stt_provider?: string;
  ttfa_estimate_ms: number;
};

/**
 * The four channel strips. `full` is full-scale deflection on the meter, chosen so a
 * healthy reading sits around two thirds of the sweep and an over-target one is
 * unmistakably past the mark.
 */
export const STAGES = [
  { key: "eou_delay_ms", label: "Hearing", target: 350, full: 1000 },
  { key: "transcription_delay_ms", label: "Transcribing", target: 150, full: 800 },
  { key: "llm_ttft_ms", label: "Thinking", target: 500, full: 1100 },
  { key: "tts_ttfb_ms", label: "Speaking", target: 150, full: 400 },
] as const;

export const TTFA_TARGET = 900;
export const TTFA_FULL = 3000;

/** Measured, not claimed. Every figure here comes from agent/data/turns.jsonl. */
export const MEASURED = {
  browser: { p50: 1299, p95: 1473, turns: 6 },
  phone: { p50: 1666, p95: 1809 },
  pickupToSpeech: { before: 5200, after: 1640 },
  rtt: [
    { provider: "NVIDIA NIM", ms: 106 },
    { provider: "Groq", ms: 423 },
    { provider: "Deepgram", ms: 1115 },
    { provider: "Cartesia", ms: 1853 },
  ],
} as const;

export const TOOLS = [
  { name: "get_current_datetime", does: "Resolves today and tomorrow in IST before any date is interpreted." },
  { name: "lookup_customer", does: "Finds a customer by email, phone, or part of a name." },
  { name: "create_lead", does: "Records someone who is not a customer yet." },
  { name: "check_availability", does: "Free site-visit slots on a date, excluding what is booked." },
  { name: "book_site_visit", does: "Books a slot, refusing one that clashes." },
  { name: "search_knowledge_base", does: "Searches the FAQ. Every price and warranty comes from here." },
] as const;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
