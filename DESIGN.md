# AI Sales Agent Design

## Scope

The project is a modular monolith with a FastAPI backend, React/Vite frontend, PostgreSQL/pgvector database target, crawler, local RAG pipeline, deterministic agent graph, and credential-gated integration clients.

## Backend

FastAPI exposes these main surfaces:

- `GET /health`
- `POST /api/crawl`
- `POST /api/crawler/start`
- `GET /api/crawler/status/{job_id}`
- `GET /api/crawler/sitemap`
- `POST /api/crawler/rebuild-kb`
- `POST /api/kb/build`
- `GET /api/kb/search`
- `GET /api/kb/stats`
- `POST /api/chat`
- `ws://127.0.0.1:8001/ws/chat/{session_id}`
- Lead and analytics routes for dashboard data

Routes that return `204` (the six `DELETE` endpoints for FAQs, services, leads, follow-ups, sales reps, and KB chunks) declare `response_class=Response` and return a bodiless `Response`, since FastAPI asserts that a `204` response must not carry a body.

Configuration is centralized in `backend/app/config.py` with Pydantic Settings. Local development accepts both `TARGET_WEBSITE_URL` and `TARGET_WEBSITE`, plus both `CRAWL_REQUEST_DELAY` and `CRAWL_DELAY`.

## Crawler

The crawler uses `httpx` and BeautifulSoup. It starts from the configured base URL, adds URLs from `/sitemap.xml`, follows same-domain links recursively, respects robots.txt, follows redirects, handles 404s/timeouts, normalizes query strings and trailing slashes, rate-limits requests, and continues after per-page errors.

Extracted page data includes:

- URL and canonical URL
- title
- h1-h3 headings
- body text
- pricing-like strings
- contact emails and phone numbers
- form actions
- page type
- depth and parent URL

### Page-type classification

`classify_page` in `backend/app/crawler/parser.py` assigns each page a type. Path-needle matching runs first and labels non-answer pages:

- `legal` — privacy, terms, cookies, policy
- `account` — login, signup, register, account
- `cart` — cart, checkout, basket

The remaining pages are classified by content and title into product/service, collection/search, and content types. This type is the signal the retrieval layer uses to keep marketing/transactional chrome out of answers.

### Sitemap deduplication

A single page can be reached from multiple crawl paths, so the same URL may appear more than once. `build_sitemap` deduplicates by URL when writing the artifact, and `GET /api/crawler/sitemap` deduplicates on read so a stale file can never leak duplicates. The frontend `buildTree` deduplicates again as a defensive measure. Duplicate URLs would otherwise become duplicate React keys in the sitemap tree.

Generated artifacts live in `backend/app/crawler/output/`.

## Knowledge Base

The local KB pipeline cleans crawled content, creates paragraph-aware chunks, attaches metadata, embeds chunks with the selected embedding provider, and stores them in an in-memory retriever for local testing. Chunks are also persisted to the `knowledge_chunks` table so the KB page has a real source of truth.

Embedding providers are selected in priority order: `OpenAIEmbeddingProvider` (when `OPENAI_API_KEY` is set) → `GeminiEmbeddingProvider` (when `GOOGLE_API_KEY`/`GEMINI_API_KEY` is set) → `HashEmbeddingProvider`, a deterministic local fallback. The chosen provider is validated at startup with a test `embed("test")` call and logged, and it degrades to the hash provider if a remote call fails.

Chunk metadata includes:

- source URL
- page type
- page title
- page ID
- website ID

### Page-type exclusion and boost

Retrieval is page-type aware (`backend/app/knowledge/ingestion.py`):

- `EXCLUDED_PAGE_TYPES = {"legal", "account", "cart"}` — those chunks are never returned as evidence, so privacy policies, login pages, and carts cannot be cited as answers.
- `_PAGE_TYPE_BOOST` — product/service pages receive a score boost so commercial content outranks generic copy for the same query.
- The retriever's `search(..., boost=...)` applies that boost after cosine similarity.
- `grounded_answer` returns the retrieval `context` it actually used, so the answer's grounding is inspectable.

The pgvector production schema is defined in `backend/db/migrations/001_create_knowledge_chunks.sql` with `vector(1536)` for `text-embedding-3-small` compatibility.

## Agent

The agent is organized as typed deterministic nodes:

- language detection
- intent detection
- retrieval
- qualification extraction
- response generation
- human handoff flagging

Generation uses the Google GenAI SDK with a resilient model candidate list — `gemini-flash-latest` → `gemini-3.6-flash` → `gemini-flash-lite-latest` (`_gemini_model_candidates()` in `backend/app/agent/nodes.py`). This exists because `gemini-2.5-flash`/`gemini-2.5-pro` return `404` for new API keys and `gemini-pro-latest` returns `429`; the first candidate that succeeds is used.

Prompt rules forbid citing legal/account/cart pages and forbid listing people (e.g. sales reps) as services. Services are derived from real crawled product/service page titles (`_services_from_crawl`).

The graph wrapper is intentionally simple so a LangGraph runtime can replace orchestration later without changing API contracts.

## Frontend

The frontend is a Vite React app. The main screen is an operator console, not a marketing landing page. It contains KPI cards, crawler controls, sitemap preview, and a floating chat widget.

The chat widget:

- stores `session_id` in localStorage (`ai-sales-session-id`)
- connects to `ws://<backend>/ws/chat/{session_id}`
- sends `{"message": text}` and appends `{"type":"token"}` frames as they stream
- closes the turn on the terminal `{"type":"done","sources":[...],"needs_human":bool,"session_id":...}` frame
- falls back to `POST /api/chat` if WebSocket fails
- works across common local dev ports through backend CORS configuration

The sitemap page builds a tree from `GET /api/crawler/sitemap` and deduplicates entries before constructing nodes so each URL appears exactly once.

## Database

Docker Compose starts PostgreSQL with pgvector. SQL migrations are provided for:

- knowledge chunks
- conversations
- leads
- email logs
- analytics events
- crawl jobs
- page enhancements (`faqs.category`, `faqs.is_active`, `knowledge_chunks.status`, the `app_settings` table)

The current app still uses local/in-memory paths for some runtime behavior. The migrations define the intended durable production schema.

## Integrations

Cal.com, Mailjet, and Google Sheets integration boundaries exist and are credential-gated. They must raise clear configuration errors when credentials are absent and must not fake success.

## Grounding Rules

- Do not hardcode company names, services, pricing, contact details, policies, or URLs.
- Do not fake external integrations.
- Do not invent business information.
- Answer from crawled KB content when evidence exists.
- Never cite legal/account/cart pages, and never list people as "services".
- If evidence is weak or missing, offer human handoff.
- Keep source URLs attached to crawled pages, chunks, and answers.
