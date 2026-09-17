# Project Context

## Objective

Build a generic AI-powered sales representative that can crawl a configured business website, build a knowledge base from that website, answer visitor questions with grounded source URLs, qualify leads, support human handoff, and connect to real CRM, calendar, email, and reporting systems when credentials are configured.

## Current Phase

Phases 1 through 7 are complete and verified for local operation. The chat pipeline (WebSocket + HTTP) streams grounded answers end-to-end, the RAG layer excludes non-answer pages and boosts product/service pages, the agent resolves a working Gemini model from a candidate list, `204` DELETE routes return bodiless responses, and the sitemap tree no longer produces duplicate keys. Lead scoring has a deterministic first pass. External integrations are credential-gated and must not fake success.

## Implemented

- FastAPI backend structure
- React and TypeScript Vite frontend
- Pydantic settings and `.env.example`
- Docker Compose for PostgreSQL/pgvector, backend, and frontend
- SQLAlchemy model definitions
- PostgreSQL/pgvector migration files
- `GET /health`
- Website crawler with URL normalization, same-domain filtering, sitemap discovery, robots.txt checks, redirects, timeout handling, rate limiting, per-page errors, duplicate handling, page-type classification (`legal`/`account`/`cart`), sitemap URL deduplication, parsing, and output artifacts
- Crawler API routes for start, status, sitemap, rebuild, and direct crawl
- Knowledge pipeline with content cleaning, chunking, multi-provider embeddings (OpenAI → Gemini → deterministic hash), in-memory retrieval, page-type exclusion (`legal`/`account`/`cart`) with a product/service boost, metadata, source URLs, top-k retrieval, and grounded refusal
- KB API routes for build, search, chunks, URLs, stats, reindex, and recrawl
- Typed sales-agent state with language detection, intent detection, retrieval, response generation, qualification hints, human handoff, and conversation memory
- Resilient Gemini model selection with an ordered candidate list (`gemini-flash-latest` → `gemini-3.6-flash` → `gemini-flash-lite-latest`)
- HTTP chat endpoint and WebSocket chat endpoint at `/ws/chat/{session_id}` with a token/`done` frame protocol
- Six `DELETE` routes returning bodiless `204` responses (`faqs`, `services`, `leads`, `follow_ups`, `sales_reps`, `kb` chunks)
- Frontend chat widget with WebSocket streaming and HTTP fallback
- Operator console with KPI cards, crawler controls, and a deduplicated sitemap tree
- Real-data pages for FAQs, Knowledge Base, Settings, Follow-ups, Services, Sitemap, Crawls, Leads, Appointments, and Analytics
- Deterministic lead scoring and simple assignment logic
- Credential-gated Cal.com, Mailjet, and Google Sheets clients
- Documentation files for README, design, decisions, progress, and context

## Important Endpoints

- `GET /health`
- `POST /api/crawl`
- `POST /api/crawler/start`
- `GET /api/crawler/status/{job_id}`
- `GET /api/crawler/sitemap`
- `POST /api/crawler/rebuild-kb`
- `POST /api/kb/build`
- `GET /api/kb/search?q=...`
- `GET /api/kb/chunks`
- `GET /api/kb/urls`
- `GET /api/kb/stats`
- `POST /api/chat`
- `ws://127.0.0.1:8001/ws/chat/{session_id}`
- `GET /api/analytics/overview`
- `GET /api/settings` / `PUT /api/settings`
- `GET /api/faqs` / `GET /api/follow-ups` / `GET /api/sales-reps`

## Current Limitations

- Full durable repository persistence is not wired for every API path yet.
- OpenAI/Gemini generation and embeddings require real API keys; the Gemini free embedding tier is capped at 1000 requests and returns `429` when exhausted.
- `gemini-2.5-flash`/`gemini-2.5-pro` return `404` for new API keys, so the agent relies on its model candidate list.
- LangGraph package runtime orchestration is not installed; the current graph is a deterministic wrapper with compatible boundaries.
- Cal.com, Mailjet, Google Sheets, and Supabase live behavior requires real credentials and provider-side testing.
- The local hash retriever is for development and testing, not production semantic quality.
- `npx tsc --noEmit` reports 15 pre-existing type errors in `ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`, and `WebsiteAnalytics.tsx`; these are out of scope for the chat-pipeline work.
- Browser MCP click/type actions time out against this app in the current environment (snapshots and console logs work); it is an extension limitation, not an app defect.

## Verification

Last verified (after Phases 1–7):

- Live health: frontend `http://localhost:5173` → `200`; backend `http://127.0.0.1:8001/health` → `200`
- WebSocket `/ws/chat/{session_id}`: token frames streamed, followed by a terminal `done` frame that the widget rendered
- HTTP `POST /api/chat`: `200` with a grounded product answer; sources limited to product/search/collection pages
- `pytest tests/test_crawler.py` → 5 passed; `pytest tests/test_rag_agent.py` → 3 passed
- `GET /api/crawler/sitemap` → 30 unique entries, 0 duplicate URLs
- `npx tsc --noEmit` → no errors in the components changed by this work (15 pre-existing errors elsewhere)

## Non-Negotiable Rule

All business-specific information must originate from the configured target website. The system must not hardcode or invent services, pricing, contact information, business policies, or recommendations.
