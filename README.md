# AI Sales Agent

AI Sales Agent is a website-grounded sales assistant for a configurable business site. It crawls the target website, builds a local knowledge base, answers visitor questions with source-grounded content, captures qualification signals, and exposes an operator console with crawler controls, sitemap review, KPIs, and chat.

## Current Capabilities

- FastAPI backend with health, crawler, KB, chat, lead, analytics, and WebSocket routes
- React/Vite frontend with a rebuilt dark glass dashboard, live API-backed KPI cards, conversation list, lead details, analytics charts, recent activity, and floating chat widget
- Async `httpx` and BeautifulSoup crawler with same-domain recursion, sitemap discovery, robots.txt checks, redirects, timeout handling, rate limiting, duplicate URL normalization, page-type classification (`legal`/`account`/`cart` detected and excluded from answers), and crawl artifact export with URL deduplication
- Local RAG pipeline with cleaning, chunking, deterministic local embeddings, top-k retrieval with a product/service page-type boost, source URLs, and refusal behavior when evidence is weak
- Typed sales-agent flow for language detection, intent detection, retrieval, response generation, qualification hints, and human handoff, with a resilient Gemini model candidate list (`gemini-flash-latest` → `gemini-3.6-flash` → `gemini-flash-lite-latest`)
- PostgreSQL/pgvector Docker service and SQL migrations for knowledge chunks, conversations, leads, email logs, and analytics events
- Credential-gated Cal.com, Mailjet, and Google Sheets clients that do not fake external success

## Prerequisites

- Python 3.12+
- Node.js 22+
- Docker Desktop and Docker Compose for the full stack

## Environment

Copy `.env.example` to `.env` and configure at least the target website and local dev URLs (for non-Docker local runs):

```powershell
cp .env.example .env
```

Supported variables for local development (non-Docker):

- `TARGET_WEBSITE_URL` (the site to crawl)
- `VITE_API_URL` (set to `http://127.0.0.1:8001` when running frontend locally)
- `CORS_ORIGINS` (include `http://127.0.0.1:5173` for the frontend dev server)

The crawler uses `TARGET_WEBSITE_URL`. Keep real API keys out of Git.

## Run With Docker

Start Docker Desktop first, then run:

```powershell
docker compose up --build
```

Backend:

```text
http://localhost:8000/health
```

Frontend:

```text
http://localhost:5173
```

If Docker reports that ports are already in use, stop local dev servers on `8000`, `5173`, `5174`, or `5175`.

Run Locally (without Docker)

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# Run backend on port 8001 to avoid conflicts with other local services
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend:

```powershell
cd frontend
npm install
# Ensure frontend/.env contains: VITE_API_URL=http://127.0.0.1:8001
npm run dev -- --host 127.0.0.1 --port 5173
# Open http://127.0.0.1:5173 in your browser
```

## Dashboard

The rebuilt dashboard is available from the frontend root:

```text
http://127.0.0.1:5173
```

It reads live data from:

- `GET /api/analytics/overview`
- `GET /api/analytics/timeline`
- `GET /api/analytics/leads-by-temp`
- `GET /api/analytics/services`
- `GET /api/analytics/recent-activity`
- `GET /api/integrations/status`
- `GET /api/leads`

The dashboard does not hardcode business metrics. Empty database tables render as zero counts or empty states.

## Crawler

Start an async crawl using the configured target website (local non-Docker):

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/api/crawler/start
```

Check status:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/crawler/status/{job_id}
```

Read the generated sitemap:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/crawler/sitemap
```

Crawler artifacts are written to:

- `backend/app/crawler/output/pages.json`
- `backend/app/crawler/output/sitemap.json`
- `backend/app/crawler/output/sitemap.md`

The older direct crawl route is also available:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/api/crawl -ContentType "application/json" -Body '{"website_url":"https://example.com","recrawl":true}'
```

## Knowledge Base

Build or rebuild the KB (local):

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/api/kb/build
```

Search:

```powershell
Invoke-RestMethod "http://127.0.0.1:8001/api/kb/search?q=services"
```

Stats:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/kb/stats
```

## Chat Agent

HTTP chat (local):

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8001/api/chat -ContentType "application/json" -Body '{"message":"What services do you offer?"}'
```

WebSocket chat (local):

```text
ws://127.0.0.1:8001/ws/chat/{session_id}
```

The frontend chat widget tries WebSocket first and falls back to `POST /api/chat` if the socket is blocked or unavailable.

WebSocket protocol:

- Client sends `{"message": "<text>"}`.
- Server streams `{"type":"token","token":"<piece>"}` frames as the answer is generated.
- Server terminates the turn with `{"type":"done","sources":[...],"needs_human":<bool>,"session_id":"<id>"}`.

Answers are grounded in crawled product/service content. Legal, account, and cart pages are excluded from retrieval, and the agent never lists people as "services".

## Leads And Analytics API

Lead routes:

- `GET /api/leads`
- `POST /api/leads`
- `GET /api/leads/{lead_id}`
- `PUT /api/leads/{lead_id}`
- `GET /api/leads/{lead_id}/conversation`

Analytics routes:

- `GET /api/analytics/overview`
- `GET /api/analytics/timeline`
- `GET /api/analytics/leads-by-temp`
- `GET /api/analytics/services`
- `GET /api/analytics/recent-activity`
- `GET /api/integrations/status`

Integration routes:

- `GET /api/cal/availability`
- `POST /api/cal/book`
- `POST /api/mailjet/send`
- `POST /api/mailjet/trigger`

## Database Migrations

Apply migrations in `backend/db/migrations` against the configured PostgreSQL database before running the full dashboard and lead flows. Migrations cover knowledge chunks, conversations, leads, email logs, analytics events, crawl jobs, page enhancements, and the `app_settings` table. The most recent additions are:

- `009_create_crawl_jobs.sql`
- `010_page_enhancements.sql`

## Verification

```powershell
cd backend
pytest tests/test_crawler.py tests/test_rag_agent.py -q
```

```powershell
cd frontend
npx tsc --noEmit
npm run build
```

Current verified state (after Phases 1–7):

- Live health: frontend `http://localhost:5173` → `200`; backend `http://127.0.0.1:8001/health` → `200`
- WebSocket `/ws/chat/{session_id}`: token frames streamed, followed by a terminal `done` frame, and the widget rendered the streamed answer
- HTTP `POST /api/chat` "What services do you offer?" → `200` with a grounded product answer (sources limited to product/search/collection pages; no legal pages, no rep names)
- Backend tests: `pytest tests/test_crawler.py` → 5 passed; `pytest tests/test_rag_agent.py` → 3 passed
- `GET /api/crawler/sitemap` → 30 unique entries, 0 duplicate URLs; no duplicate-key warnings in the browser console
- TypeScript: `npx tsc --noEmit` passes for the components touched by this work. 15 **pre-existing** errors remain in `ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`, and `WebsiteAnalytics.tsx` and are out of scope.
- Six `DELETE` routes (`faqs`, `services`, `leads`, `follow_ups`, `sales_reps`, `kb` chunks) return `204` correctly.

## Production Notes

The system does not invent business information. Services, pricing, contact details, policies, and recommendations must come from crawled website content. Live Cal.com, Mailjet, Supabase, and Google Sheets behavior requires real credentials and provider-side testing.
