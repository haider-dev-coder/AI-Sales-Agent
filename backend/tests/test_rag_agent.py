from app.agent.graph import agent_graph
from app.crawler.models import ParsedPage
from app.knowledge.ingestion import grounded_answer, ingest_pages


def test_ingestion_retrieval_and_sources() -> None:
    pages = [
        ParsedPage(
            url="https://example.com/services",
            canonical_url="https://example.com/services",
            title="Services",
            headings=["Analytics Consulting"],
            content="Analytics Consulting helps teams understand sales pipelines and customer behavior.",
            links=[],
            pricing=[],
            contacts={"emails": [], "phones": []},
            forms=[],
            page_type="service",
            js_heavy=False,
            summary="Analytics Consulting helps teams understand sales pipelines.",
        )
    ]
    chunks = ingest_pages(pages)
    answer = grounded_answer("What consulting is offered?", threshold=0.05)

    assert chunks[0].metadata["url"] == "https://example.com/services"
    assert answer["grounded"] is True
    assert answer["sources"][0]["url"] == "https://example.com/services"


def test_irrelevant_query_refuses_to_invent() -> None:
    answer = grounded_answer("Do they sell motorcycles?", threshold=0.9)

    assert answer["grounded"] is False
    assert "couldn't find enough information" in answer["answer"]


def test_agent_handoff_and_memory() -> None:
    state = agent_graph.run("conversation-1", "Can I speak with a human?")

    assert state.needs_human is True
    assert state.messages[-1].role == "assistant"
    assert "connect you" in state.response
