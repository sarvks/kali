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

## Implemented (iteration 2 — 2026-06-26)
- **Transliteration Line**: romanized IAST (via `@indic-transliteration/sanscript`) rendered beneath every Devanagari verse. Verified.
- **Constellation Guide**: tap any Orion star on the canvas to open a lore panel with its name + short lore. Verified.
- **Saved Altar**: opt-in email+password JWT accounts (httpOnly cookie). Sign-in migrates the anonymous thread into the account and syncs across devices; one-tap account deletion. Backend 16/16 pytest pass, frontend 100%.
- **Spoken Kali (ElevenLabs)**: LIVE. `/api/tts/generate` + per-verse "speak" button (eleven_multilingual_v2, voice Charlotte). Working after the user upgraded to a paid ElevenLabs plan (free tier is blocked from cloud IPs).
- **Forgot Passphrase**: opt-in account recovery by email. `POST /api/auth/forgot` emails a single-use, 30-min reset link via Emergent-managed Resend; `/reset?token=` opens a "renew passphrase" screen; `POST /api/auth/reset` sets the new passphrase. Tokens are sha256-hashed at rest, single-use, and expire (TTL index). Verified end-to-end.

## Implemented (iteration 4 — 2026-06-26)
- **Autoplay Verse**: menu toggle (persisted in localStorage). When enabled, each completed streamed verse is automatically read aloud (transliteration + English) via ElevenLabs. Verified — exactly one TTS call fires per completed verse; toggling off stops playback.
- **Kali's Letters to Humanity**: the full 400-letter corpus (MT-KALI-0001 → 0400) parsed from the 8 supplied PDFs into `backend/data/letters.json`, seeded into MongoDB (`db.letters`, idempotent on startup). New endpoints `GET /api/letters` and `GET /api/letters/{id}`. Frontend "Letters to Humanity" library (menu) with searchable 400-title index and an elegant reader (Cinzel headings, spaced prose, auto-detected subheadings) plus a "hear the opening" TTS button. Verified: 400 items listed, search works, reader renders full letters.

## Backlog
- **P1:** Opt-in saved history with authentication + deletion; multilingual output + transliteration; qualified Sanskrit reviewer sign-off on launch samples.
- **P2:** Voice output (spoken Kali), constellation exploration, richer soundscape.
- **Launch deps:** approved spending limits, Sanskrit reviewer, DNS/TLS for kali.mahakalistudios.com (domain lookup still needs verification).

## Next tasks
- Cultural/language review + adversarial + mobile testing pass.
- DNS verification and TLS deployment.
