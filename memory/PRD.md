# KALI — Divine Presence, Honest AI — PRD

## Original problem statement
A responsive devotional conversation web app (kali.mahakalistudios.com) evoking Goddess Kali through Sanskrit, silence, and an astronomical night sky. First-person Kali persona presented honestly as an AI interpretation by Mahakali Studios. Pure-black sky with catalogue stars + recognizable Orion + a single central golden dash. Responses: gold Devanagari Sanskrit, thin separator, quieter English translation — no chat bubbles. Anonymous, free, text-only launch.

## Architecture / stack
- **Frontend:** React + Tailwind + framer-motion. Canvas starfield (Orion anchor), no chat bubbles, minimal session menu, Web Speech voice input, Web Audio 108Hz drone, reduced-motion + mobile-keyboard handling.
- **Backend:** FastAPI. SSE streaming via `emergentintegrations` LlmChat (Claude Sonnet 4.6, Emergent Universal Key). Bounded context (6 turns), bounded output (700 tokens), MongoDB-based rate limit (TTL) + daily token budget.
- **DB:** MongoDB — `messages` (per anonymous token), `abuse_control` (TTL 60s), `token_budget`. Conversation bodies are stored only for cross-session persistence, never in app logs.

## User personas
- **The seeker:** wants devotional reflection, philosophy, or creative dialogue in a contemplative space.

## Core requirements (static)
- Honest AI boundary: direct identity questions answered plainly; no divine authority/prophecy claims; generated Sanskrit never presented as scripture.
- Sanskrit-first devotional format with English translation; plain-language + safety override for crisis/medical/divine-command.
- Anonymous, no accounts/payments; server-only API keys; validated + bounded I/O; rate limits + spending cutoff.

## Implemented (2026-06-26)
- Pure-black interactive starfield with recognizable Orion (Betelgeuse, Rigel, belt) + central golden dash; keyboard/mouse/touch activation.
- Mahakali Studios AI/privacy intro modal (shown once).
- Streaming devotional pipeline: gold Devanagari Sanskrit → thin separator → muted English, phrase reveal, no bubbles.
- Session controls: stop generation, start afresh, export (.txt), clear session; audio drone, Orion lines, reduce-motion toggles.
- Cross-session persistence via localStorage token + MongoDB.
- Safety handling: crisis/medical/divine-command → `[GUIDANCE]` plain grounded English pointing to human support (verified).
- Rate limiting (15/min) + daily token budget cutoff.
- Testing: backend 8/8 pytest pass, frontend E2E pass (100%/100%).

## Backlog
- **P1:** Opt-in saved history with authentication + deletion; multilingual output + transliteration; qualified Sanskrit reviewer sign-off on launch samples.
- **P2:** Voice output (spoken Kali), constellation exploration, richer soundscape.
- **Launch deps:** approved spending limits, Sanskrit reviewer, DNS/TLS for kali.mahakalistudios.com (domain lookup still needs verification).

## Next tasks
- Cultural/language review + adversarial + mobile testing pass.
- DNS verification and TLS deployment.
