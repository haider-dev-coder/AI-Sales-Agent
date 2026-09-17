from app.agent.nodes import detect_intent, detect_language, generate_response, qualify, retrieve
from app.agent.state import ChatMessage, SalesAgentState


class SalesAgentGraph:
    """Small deterministic graph wrapper; LangGraph can replace this orchestration later."""

    def run(self, conversation_id: str, message: str, history: list[ChatMessage] | None = None) -> SalesAgentState:
        state = SalesAgentState(conversation_id=conversation_id, messages=list(history or []))
        state.messages.append(ChatMessage(role="user", content=message))
        for node in [detect_language, detect_intent, retrieve, qualify, generate_response]:
            state = node(state)
        return state


agent_graph = SalesAgentGraph()
