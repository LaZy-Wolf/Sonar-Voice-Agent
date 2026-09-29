/** One turn's latency record, published by the agent on the `sonar.metrics` topic. */
export type TurnMetrics = {
  ts: number;
  speech_id: string;
  eou_delay_ms: number;
  transcription_delay_ms?: number;
  llm_ttft_ms: number;
  /** Model calls in the turn. Two means it called a tool before answering. */
  llm_calls?: number;
  llm_provider?: string;
  llm_completion_tokens?: number;
  llm_tokens_per_s?: number;
  tts_ttfb_ms: number;
  tts_provider?: string;
  tts_audio_duration_ms?: number;
  stt_provider?: string;
  /** Caller going quiet to the agent's first audio, timed by LiveKit, tool round included. */
  ttfa_ms: number;
};

/** One transcribed line in the console. */
export type Line = { id: string; you: boolean; text: string };

/** Where a browser call is. */
export type Session = "idle" | "connecting" | "live";

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

/** Measured, not claimed. Every figure comes from docs/measurements/ or the decisions log. */
export const MEASURED = {
  browser: { p50: 1412, p95: 1487, turns: 5 },
  withTool: { p50: 1475, turns: 3 },
  direct: { p50: 920, turns: 2 },
  pickupToSpeech: { before: 5200, after: 1640 },
  /** Stage p50s and p95s from the deployed agent in us-east. */
  stages: [
    { label: "Hearing", note: "end of utterance", p50: 772, p95: 800, target: 350 },
    { label: "Transcribing", note: "Deepgram nova-3", p50: 165, p95: 204, target: 150 },
    { label: "Thinking", note: "first model token", p50: 312, p95: 366, target: 500 },
    { label: "Speaking", note: "first TTS byte", p50: 163, p95: 194, target: 150 },
  ],
  /** The same stages before and after moving the agent beside the providers. */
  moved: [
    { label: "Hearing", india: 634, usEast: 772 },
    { label: "Transcribing", india: 508, usEast: 165 },
    { label: "Thinking", india: 492, usEast: 312 },
  ],
} as const;

export const TOOLS = [
  {
    name: "search_knowledge_base",
    does: "Searches the FAQ. Every price, subsidy and warranty it speaks comes from here.",
    try: "How long is the warranty on the panels?",
  },
  {
    name: "check_availability",
    does: "Free site-visit slots on a date, excluding what is already booked.",
    try: "What slots do you have on Friday?",
  },
  {
    name: "book_site_visit",
    does: "Books a slot, and refuses one that clashes.",
    try: "Book me the eleven o'clock.",
  },
  {
    name: "lookup_customer",
    does: "Finds a customer by email, phone number, or part of a name.",
    try: "I'm already a customer, can you find my account?",
  },
  {
    name: "create_lead",
    does: "Records someone who is not a customer yet.",
    try: "I'd like a quote for my house in Warangal.",
  },
  {
    name: "get_current_datetime",
    does: "Resolves today and tomorrow in IST before any date is interpreted.",
    try: "Can someone come out tomorrow?",
  },
] as const;

export const REPO = "https://github.com/LaZy-Wolf/Sonar-Voice-Agent";
export const DECISIONS = `${REPO}/blob/main/docs/decisions-log.md`;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
