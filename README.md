# ECHO — Personal Intelligence System

ECHO turns spoken (or typed) experiences into structured, searchable, interconnected personal
knowledge. You talk, ECHO transcribes **exactly what you said**, then (with Gemini configured)
extracts topics, people, commitments, problems and decisions — and connects every capture into
a growing brain map, a daily timeline, evidence-backed chat answers and personalized
improvement plans.

This is a complete, working hackathon prototype: real persistence, real extraction, real
retrieval — not a static mockup.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. A 4-step **onboarding wizard** greets first-time users (name,
goals, focus areas, language/timezone, and whether to start with sample data). The optional
**demo dataset** (fictional person, 6 days of internally consistent memories, always labeled
`demo`) makes the whole product — brain map, timeline, AI companion, insights, action center —
explorable immediately, with **no microphone and no API keys required**. Turn it off any time
in Settings and the app instantly shows only your own captures.

Production build:

```bash
npm run build
npm start
```

## What works without any configuration

- **Onboarding & profile** — name, goals, improvement areas, language and timezone power
  greetings, reflections and chat context. Editable in Settings; deletable (account + data)
  in the Danger zone.
- **Brain map** — interactive knowledge graph (React Flow) built from real stored records:
  memory nodes, person hubs, recurring-topic hubs, six relationship types
  (related to / caused by / followed by / contradicts / supports / shared topic), search,
  category filters, date ranges, click-through memory details, cross-day connections.
- **Timeline** — chronological day view with learning score, prev/next navigation, and
  full memory details (transcript, extracted fields, connected memories).
- **AI Companion** — retrieval-first question answering. Relevant memories are scored and
  retrieved before answering; answers cite memory IDs as clickable evidence chips and say
  "I don't have that" when the history doesn't contain an answer. Gemini (when configured)
  reasons over the same retrieved evidence; retrieval mode keeps working without a key.
- **Insights engine** — deterministic cross-day pattern detection computed **only from
  AI-verified memories** (recurring problems, open commitments, topic attention, learning
  momentum, goal consistency), generated daily/weekly reflections and an improvement plan
  whose actions are created as *suggestions* requiring approval. With fewer than three
  verified memories in a window, insights honestly report "not enough evidence".
- **Action Center** — approve/dismiss AI suggestions, add tasks, complete, due dates,
  overdue tracking, memory links.
- **Voice capture (Chromium browsers)** — uses the browser's on-device speech recognition
  (no API key) plus MediaRecorder chunked capture, with a live waveform, pause/resume and a
  **transcript review step** before saving: you can fix words before ECHO stores them.
- **Typed capture fallback** — same pipeline, clearly labeled.
- **Honest extraction status** — every memory is marked `Verified`, `Awaiting AI` or
  `Analysis failed`. Without a Gemini key, transcripts are stored verbatim and marked
  `Awaiting AI` — **nothing is inferred or invented**.
- **Data controls** — JSON export, transcript deletion, full erase, demo restore/clear,
  demo/real data separation, and full account deletion.

## What requires configuration

| Feature | Needs |
| --- | --- |
| Server-side audio transcription + extraction/chat reasoning | `GEMINI_API_KEY` (optionally `GEMINI_MODEL`, default `gemini-2.5-flash`) |
| PostgreSQL persistence + RLS | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |

Copy `.env.example` to `.env.local` and fill in what you have. Missing keys degrade
gracefully: capture still saves your words verbatim (marked `Awaiting AI`), and chat falls
back to extractive, evidence-citing answers built only from stored memories.

## Architecture

```
src/
  app/                    Next.js App Router (dashboard, brain, timeline, companion,
                          insights, actions, settings, onboarding) + API routes
    api/bootstrap         profile, flags, stats, score, topics, goals, insights
    api/profile           GET / PUT (onboarding + profile edit) / DELETE (account wipe)
    api/memories[/id]     list / detail with relationships and linked actions / delete
    api/graph             graph nodes+edges (filtered server-side)
    api/timeline          one day's memories + summary
    api/capture/audio     server transcription (Gemini-only; browser SR is primary)
    api/capture/save      save a user-reviewed transcript -> extraction -> persistence
    api/capture/text      typed capture -> extraction -> persistence
    api/chat              retrieval + evidence-backed answering (+ profile context)
    api/insights[/generate] computed signals, reflections, improvement plan
    api/actions[/id]      action item CRUD (suggestions require approval)
    api/settings          data retention + demo-mode toggles
    api/seed              demo reseed / clear
    api/data              JSON export (GET) / erase (DELETE)
  components/             AppShell (auth-less gate + profile chip), CapturePanel
                          (waveform, pause, transcript review), GraphCanvas,
                          MemoryDrawer, ui kit
  lib/
    types.ts              domain types (incl. ExtractionStatus, isDemo flags)
    store/local.ts        persistent JSON store (survives restarts)
    store/supabase.ts     Supabase PostgreSQL adapter (same interface)
    ingest.ts             capture orchestration (pending-first -> Gemini extract -> relate)
    extract.ts            relationship builder (shared topics; extraction is Gemini-only)
    gemini.ts             Gemini transcription/extraction/QA/reflection (strict JSON)
    qa.ts                 retrieval scoring + grounded answering
    insights.ts           pattern detection, daily score, improvement plan
    graph.ts              graph builder + deterministic force layout
    seed-data.ts          the fictional demo dataset (isDemo-labeled)
supabase/migrations/0001_init.sql          full schema, indexes, RLS policies
supabase/migrations/0002_profile_and_extraction.sql  profile + extraction/is_demo columns
```

**Storage:** with Supabase env vars set, all writes go to PostgreSQL (schema in
`supabase/migrations/`, row-level security keyed to `auth.uid()`). Without them, the same
repository interface persists to `data/echo-store.json` — real, durable writes, no hardcoded
frontend data as a source of truth.

**Privacy:** recording starts only on an explicit tap, shows a persistent REC indicator,
pauses/stops with the user, and always routes through a review step before saving. Raw audio
is not persisted by default (toggle in Settings). Transcripts can be deleted independently;
everything is exportable as JSON; one click deletes the account and all data.

## Honest limitations

- Single-user prototype (fixed identity; the profile is per-store). The Supabase schema
  already carries `user_id` + RLS for multi-user hardening.
- "24/7 background capture" is intentionally not implemented in a web prototype — capture
  runs only while the tab is open and always requires explicit activation.
- Without `GEMINI_API_KEY`, memories stay `Awaiting AI` and insights/chat run in
  retrieval-only mode over unstructured transcripts.
- Demo memories are fictional and always labeled `demo` — never presented as real
  recordings, and hidden the moment demo mode is switched off.
