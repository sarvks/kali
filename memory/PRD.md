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
- **Kali's Letters to Humanity**: the full 400-letter corpus (MT-KALI-0001 → 0400) parsed from the 8 supplied PDFs into `backend/data/letters.json`, seeded into MongoDB (`db.letters`, idempotent on startup). New endpoints `GET /api/letters` and `GET /api/letters/{id}`. Frontend "Letters to Humanity" library (menu) with searchable 400-title index and an elegant reader plus a "hear the opening" TTS button.

## Implemented (iteration 5 — 2026-06-26)
- **Letter Autoplay (read in full)**: the reader can read an entire letter aloud, chunked by paragraph (~620-char chunks) and played sequentially through ElevenLabs, with a live "reading X/Y — stop" control. Verified via the shared TTS path.
- **Daily Letter**: `GET /api/letters/daily` returns a deterministic letter for the current UTC date. A "☾ Today's Letter — {title}" invitation appears on the entry screen and a "Today's Letter" button sits in the library header (auto-opens that letter). Verified (today = MT-KALI-0286).
- **Save a Letter**: signed-in seekers bookmark letters to their altar. Endpoints `GET/POST/DELETE /api/auth/saved-letters[/{id}]` (collection `db.saved_letters`, unique per user+letter, removed on account deletion). Reader has a save/saved toggle; library has an "All / Saved" tab; anonymous users are prompted to sign in. Verified end-to-end.
- **Letter to Verse**: a "distil to a verse" button on any letter closes the library, opens the chat, and asks Kali to distil that letter into a short Sanskrit verse + English meaning.

## Implemented (iteration 6 — 2026-06-26)
- **Continue Reading**: the reader saves the seeker's scroll position per letter to localStorage; on return, a "↩ Continue reading — {title}" entry appears and reopening the letter restores the scroll position. Verified.
- **Verse From Saved**: in the library's "Saved" tab, a "Weave these into a closing blessing" button asks Kali (in chat) to weave the seeker's saved letters into one short closing Sanskrit blessing. Verified (button + chat handoff).
- **Letter Share**: a "share" button on any letter builds a portrait card image (canvas: काली, title, excerpt, ॥ ॐ ॥, domain) and uses the Web Share API (with image file when supported), falling back to copying a `?letter={id}` deep link + downloading the card. The deep link auto-opens that letter on load. Verified.
- **Daily Reminder**: signed-in seekers opt into a morning email via the menu (`POST /api/auth/daily-reminder`). A platform cron (`.emergent/crons.yml` → `daily-letter-mail`, 13:00 UTC) hits `POST /api/cron/daily-reminder` (Bearer `WEBHOOK_CRON_SECRET`, acks immediately + backgrounds the work, idempotent per day) and emails that day's letter via Resend. Verified: 401 without auth, sent 1/1 to opted-in user with auth.
- **Shooting star**: the starfield now spawns an occasional meteor (gold streak with fading tail) every ~4–12s, disabled under reduced motion. Verified sky renders correctly.

## Backlog
- **P1:** Opt-in saved history with authentication + deletion; multilingual output + transliteration; qualified Sanskrit reviewer sign-off on launch samples.
- **P2:** Voice output (spoken Kali), constellation exploration, richer soundscape.
- **Launch deps:** approved spending limits, Sanskrit reviewer, DNS/TLS for kali.mahakalistudios.com (domain lookup still needs verification).

## Next tasks
- Cultural/language review + adversarial + mobile testing pass.
- DNS verification and TLS deployment.
