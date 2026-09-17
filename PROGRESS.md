# Progress

Status: **Phases 1–7 complete.** The agent chat pipeline (WebSocket + HTTP) is working end-to-end, the RAG answers are grounded, and the sitemap tree no longer produces duplicate React keys.

## Completed

### Chat pipeline hardening (Phases 1–7)

- **Phase 1 — Backend process hygiene.** The backend runs on `127.0.0.1:8001` from `backend/` (`python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001`), started via `start_backend.ps1` / `stop_backend.ps1`. Strays on the port are stopped before restart so the dev server is never shadowed by a stale process.
- **Phase 2 — WebSocket route path mismatch.** The frontend connected to `/ws/{session_id}` while the backend served the chat socket at **`/ws/chat/{session_id}`** (`backend/app/api/websocket.py`). The frontend now targets the real path; the socket no longer 403/404s.
- **Phase 3 — WebSocket protocol alignment.** The socket now speaks one protocol: the client sends `{"message": text}`, the server streams `{"type":"token","token":"..."}` frames and finishes with a terminal `{"type":"done","sources":[...],"needs_human":bool,"session_id":"..."}` frame. The widget appends tokens while streaming and closes on `done`. `POST /api/chat` remains as a fallback when the socket cannot be established.
- **Phase 4 — Gemini model names.** `gemini-2.5-flash` / `gemini-2.5-pro` returned 404 for new API keys and `gemini-pro-latest` returned 429. The agent now resolves a working model through an ordered candidate list — `gemini-flash-latest`, `gemini-3.6-flash`, `gemini-flash-lite-latest` — via `_gemini_model_candidates()` in `backend/app/agent/nodes.py`. The default model (`.env`, settings) is `models/gemini-flash-latest`.
- **Phase 5 — RAG answer quality.** The crawler now classifies pages (`legal`, `account`, `cart`, plus product/service/content types) in `backend/app/crawler/parser.py`. Those non-answer page types are excluded from retrieval (`EXCLUDED_PAGE_TYPES`), product/service pages get a retrieval boost, prompts forbid listing legal/account pages or people as "services", and the grounded answer returns its real retrieval context. `/api/chat` re-classifies and best-effort re-ingests the KB on startup so answers are grounded in the crawled site.
- **Phase 6 — HTTP 204 responses and artifact cleanup.** Six DELETE routes returned `204` with a body, which raises `AssertionError: Status code 204 must not have a response body`. They now declare `status_code=204, response_class=Response` and return a bodiless `Response` (`faqs.py`, `services.py`, `leads.py`, `follow_ups.py`, `sales_reps.py`, `kb.py`). Scratch diagnostics/scripts were deleted.
- **Phase 7 — End-to-end verification.** Verified the full path (see below) and fixed a real defect: `sitemap.json` contained duplicate URLs (e.g. `/account/login` three times), which produced duplicate React keys in the sitemap tree. Fixed at three layers — dedupe in `build_sitemap` (`backend/app/crawler/sitemap.py`), dedupe-on-read in `GET /api/crawler/sitemap` (`backend/app/api/crawl.py`), and dedupe in `buildTree` (`frontend/src/components/SitemapPage.tsx`) — and regenerated the artifact (32 → 30 entries, 0 duplicate URLs).

### Earlier work (still current)

- Scaffold: FastAPI + React/Vite + Docker Compose, pgvector service, configuration, health check, base tests.
- Crawler: async crawl flow, sitemap discovery, robots.txt checks, same-domain recursion, parsing, rate limiting, error capture, and output artifacts.
- Knowledge base and RAG: chunking, deterministic local embeddings, retrieval with source URLs, KB build/search/stats routes, pgvector migration.
- Agent: deterministic node flow (detect_language → detect_intent → retrieve → qualify → generate_response), qualification hints, human handoff, HTTP + WebSocket chat.
- Dashboard: dark glass UI with sidebar, live API KPI cards, conversation list, lead details, analytics charts, recent activity, floating chat widget.
- Pages: FAQs, Knowledge Base, Settings, Follow-ups, Services, Sitemap, Crawls, Leads, Appointments, Analytics rebuild on real database/API data.
- Integrations: Cal.com v2 booking flow (availability, book, reschedule, cancel), Mailjet email, Google Sheets.
- Local non-Docker dev: `VITE_API_URL=http://127.0.0.1:8001`, CORS for `127.0.0.1:5173`, and multi-provider embeddings (`OpenAIEmbeddingProvider` → `GeminiEmbeddingProvider` → deterministic `HashEmbeddingProvider` fallback).
- Migrations: knowledge chunks, conversations, leads, email logs, analytics events, crawl jobs, page enhancements, and `app_settings`.

## Verified

- Live health: frontend `http://localhost:5173` → 200, backend `http://127.0.0.1:8001/health` → 200.
- WebSocket chat (`/ws/chat/{session_id}`): 4 token frames streamed, then a terminal `done` frame (`sources: []`, `needs_human: false`), and the widget rendered the streamed bubble.
- HTTP chat: `POST /api/chat` with "What services do you offer?" → 200 with a grounded Trailblaze product answer (obstacle/climbing, slackline, kicking tees); sources limited to product/search/collection pages — no legal pages, no rep names.
- Backend tests: `pytest tests/test_crawler.py` → 5 passed; `pytest tests/test_rag_agent.py` → 3 passed.
- Crawler output: `GET /api/crawler/sitemap` → 30 unique entries, 0 duplicate URLs; console is free of duplicate-key warnings.
- TypeScript: `npx tsc --noEmit` passes for `SitemapPage.tsx`. 15 **pre-existing** errors remain in unrelated components (`ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`, `WebsiteAnalytics.tsx`) and were intentionally left untouched as out of scope.

## Credential-Gated (not faked)

These paths surface configuration errors rather than fabricated results:

- Gemini generation and embeddings require `GOOGLE_API_KEY`/`GEMINI_API_KEY` (the free embedding tier is capped at 1000 requests and returns 429 when exhausted).
- OpenAI embeddings/generation require `OPENAI_API_KEY`.
- Cal.com availability and booking require Cal.com credentials.
- Mailjet sending requires credentials and a verified sender.
- Google Sheets sync requires a service account JSON and sheet ID.
- Durable Postgres/pgvector persistence requires migrations applied and repository wiring on every runtime path.

## Environment Note

Browser MCP `browser_click`/`browser_type` calls time out against the app (extension connects, snapshots and console logs work). This is an extension limitation in this environment, not an application defect; the chat pipeline was therefore verified with direct WebSocket/HTTP checks plus console-log inspection.
