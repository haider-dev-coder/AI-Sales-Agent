# Changes

Changelog for the AI Sales Agent. Most recent work first.

## Chat pipeline hardening (Phases 1–7)

Fixed the "agent chat bot" end-to-end: the widget could not stream answers, retrieval returned unhelpful pages, several Gemini models 404'd, some DELETE routes crashed, and the sitemap tree logged duplicate-key errors.

### Phase 7 — End-to-end verification and sitemap dedupe

- Verified the full chat path: WebSocket `/ws/chat/{session_id}` streamed token frames and a terminal `done` frame, and `POST /api/chat` returned a grounded answer with product-only sources.
- Fixed duplicate React keys from duplicate sitemap URLs (`/account/login` appeared three times):
  - [backend/app/crawler/sitemap.py](backend/app/crawler/sitemap.py) — `build_sitemap` dedupes by URL when the artifact is written.
  - [backend/app/api/crawl.py](backend/app/api/crawl.py) — `GET /crawler/sitemap` dedupes on read so a stale file can never leak duplicates to the UI.
  - [frontend/src/components/SitemapPage.tsx](frontend/src/components/SitemapPage.tsx) — `buildTree` dedupes entries before building nodes.
- Regenerated [backend/crawler/output/sitemap.json](backend/crawler/output/sitemap.json): 32 → 30 entries, 0 duplicate URLs.
- Removed scratch diagnostics and one-off verification scripts.

### Phase 6 — HTTP 204 routes and cleanup

- Six DELETE routes declared `204` while returning a JSON body, which raises `AssertionError: Status code 204 must not have a response body`. Each now declares `status_code=204, response_class=Response` and returns a bodiless `Response`:
  - [backend/app/api/faqs.py](backend/app/api/faqs.py), [backend/app/api/services.py](backend/app/api/services.py), [backend/app/api/leads.py](backend/app/api/leads.py), [backend/app/api/follow_ups.py](backend/app/api/follow_ups.py), [backend/app/api/sales_reps.py](backend/app/api/sales_reps.py), [backend/app/api/kb.py](backend/app/api/kb.py).
- Re-verified all six routes return `204` with no body.

### Phase 5 — RAG answer quality

- [backend/app/crawler/parser.py](backend/app/crawler/parser.py): `classify_page` now detects `legal`, `account`, and `cart` pages via path needles, in addition to content/product/service types.
- [backend/app/knowledge/ingestion.py](backend/app/knowledge/ingestion.py): `EXCLUDED_PAGE_TYPES = {"legal", "account", "cart"}` keeps those pages out of answers; `grounded_answer` returns the retrieval `context` it actually used; `_PAGE_TYPE_BOOST` prioritises product/service pages.
- [backend/app/knowledge/retriever.py](backend/app/knowledge/retriever.py): `search(..., boost=...)` accepts the page-type boost.
- [backend/app/agent/prompts.py](backend/app/agent/prompts.py): rules 9/10 forbid citing legal/account/cart pages and forbid listing people as services.
- [backend/app/agent/nodes.py](backend/app/agent/nodes.py): `retrieve()` wires the grounded context into generation; `_services_from_crawl()` derives services from real product/service page titles.
- [backend/app/api/chat.py](backend/app/api/chat.py): `_ensure_kb_loaded` re-classifies and best-effort re-ingests the KB, returning grounded answers instead of 500s when the index is cold.

### Phase 4 — Gemini model names

- `gemini-2.5-flash` / `gemini-2.5-pro` return 404 for new API keys and `gemini-pro-latest` returns 429.
- [backend/app/agent/nodes.py](backend/app/agent/nodes.py): `_DEFAULT_GEMINI_MODEL = "gemini-flash-latest"`, `_FALLBACK_GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-flash-lite-latest"]`, resolved by `_gemini_model_candidates()`.
- Defaults updated in [backend/app/api/settings.py](backend/app/api/settings.py) and `.env` (`GEMINI_MODEL=models/gemini-flash-latest`).

### Phase 3 — WebSocket protocol alignment

- One protocol on `/ws/chat/{session_id}`: client sends `{"message": text}`; server streams `{"type":"token","token":"..."}` frames and ends with `{"type":"done","sources":[...],"needs_human":bool,"session_id":"..."}`.
- [frontend/src/App.tsx](frontend/src/App.tsx) (`ChatWidget`) appends tokens while streaming, closes on `done`, and falls back to `POST /api/chat` when the socket fails.

### Phase 2 — WebSocket route path mismatch

- The widget connected to `/ws/{session_id}`; the backend serves `/ws/chat/{session_id}` ([backend/app/api/websocket.py](backend/app/api/websocket.py)). The frontend now uses the real path.

### Phase 1 — Backend process hygiene

- Backend runs on `127.0.0.1:8001` from `backend/` via [backend/start_backend.ps1](backend/start_backend.ps1) / [backend/stop_backend.ps1](backend/stop_backend.ps1); the port is released before restart so a stale process cannot shadow the dev server.

## Earlier changes

- **Local non-Docker development.** Frontend `VITE_API_URL=http://127.0.0.1:8001`; backend CORS allows `127.0.0.1:5173` and validates origins on startup ([backend/app/config.py](backend/app/config.py), [backend/app/main.py](backend/app/main.py)). Docker Compose remains available but local defaults target port 8001.
- **Multi-provider embeddings.** [backend/app/knowledge/embeddings.py](backend/app/knowledge/embeddings.py) selects OpenAI → Gemini → deterministic hash, validates the provider at startup, and logs the active one; [backend/app/knowledge/retriever.py](backend/app/knowledge/retriever.py) uses the selected provider.
- **Cal.com / Appointments.** [backend/app/integrations/calcom.py](backend/app/integrations/calcom.py) rewritten for the Cal.com v2 API (`cal-api-version: 2024-08-13`): JSON-body reschedule, `attendee` booking payload, `POST /bookings/{id}/cancel`, `GET /v2/slots/available`. A JavaScript-syntax bug (`booking?.get(...)`) that prevented the whole app from importing was fixed. Frontend: shared [frontend/src/components/calcom.ts](frontend/src/components/calcom.ts) plus rebuilt `AppointmentsPage`/`AppointmentRow`.
- **Missing pages on real data.** FAQs, Knowledge Base, Settings, Follow-ups, Services, Sitemap, Crawls, and Leads read and write real database/API data through shared [frontend/src/components/apiClient.ts](frontend/src/components/apiClient.ts) and [frontend/src/components/ui.tsx](frontend/src/components/ui.tsx). Additive migration `010_page_enhancements.sql` adds `faqs.category`, `faqs.is_active`, `knowledge_chunks.status`, and the `app_settings` table, applied at startup.
- **Removed fake data.** Dashboard "Top Pages" and similar panels derive from API responses rather than hardcoded demo values.

## Run and verify (local, no Docker)

1. Backend on `127.0.0.1:8001`:

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

2. Frontend dev server (with `frontend/.env` containing `VITE_API_URL=http://127.0.0.1:8001`):

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

3. Checks:

```powershell
curl.exe -s -o nul -w "health:%{http_code}\n" http://127.0.0.1:8001/health
curl.exe -s -o nul -w "frontend:%{http_code}\n" http://localhost:5173
curl.exe -s -X POST -H "Content-Type: application/json" -d "{\"message\":\"What services do you offer?\",\"conversation_id\":\"smoke\"}" http://127.0.0.1:8001/api/chat
cd backend && pytest tests/test_crawler.py tests/test_rag_agent.py -q
cd frontend && npx tsc --noEmit
```

Expected: health/frontend `200`; `/api/chat` returns a grounded product answer with product/collection sources; crawler + RAG tests pass; `tsc` reports no errors for the files touched by this work (15 pre-existing errors remain in `ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`, `WebsiteAnalytics.tsx`).
