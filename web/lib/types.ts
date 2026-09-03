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

/** Targets from the design spec, in milliseconds. */
export const STAGES = [
  { key: "eou_delay_ms", label: "Hearing you stop", target: 350 },
  { key: "llm_ttft_ms", label: "Thinking", target: 500 },
  { key: "tts_ttfb_ms", label: "Starting to speak", target: 150 },
] as const;

export const TTFA_TARGET = 900;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
