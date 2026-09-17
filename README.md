# AI Sales Agent

A website-grounded AI sales representative. It crawls a configured business website, builds a local
knowledge base from that site, answers visitor questions with source-backed content, captures lead
qualification signals, supports human handoff, and exposes an operator console with crawler controls,
sitemap review, KPIs, and live chat.

The system never invents business facts. Services, pricing, contact details, and policies must originate
from the crawled website.

---

## Features

- **Grounded RAG chat** over WebSocket (streaming) with an HTTP fallback endpoint
- **Resilient LLM selection** — resolves a working Gemini model from an ordered candidate list
  (`gemini-flash-latest` → `gemini-3.6-flash` → `gemini-flash-lite-latest`)
- **Multi-provider embeddings** — OpenAI → Gemini → deterministic hash fallback for offline/dev use
- **Async website crawler** — sitemap discovery, `robots.txt` compliance, same-domain recursion,
  redirect handling, timeouts, rate limiting, URL normalization, and page-type classification
- **Answer-quality filtering** — `legal`, `account`, and `cart` pages are excluded from retrieval, while
  product/service pages receive a relevance boost
- **Lead pipeline** — deterministic scoring, temperature buckets, and assignment to sales reps
- **Operator console** — KPI cards, conversation viewer, lead details, appointments, analytics charts,
  crawler controls, sitemap tree, FAQs, services, follow-ups, and settings
- **Credential-gated integrations** — Cal.com scheduling, Mailjet email, and Google Sheets sync all
  surface configuration errors instead of faking success
- **PostgreSQL + pgvector** persistence with SQL migrations

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI, Uvicorn, Pydantic v2 / pydantic-settings |
| Agent | Deterministic node graph (`detect_language` → `detect_intent` → `retrieve` → `qualify` → `generate_response`) |
| Retrieval | Custom chunker, cleaner, and in-memory retriever with optional pgvector storage |
| Crawler | `httpx` + BeautifulSoup4 |
| Database | PostgreSQL 16 + pgvector, SQLAlchemy 2.0, psycopg 3 |
| Frontend | React 19, TypeScript 5, Vite 6, Recharts, lucide-react |
| Integrations | Cal.com API v2, Mailjet, Google Sheets (`gspread` / `google-auth`) |
| Tooling | pytest, ruff, Playwright (local QA scripts) |

---

## Repository Layout

```text
.
├── backend/
│   ├── app/
│   │   ├── agent/          # language/intent detection, retrieval, generation, handoff
│   │   ├── api/            # chat, crawl, dashboard, kb, leads, settings, websocket, ...
│   │   ├── crawler/        # crawler, parser, sitemap, URL manager, cache
│   │   ├── database/       # SQLAlchemy models, session, repositories
│   │   ├── integrations/   # calcom, mailjet, sheets, crm
│   │   ├── knowledge/      # cleaner, chunker, embeddings, ingestion, retriever
│   │   ├── leads/          # qualification, scoring, assignment
│   │   └── main.py         # FastAPI app, lifespan, router registration
│   ├── db/migrations/      # 002 → 011 SQL migrations
│   ├── crawler/output/     # generated crawl artifacts (git-ignored)
│   └── tests/              # pytest suites
├── frontend/
│   └── src/
│       ├── App.tsx         # operator console shell, routing, chat widget
│       └── components/     # one component per console page
├── docker/init-db.sql
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites

- Python **3.12+**
- Node.js **22+**
- Docker Desktop + Docker Compose (for the containerized path)
- PostgreSQL 16 with the `pgvector` extension (local non-Docker path)

---

## Configuration

Copy the template and fill in your values:

```powershell
cp .env.example .env
```

Settings are loaded from `backend/.env` and the repository-root `.env`
(see [`backend/app/config.py`](backend/app/config.py)). Unknown keys are ignored, so the root file is
the simplest place to keep everything.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TARGET_WEBSITE_URL` | Yes | Site to crawl and ground answers in (alias: `TARGET_WEBSITE`) |
| `DATABASE_URL` | Yes | `postgresql+psycopg://user:pass@host:5432/db` |
| `VITE_API_URL` | Yes | Backend base URL for the frontend (e.g. `http://127.0.0.1:8001`) |
| `CORS_ORIGINS` | Yes | JSON list of allowed frontend origins |
| `GEMINI_API_KEY` | For LLM answers | Google Gemini key |
| `GEMINI_MODEL` | No | Overrides the model candidate list |
| `OPENAI_API_KEY` | No | Enables the primary embedding provider |
| `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` | For booking | Cal.com scheduling |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL` | For email | Mailjet sending |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` | For sync | Google Sheets export |
| `CRAWL_MAX_PAGES`, `CRAWL_REQUEST_DELAY`, `CRAWL_TIMEOUT` | No | Crawler limits |

Secrets live only in `.env`. These files are git-ignored and must never be committed.

---

## Quick Start — Docker

```powershell
docker compose up --build
```

| Service | URL |
| --- | --- |
| Backend | http://localhost:8000/health |
| Frontend | http://localhost:5173 |
| PostgreSQL | `localhost:5432` (`ai_sales_agent`) |

Stop local dev servers first if ports `8000`, `5173`, or `5432` are already in use.

---

## Quick Start — Local (no Docker)

**Backend** (port `8001` to avoid clashing with other local services):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Helper scripts are provided: `backend/start_backend.ps1` and `backend/stop_backend.ps1`.

**Frontend:**

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Confirm `frontend/.env` contains `VITE_API_URL=http://127.0.0.1:8001`, then open
http://127.0.0.1:5173.

---

## API Reference

### System

- `GET /health`
- `WS /ws/chat/{session_id}`

### Chat

- `POST /api/chat`

### Crawler

- `POST /api/crawl`
- `POST /api/crawler/start`
- `GET /api/crawler/jobs`
- `GET /api/crawler/status/{job_id}`
- `GET /api/crawler/sitemap`
- `GET /api/crawler/sitemap.xml`
- `GET /api/crawler/pages`
- `GET /api/crawler/site-summary`
- `GET /api/crawler/config` / `PUT /api/crawler/config`
- `POST /api/crawler/rebuild-kb`

### Knowledge Base

- `POST /api/kb/build`
- `GET /api/kb/search?q=...`
- `GET /api/kb/chunks` / `GET /api/kb/chunks/{chunk_id}`
- `GET /api/kb/urls`
- `GET /api/kb/stats`
- `POST /api/kb/reindex`
- `POST /api/kb/recrawl?url=...`
- `DELETE /api/kb/chunks/{chunk_id}`

### Dashboard & Analytics

- `GET /api/dashboard/overview`
- `GET /api/analytics/overview?days=30`
- `GET /api/analytics/timeline?days=30`
- `GET /api/analytics/leads-by-temp?days=30`
- `GET /api/analytics/services?days=30`
- `GET /api/analytics/recent-activity?days=30`
- `GET /api/analytics/visitors?days=30`
- `GET /api/analytics/conversations`
- `GET /api/analytics/questions`
- `GET /api/analytics/leads`
- `GET /api/analytics/agent-performance`
- `GET /api/integrations/status`

### Leads, Conversations & Team

- `GET /api/leads` / `POST /api/leads`
- `GET /api/leads/{lead_id}` / `PATCH /api/leads/{lead_id}` / `DELETE /api/leads/{lead_id}`
- `GET /api/conversations` / `GET /api/conversations/{session_id}`
- `GET /api/sales-reps` / `POST /api/sales-reps` / `PATCH /api/sales-reps/{id}` / `DELETE /api/sales-reps/{id}`
- `GET /api/faqs` (+ `stats`, `categories`, `export`, `auto-surface`, `detect`, `POST`, `PATCH`, `DELETE`)
- `GET /api/services` / `POST /api/services` / `PATCH /api/services/{id}` / `DELETE /api/services/{id}`
- `GET /api/follow-ups` / `POST /api/follow-ups` / `PATCH /api/follow-ups/{id}` / `DELETE /api/follow-ups/{id}`

### Integrations

- `GET /api/cal/availability` / `POST /api/cal/book`
- `GET /api/cal/bookings` / `POST /api/cal/bookings/{id}/cancel` / `POST /api/cal/bookings/{id}/reschedule`
- `POST /api/mailjet/send` / `POST /api/mailjet/trigger`
- `GET /api/sheets/status` / `POST /api/sheets/sync` / `POST /api/sheets/sync-all`

### Settings

- `GET /api/settings` / `PUT /api/settings`

Secret values are returned masked (`••••••••••••`); a value left as the mask is not re-saved, so
untouched credentials are preserved.

---

## WebSocket Protocol

Connect to `ws://127.0.0.1:8001/ws/chat/{session_id}`.

1. Client sends `{"message": "<text>"}`
2. Server streams `{"type": "token", "token": "<piece>"}`
3. Server ends the turn with
   `{"type": "done", "sources": [...], "needs_human": <bool>, "session_id": "<id>"}`

The console's chat widget uses the socket first and falls back to `POST /api/chat` when it cannot be
established.

---

## Database Migrations

Migrations live in [`backend/db/migrations`](backend/db/migrations) and are applied in filename order.
`010_page_enhancements.sql` and `011_create_appointments.sql` are additionally applied automatically on
startup (idempotent, and a failure in one file cannot block the rest). The `app_settings` table is created
on demand.

```powershell
psql "$env:DATABASE_URL" -f backend/db/migrations/002_create_conversations.sql
# ...repeat for each file in order
```

`migrations_clean_no_vector.sql` is provided for environments without the `pgvector` extension.

---

## Testing

```powershell
cd backend
pytest tests/test_crawler.py tests/test_rag_agent.py -q
```

```powershell
cd frontend
npx tsc --noEmit
npm run build
```

Crawl artifacts are written to `backend/crawler/output/` (`pages.json`, `sitemap.json`, `sitemap.md`) and
are git-ignored because they are regenerated at runtime.

---

## Security

- `.env`, `.env.*`, `frontend/.env`, and `google-credentials.json` are git-ignored; only `.env.example`
  is tracked.
- No API keys are hardcoded in the backend or frontend. The console reads configuration from
  `GET /api/settings` at runtime.
- The backend refuses to fabricate integration results: missing credentials produce an explicit
  configuration error.
- Use a **private** repository if crawled site content or business configuration is confidential.

---

## Known Issues

- **Integrations page does not reflect real status.** `IntegrationSettings.tsx` initializes all providers
  to "Not configured" and never calls `GET /api/integrations/status`; it also renders placeholder provider
  details (sample sender addresses, fabricated "connected since" dates, and a placeholder webhook URL).
  `App.tsx` does consume the real endpoint correctly.
- **Stale model options in Settings.** The AI Agent dropdown lists `gemini-2.5-flash` / `gemini-2.5-pro`,
  which return `404` for newer API keys, and omits the working backend default `gemini-flash-latest`.
- **Supabase status mismatch.** `/api/integrations/status` reports `supabase` from `DATABASE_URL`
  (PostgreSQL), while the settings section exposes separate `supabase_url` / `supabase_key` values that
  are currently unused.
- **Hardcoded defaults.** `sales_reps` defaults to placeholder names in `backend/app/config.py`, and
  `agent_name` defaults to `"Ava"` in `backend/app/api/settings.py`.
- **15 pre-existing TypeScript errors** in `ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`,
  and `WebsiteAnalytics.tsx`.
- **Durable repository wiring is partial.** Not every API path persists through SQLAlchemy repositories
  yet; some routes read artifacts or in-memory state.
- **LangGraph orchestration is not installed** — the agent graph is a deterministic wrapper with
  compatible boundaries.
- The local hash embedding fallback is intended for development only, not production semantic quality.
- The Gemini free embedding tier is capped at 1000 requests and returns `429` when exhausted.

---

## Design Principle

All business-specific information must originate from the configured target website. The system must not
hardcode or invent services, pricing, contact information, policies, or recommendations.
