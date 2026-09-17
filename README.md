# AI Sales Agent

> A website-grounded AI sales representative that turns a business website into an interactive sales and lead-qualification system.

AI Sales Agent is an AI-powered sales assistant designed to help businesses engage website visitors, answer questions using information from their website, qualify potential leads, and hand conversations over to human sales representatives when required.

The platform crawls a configured business website, builds a searchable knowledge base, retrieves relevant information during conversations, and generates responses grounded in the available website content.

It also provides an operator dashboard for managing crawls, knowledge, conversations, leads, sales representatives, appointments, analytics, FAQs, services, and integrations.

---

## Overview

Traditional website chatbots often depend on manually maintained FAQs or generic LLM knowledge. AI Sales Agent takes a different approach:

```text
                    Business Website
                           │
                           ▼
                    Website Crawler
                           │
                           ▼
                  Content Processing
                    │            │
                    ▼            ▼
                 Chunking     Cleaning
                    │            │
                    └──────┬─────┘
                           ▼
                    Knowledge Base
                           │
                           ▼
                      Retrieval
                           │
                           ▼
                    AI Sales Agent
                    │      │      │
                    ▼      ▼      ▼
                  Answer  Qualify  Handoff
                    │      │      │
                    ▼      ▼      ▼
                 Visitor  Lead  Sales Rep
```

Business-specific responses are designed to be grounded in information retrieved from the configured website rather than relying on unsupported assumptions.

---

## Key Features

### AI Sales Chat

* Website-grounded RAG-based conversations
* WebSocket streaming for real-time responses
* HTTP fallback when WebSocket connectivity is unavailable
* Session-based conversation handling
* Source-aware responses
* Language detection
* Intent detection
* Lead qualification
* Human handoff support

### Website Crawler

* Configurable target website
* Sitemap discovery
* `robots.txt` compliance
* Same-domain recursive crawling
* Redirect handling
* URL normalization
* Request timeouts
* Rate limiting
* Page-type classification
* Crawl job tracking
* Sitemap inspection
* Configurable crawl limits

### Knowledge Base & Retrieval

* HTML cleaning and content extraction
* Custom content chunking
* Multi-provider embeddings
* OpenAI embedding support
* Gemini embedding support
* Deterministic hash-based fallback for development
* Reindexing support
* URL-level knowledge inspection
* Chunk-level inspection and management
* Relevance filtering
* Product and service page relevance boosting

Certain page types, including legal, account, and cart pages, are excluded from normal retrieval to reduce irrelevant context.

### Lead Management

* Lead capture
* Qualification signals
* Deterministic lead scoring
* Temperature classification
* Sales representative assignment
* Lead detail management
* Follow-up management

### Operator Console

The web dashboard provides tools for:

* Dashboard KPIs
* Conversations
* Leads
* Appointments
* Analytics
* Website crawling
* Sitemap review
* Knowledge Base
* FAQs
* Services
* Sales representatives
* Follow-ups
* Settings
* Integration status

### Integrations

Credential-gated integrations are available for:

* Cal.com scheduling
* Mailjet email
* Google Sheets synchronization

The system reports configuration errors when required credentials are unavailable rather than presenting unsuccessful operations as completed.

---

## Architecture

The application is divided into a FastAPI backend and a React-based operator console.

```text
┌─────────────────────────────────────────────┐
│                 Frontend                    │
│          React + TypeScript + Vite          │
│                                             │
│ Dashboard │ Chat │ Leads │ Analytics       │
│ Crawler   │ KB   │ FAQs  │ Settings        │
└──────────────────────┬──────────────────────┘
                       │ REST / WebSocket
                       ▼
┌─────────────────────────────────────────────┐
│                  Backend                    │
│                 FastAPI                    │
│                                             │
│ API Layer                                   │
│ ├── Chat                                    │
│ ├── Crawler                                 │
│ ├── Knowledge Base                          │
│ ├── Leads                                   │
│ ├── Analytics                               │
│ ├── Dashboard                               │
│ └── Integrations                            │
│                                             │
│ Agent Pipeline                              │
│ detect_language                             │
│       ↓                                     │
│ detect_intent                               │
│       ↓                                     │
│ retrieve                                    │
│       ↓                                     │
│ qualify                                     │
│       ↓                                     │
│ generate_response                           │
└──────────────────────┬──────────────────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
     PostgreSQL     pgvector     External APIs
                                   │
                         ┌─────────┼─────────┐
                         ▼         ▼         ▼
                       Cal.com  Mailjet  Google Sheets
```

---

## Agent Pipeline

The current agent uses a deterministic node-based pipeline with clearly separated responsibilities:

```text
User Message
     │
     ▼
Language Detection
     │
     ▼
Intent Detection
     │
     ▼
Knowledge Retrieval
     │
     ▼
Lead Qualification
     │
     ▼
Response Generation
     │
     ├──► Answer Visitor
     │
     └──► Request Human Handoff
```

This separation makes the system easier to test, debug, and extend with additional agent capabilities.

---

## Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| Backend          | FastAPI, Uvicorn, Pydantic v2, pydantic-settings   |
| AI Agent         | Python-based deterministic node pipeline           |
| LLM              | Google Gemini                                      |
| Retrieval        | Custom chunker, cleaner, embeddings, and retriever |
| Embeddings       | OpenAI, Gemini, deterministic development fallback |
| Crawler          | HTTPX, BeautifulSoup4                              |
| Database         | PostgreSQL 16                                      |
| Vector Search    | pgvector                                           |
| ORM              | SQLAlchemy 2.0                                     |
| Database Driver  | psycopg 3                                          |
| Frontend         | React 19, TypeScript 5, Vite 6                     |
| UI / Charts      | Recharts, Lucide React                             |
| Scheduling       | Cal.com API v2                                     |
| Email            | Mailjet                                            |
| Spreadsheet Sync | gspread, Google Auth                               |
| Testing          | pytest, TypeScript compiler                        |
| Browser QA       | Playwright                                         |
| Containerization | Docker, Docker Compose                             |

---

## Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   └── Agent pipeline and response generation
│   │   ├── api/
│   │   │   └── REST and WebSocket endpoints
│   │   ├── crawler/
│   │   │   └── Crawler, sitemap, parsing, URL management
│   │   ├── database/
│   │   │   └── Models, sessions, repositories
│   │   ├── integrations/
│   │   │   └── Cal.com, Mailjet, Google Sheets, CRM
│   │   ├── knowledge/
│   │   │   └── Cleaning, chunking, embeddings, retrieval
│   │   ├── leads/
│   │   │   └── Qualification, scoring, assignment
│   │   └── main.py
│   │
│   ├── db/
│   │   └── migrations/
│   │
│   ├── crawler/
│   │   └── output/
│   │
│   └── tests/
│
├── frontend/
│   └── src/
│       ├── App.tsx
│       └── components/
│
├── docker/
│   └── init-db.sql
│
├── docker-compose.yml
├── .env.example
└── README.md
```

Generated crawler artifacts are stored under `backend/crawler/output/` and are excluded from version control because they are regenerated at runtime.

---

## Prerequisites

### Required

* Python 3.12+
* Node.js 22+
* PostgreSQL 16
* `pgvector` PostgreSQL extension

### Docker Development

For the containerized setup:

* Docker Desktop
* Docker Compose

---

# Getting Started

## 1. Clone the Repository

```bash
git clone https://github.com/haider-dev-coder/AI-Sales-Agent.git
cd AI-Sales-Agent
```

## 2. Configure Environment Variables

Copy the example configuration:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your configuration.

> Never commit `.env` files or production credentials to the repository.

---

# Docker Setup

Start the complete application:

```bash
docker compose up --build
```

The default services are:

| Service      | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:5173        |
| Backend      | http://localhost:8000        |
| Health Check | http://localhost:8000/health |
| PostgreSQL   | localhost:5432               |

If these ports are already in use, stop the conflicting services or update the Docker configuration.

---

# Local Development

## Backend

Create and activate a Python virtual environment:

```bash
cd backend
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

The backend will be available at:

```text
http://127.0.0.1:8001
```

Helper scripts are also available:

```text
backend/start_backend.ps1
backend/stop_backend.ps1
```

## Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Configure:

```text
VITE_API_URL=http://127.0.0.1:8001
```

Then open:

```text
http://127.0.0.1:5173
```

---

# Configuration

The application supports configuration through environment variables.

| Variable                      | Required         | Purpose                                      |
| ----------------------------- | ---------------- | -------------------------------------------- |
| `TARGET_WEBSITE_URL`          | Yes              | Website used as the primary knowledge source |
| `DATABASE_URL`                | Yes              | PostgreSQL connection string                 |
| `VITE_API_URL`                | Yes              | Backend URL used by the frontend             |
| `CORS_ORIGINS`                | Yes              | Allowed frontend origins                     |
| `GEMINI_API_KEY`              | For AI responses | Google Gemini API key                        |
| `GEMINI_MODEL`                | No               | Optional Gemini model override               |
| `OPENAI_API_KEY`              | No               | Enables OpenAI embeddings                    |
| `CALCOM_API_KEY`              | For booking      | Cal.com API authentication                   |
| `CALCOM_EVENT_TYPE_ID`        | For booking      | Cal.com event type                           |
| `MAILJET_API_KEY`             | For email        | Mailjet API authentication                   |
| `MAILJET_SECRET_KEY`          | For email        | Mailjet API secret                           |
| `MAILJET_FROM_EMAIL`          | For email        | Sender email                                 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For Sheets       | Google service account configuration         |
| `GOOGLE_SHEET_ID`             | For Sheets       | Destination spreadsheet                      |
| `CRAWL_MAX_PAGES`             | No               | Maximum pages per crawl                      |
| `CRAWL_REQUEST_DELAY`         | No               | Delay between crawler requests               |
| `CRAWL_TIMEOUT`               | No               | HTTP request timeout                         |

Secrets should remain in `.env`, which is excluded from version control.

---

# Website Crawling

The system can crawl a configured website and use the resulting content to build its knowledge base.

The crawler supports:

* Sitemap discovery
* `robots.txt`
* Same-domain crawling
* Recursive URL discovery
* Redirect handling
* URL normalization
* Request timeouts
* Rate limiting
* Page classification
* Crawl job tracking

The crawl process can be initiated through the operator console or API.

The crawler generates runtime artifacts such as:

```text
backend/crawler/output/
├── pages.json
├── sitemap.json
└── sitemap.md
```

These files are regenerated and therefore are not committed to the repository.

---

# API Reference

## System

```text
GET /health
WS  /ws/chat/{session_id}
```

## Chat

```text
POST /api/chat
```

## Crawler

```text
POST /api/crawl
POST /api/crawler/start
GET  /api/crawler/jobs
GET  /api/crawler/status/{job_id}
GET  /api/crawler/sitemap
GET  /api/crawler/sitemap.xml
GET  /api/crawler/pages
GET  /api/crawler/site-summary
GET  /api/crawler/config
PUT  /api/crawler/config
POST /api/crawler/rebuild-kb
```

## Knowledge Base

```text
POST   /api/kb/build
GET    /api/kb/search?q=...
GET    /api/kb/chunks
GET    /api/kb/chunks/{chunk_id}
GET    /api/kb/urls
GET    /api/kb/stats
POST   /api/kb/reindex
POST   /api/kb/recrawl?url=...
DELETE /api/kb/chunks/{chunk_id}
```

## Dashboard & Analytics

```text
GET /api/dashboard/overview

GET /api/analytics/overview?days=30
GET /api/analytics/timeline?days=30
GET /api/analytics/leads-by-temp?days=30
GET /api/analytics/services?days=30
GET /api/analytics/recent-activity?days=30
GET /api/analytics/visitors?days=30
GET /api/analytics/conversations
GET /api/analytics/questions
GET /api/analytics/leads
GET /api/analytics/agent-performance
GET /api/integrations/status
```

## Leads & Conversations

```text
GET    /api/leads
POST   /api/leads
GET    /api/leads/{lead_id}
PATCH  /api/leads/{lead_id}
DELETE /api/leads/{lead_id}

GET /api/conversations
GET /api/conversations/{session_id}
```

## Sales Representatives

```text
GET    /api/sales-reps
POST   /api/sales-reps
PATCH  /api/sales-reps/{id}
DELETE /api/sales-reps/{id}
```

## FAQs & Services

```text
GET    /api/faqs
GET    /api/faqs/stats
GET    /api/faqs/categories
GET    /api/faqs/export
GET    /api/faqs/auto-surface
GET    /api/faqs/detect
POST   /api/faqs
PATCH  /api/faqs/{id}
DELETE /api/faqs/{id}

GET    /api/services
POST   /api/services
PATCH  /api/services/{id}
DELETE /api/services/{id}
```

## Follow-ups

```text
GET    /api/follow-ups
POST   /api/follow-ups
PATCH  /api/follow-ups/{id}
DELETE /api/follow-ups/{id}
```

## Integrations

```text
GET  /api/cal/availability
POST /api/cal/book
GET  /api/cal/bookings
POST /api/cal/bookings/{id}/cancel
POST /api/cal/bookings/{id}/reschedule

POST /api/mailjet/send
POST /api/mailjet/trigger

GET  /api/sheets/status
POST /api/sheets/sync
POST /api/sheets/sync-all
```

## Settings

```text
GET /api/settings
PUT /api/settings
```

Sensitive configuration values are masked when returned by the settings API.

---

# WebSocket Protocol

The chat interface primarily uses WebSocket communication for streaming responses.

Connect using:

```text
ws://127.0.0.1:8001/ws/chat/{session_id}
```

### Client Message

```json
{
  "message": "What services do you provide?"
}
```

### Streaming Response

```json
{
  "type": "token",
  "token": "We"
}
```

### Completed Response

```json
{
  "type": "done",
  "sources": [],
  "needs_human": false,
  "session_id": "..."
}
```

If the WebSocket connection cannot be established, the frontend falls back to:

```text
POST /api/chat
```

---

# Database

The application uses:

* PostgreSQL 16
* pgvector
* SQLAlchemy 2.0
* psycopg 3

Database migrations are located at:

```text
backend/db/migrations/
```

Migrations are applied in filename order.

The project also includes a migration configuration for environments where the `pgvector` extension is unavailable.

---

# Testing

## Backend

Run the crawler and RAG tests:

```bash
cd backend
pytest tests/test_crawler.py tests/test_rag_agent.py -q
```

## Frontend Type Checking

```bash
cd frontend
npx tsc --noEmit
```

## Frontend Production Build

```bash
npm run build
```

---

# Security

The project follows several security-oriented practices:

* Environment files are excluded from Git.
* API credentials are not hardcoded.
* Only `.env.example` is tracked.
* Google service-account credentials are excluded.
* Integration failures are surfaced instead of being represented as successful operations.
* Sensitive settings are masked in API responses.
* Production deployments should use HTTPS, secure secrets management, restricted CORS origins, and appropriate authentication/authorization.

> If the crawled website contains confidential or proprietary information, use a private repository and appropriate access controls.

---

# Current Limitations

The project is actively evolving. Current limitations include:

* Some API functionality still uses a combination of persistent database storage and runtime/in-memory state.
* The deterministic hash embedding fallback is intended for development and testing rather than production semantic search.
* External integrations require their respective credentials and configuration.
* LLM and embedding providers may impose usage limits and rate limits.
* Some dashboard functionality is still being refined as the platform evolves.

---

# Design Principles

### Website-Grounded Information

Business-specific information should originate from the configured website and retrieved knowledge rather than being manually hardcoded into the agent.

### Explicit Integration State

External integrations should report configuration or execution failures rather than presenting simulated success.

### Modular Architecture

Crawler, retrieval, agent, lead management, API, database, and frontend responsibilities are separated to make the system easier to maintain and extend.

### Human Handoff

AI should support sales teams rather than prevent human involvement. Conversations can be escalated when human assistance is required.

### Development Transparency

The project documents its architecture, limitations, and configuration requirements so that developers can understand and reproduce the system.

---

# Future Development

Potential areas for continued development include:

* More robust persistent repository coverage
* Improved embedding and retrieval strategies
* Expanded LLM provider support
* Advanced lead qualification models
* More integration providers
* Improved authentication and role-based access control
* Production deployment configuration
* Automated end-to-end testing
* Website chat-widget installation and deployment tooling

---

# Project Status

AI Sales Agent is a full-stack AI application demonstrating how website crawling, retrieval-augmented generation, lead qualification, real-time chat, analytics, and business integrations can be combined into a single sales automation platform.

The repository is intended for development, experimentation, and further production hardening.

---

# License

Add your chosen open-source license here.

For example:

```text
MIT License
```

if you intend to allow broad reuse of the project under the MIT terms.

---

## Author

**Haider Fareed**

Full Stack Developer | AI/ML Engineer

* GitHub: https://github.com/haider-dev-coder
* Portfolio: https://haider-fareed.vercel.app/
* LinkedIn: https://www.linkedin.com/in/haider-fareed/
