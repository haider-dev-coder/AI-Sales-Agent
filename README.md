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

## Author

**Haider Fareed**

Full Stack Developer | AI/ML Engineer

* GitHub: https://github.com/haider-dev-coder
* Portfolio: https://haider-fareed.vercel.app/
* LinkedIn: https://www.linkedin.com/in/haider-fareed/
