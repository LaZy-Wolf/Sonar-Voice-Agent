# SONAR — visual world

Direction: **the broadcast desk**. Chosen from a direction roll against six catalog
challengers; the collider event display was competitive, the rest declined and donated
disciplines that are written in below.

## The world

A radio station's mixing console. A graphite panel under a low top light, engraved
legends, meter faces lit warm from within. The panel is the ground; the meters are the
only light source in the room.

This is not decoration. The product is a pipeline of four timed stages, and a console is
the artifact that already solves exactly that problem: parallel channels, each with a
meter, each with a mark on the scale you must not exceed. A stage over budget reads as a
needle past the mark, before anyone parses a number.

**Mapping.** Hearing you, transcribing, thinking and speaking are four channel strips.
Each strip's meter carries its own target engraved on the same scale as the live value.
The call itself is the master section. Scrolling walks down the desk.

## Anti-reference

Every voice-AI site in this category ships the same page: near-black ground, cyan or blue
glow, gradient mesh, waveform motif. Retell and LiveKit were opened and confirmed as this
rut. **No blue appears anywhere in this system.** If the palette could be guessed from the
category, it failed.

## Colour

Strategy: **committed**. The graphite panel owns the surface; warm ivory meter faces are
the light.

Physical scene: a studio at night, one lamp over the desk, meter faces glowing from
inside. That scene forces dark, and forces warm.

| Token | Value | Role |
|---|---|---|
| `--panel-900` | `oklch(21% 0.008 128)` | deepest panel, page ground |
| `--panel-800` | `oklch(26% 0.008 128)` | strip bodies |
| `--panel-700` | `oklch(31% 0.009 128)` | raised sections |
| `--engrave` | `oklch(38% 0.010 128)` | scored lines, hairline rules |
| `--legend` | `oklch(74% 0.010 120)` | engraved panel text |
| `--legend-dim` | `oklch(60% 0.010 120)` | secondary legend |
| `--face` | `oklch(93% 0.024 88)` | meter face ivory |
| `--face-ink` | `oklch(28% 0.030 60)` | ink printed on a meter face |
| `--signal` | `oklch(76% 0.150 68)` | amber: live and actionable |
| `--over` | `oklch(60% 0.200 27)` | red: past target |

The greens in the hue channel are what keep the graphite off blue; it reads as warm
machine grey, not navy.

**Colour is law** (donated by the arcade direction, declined): ivory is nominal, amber is
live or actionable, red is over target. Nothing else on the page is ever coloured. An
amber element the visitor cannot act on is a bug.

## Type

- **Archivo Narrow**, uppercase, tracked — engraved panel legends. Signage grotesk, which
  is what a panel legend is.
- **Archivo** — body and headings.
- **JetBrains Mono**, tabular — every number. Latency figures are compared column to
  column and must not shimmy as they update.

Deliberately not Inter, Space Grotesk, DM Sans, Plus Jakarta, Outfit, IBM Plex or any
display serif: those are the faces this category already wears.

## Composition

Full-bleed horizontal bands, each one a section of the desk, separated by engraved rules
rather than cards. Cards are the lazy answer and nested cards are always wrong; the panel
groups by scoring and space.

Order, top to bottom:

1. **Master section** — identity, the call button, live state, the headline number.
2. **Channel strips** — the four stages, live meters, targets engraved.
3. **Talkback** — the transcript.
4. **Patch bay** — the six tools, lighting as they fire.
5. **Trunk line** — the phone path and dial-out.
6. **Room tone** — the honest failure: the geography that costs the budget.
7. **Colophon** — stack, tests, source.

The scroll is a composed sequence, not a list (donated by Versailles, declined): headline
number, then the breakdown, then the admission.

## Motion

Motion grammar is **mechanical**: things have mass and settle. Nothing floats or fades in
place without moving.

- **Meter needles** carry real VU ballistics: fast rise, slow fall, a peak-hold marker
  that decays. This is the signature interaction and it is driven by live measurements,
  never a loop.
- **Section reveal** on intersection: 14px rise plus opacity, `cubic-bezier(0.23, 1, 0.32, 1)`,
  staggered by 60ms within a band.
- **Press**: `scale(0.985)`, 120ms.
- **Selected turn isolates and dims the rest** (donated by the collider display,
  competitive).
- Only `transform` and `opacity` animate.
- Every animation has a `prefers-reduced-motion` path: needles jump to value, reveals are
  instant, nothing is lost but the movement.

## Material

Panel elements have presence under a top light (donated by the matchbook drawer,
declined): a 1px light top edge and a darker bottom edge on raised surfaces, hairline
engraved scoring, meter faces with a subtle inner shadow. Never a drop shadow floating a
card off the page.

## Accessibility

WCAG AA on every text pair, verified in-browser, not eyeballed. Keyboard reachable with
visible focus in amber. Meters carry `role="meter"` with `aria-valuenow`, `aria-valuemax`
and a text equivalent, so the numbers survive without the needles.
