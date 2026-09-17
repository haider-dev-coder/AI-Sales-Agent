from dataclasses import dataclass, field


@dataclass(slots=True)
class ChatMessage:
    role: str
    content: str


@dataclass(slots=True)
class SalesAgentState:
    conversation_id: str
    messages: list[ChatMessage] = field(default_factory=list)
    language: str = "en"
    intent: str = "general"
    retrieved_context: list[dict[str, object]] = field(default_factory=list)
    lead_data: dict[str, object] = field(default_factory=dict)
    needs_human: bool = False
    handoff_reason: str | None = None
    response: str = ""
    sources: list[dict[str, object]] = field(default_factory=list)
    booking_requested: bool = False
    slots: list[dict[str, object]] = field(default_factory=list)
    booking: dict[str, object] = field(default_factory=dict)
