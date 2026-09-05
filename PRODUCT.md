# SONAR — product truth

## What it is

A real-time, interruptible voice agent that answers and places phone calls. It acts as the
front desk for Helios Solar, a fictional rooftop-solar installer: it answers questions from
a knowledge base, looks customers up, checks a calendar and books site visits. It is
reachable from a web page over WebRTC and from an ordinary phone number over PSTN.

Helios Solar is demo fiction. The subject is the engineering.

## Platform

web

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. Python worker on LiveKit
Agents. Existing, not a user decision to revisit.

## Primary user

Someone evaluating the author's engineering: a recruiter, hiring manager, or engineer.
They arrive sceptical, give it under a minute, and want to know whether this is real. Their
job is to decide if the person who built it is worth talking to.

Secondary: the author, demonstrating it live in an interview.

## What it must prove

That this is a working system, not a demo video. In order of weight:

1. It actually talks, right now, in the browser. One click, no signup.
2. Every stage of every turn is measured, and the numbers are published including the
   ones that miss target.
3. It performs real actions through tools, not scripted replies.
4. It works on a real phone number, both directions.

## Facts that must survive any redesign

These are measured, not claimed, and must not be rounded up or dramatised.

- Time to first audio: **p50 1299 ms, p95 1473 ms** in the browser; **p50 1666 ms** on a
  phone call.
- Stage p50s in the browser: end-of-utterance 634 ms, transcription 508 ms, LLM first
  token 492 ms, TTS first byte 129 ms.
- The model and speech stages meet target. Hearing the caller does not, because the agent
  runs in India and the providers are in the United States: measured RTT is Deepgram
  1115 ms, Cartesia 1853 ms, Groq 423 ms, NVIDIA 106 ms.
- Pickup to first spoken word on an outbound call: **1.64 s**, down from 5.2 s.
- Stack: Deepgram nova-3 streaming STT, Groq `qwen/qwen3.8-27b` with NVIDIA Nemotron as
  fallback, Cartesia Sonic TTS, six MCP tools over SQLite, Twilio SIP both directions.
- Nemotron was the intended brain and was demoted on measurement: 597 ms median TTFT
  against a 5203 ms worst case. That decision is a feature of the story, not an apology.
- 55 tests. CI green.

## Constraints

- No invented commercial claims: no customers, no pricing, no benchmarks, no capabilities
  the system does not have. Every number on the page comes from `agent/data/turns.jsonl`
  or the decisions log.
- Helios Solar content is fiction and must read as a demo scenario, never as a real
  company soliciting business.
- The browser call requires microphone permission and must degrade clearly when denied.
- Telephony costs real money; the dial-out control must never look like a toy.

## Terminology

Turn, time-to-first-audio, end-of-utterance, fallback chain, MCP tool, SIP trunk. The
audience is technical; these words are the plain ones for them.

## Accessibility

Keyboard reachable, visible focus, WCAG AA contrast (already measured and enforced once at
5.54:1 for muted text). Motion must honour `prefers-reduced-motion`.

## Voice

Plain, exact, unhyped. Numbers over adjectives. The project's own decisions log states what
went wrong as readily as what worked, and the page should carry the same confidence.
