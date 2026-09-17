# Decisions

## Business Grounding

All business-specific facts must come from crawled website content. The app must not hardcode services, pricing, contact details, company policies, or recommendations.

## pgvector

PostgreSQL with pgvector keeps operational records and vector search in one database. This fits both local Docker and Supabase-compatible deployments. The production knowledge chunk table uses `vector(1536)` to match `text-embedding-3-small`.

## Local Embeddings

The current retriever uses deterministic hash embeddings so tests and local development work without API credentials. This is not a substitute for production semantic quality; it preserves the interface needed for OpenAI embeddings and pgvector.

## Retrieval Threshold

Production pgvector retrieval should use a conservative threshold around `0.75` after calibration with real embeddings. The local hash retriever uses a lower threshold because its scores are not comparable to OpenAI cosine similarity.

## Agent Runtime

The agent is split into explicit typed nodes rather than hidden prompt-only behavior. This keeps intent detection, retrieval, qualification, response generation, and handoff easy to test. LangGraph can replace the local graph runner later without changing the API surface.

## Model Fallback

The Gemini model name is resolved at runtime from an ordered candidate list (`gemini-flash-latest` → `gemini-3.6-flash` → `gemini-flash-lite-latest`) instead of a single pinned name. Provider model availability changed underneath the app: `gemini-2.5-flash`/`gemini-2.5-pro` return `404` for new API keys and `gemini-pro-latest` returns `429`, so a hardcoded name is not durable. The first candidate that succeeds wins.

## Knowledge Base Exclusion

Retrieval excludes `legal`, `account`, and `cart` pages entirely, and boosts product/service pages. Site chrome like privacy policies, login pages, and carts is crawlable but must never be presented as an answer to a sales question, and it must never be cited as a source.

## Chat Transport

The frontend uses WebSocket for token streaming but falls back to `POST /api/chat`. This gives a usable agent even when WebSockets are blocked, misrouted, or unavailable during Docker/local development. The socket contract is fixed at `/ws/chat/{session_id}`: the client sends `{"message": text}`; the server streams `{"type":"token"}` frames and ends the turn with a `{"type":"done","sources":[],"needs_human":bool,"session_id":...}` frame. A mismatched path or frame shape silently breaks the widget, so both ends are specified rather than inferred.

## HTTP 204 Responses

Every `DELETE` route that returns `204` uses `response_class=Response` and returns a bodiless `Response`. FastAPI asserts that a `204` response must not have a body, so declaring the status without removing the body crashes the request.

## Crawler Outputs

Crawler artifacts are written to `backend/app/crawler/output/` so API routes, frontend controls, and operator review use the same generated data.

Sitemap entries are deduplicated by URL at write time (`build_sitemap`), at read time (`GET /api/crawler/sitemap`), and again in the frontend `buildTree`. A page reachable from multiple crawl paths otherwise appears repeatedly, which produces duplicate React keys and breaks list rendering. Deduplicating at all three layers is intentional: it repairs existing artifacts and prevents regressions regardless of which layer is bypassed.

## Lead Scoring

Hot, Warm, and Cold scoring is deterministic for now. Signals include urgency, budget intent, service match, and contact completeness. This can later be calibrated against actual sales outcomes.

## Integrations

Cal.com, Mailjet, Google Sheets, and Supabase/PostgreSQL must be real end-to-end integrations when credentials are present. The app should fail clearly when credentials are missing instead of pretending a booking, email, CRM write, or sheet sync succeeded.

## Future Improvements

- Wire all API paths to repositories instead of in-memory stores (crawler jobs and conversations are persisted; some runtime paths still use memory)
- Replace local hash embeddings with Gemini/OpenAI embeddings plus pgvector search in production (a Gemini free-tier embedding quota of 1000 requests currently limits full-site re-embedding)
- Add LangGraph runtime orchestration
- Resolve the 15 pre-existing TypeScript errors in `ConversationPage.tsx`, `LeadsPage.tsx`, `ServicesPage.tsx`, and `WebsiteAnalytics.tsx`
- Add integration-specific retry dashboards
- Add authenticated admin access for the operator console
