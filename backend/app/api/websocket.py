# backend/app/api/websocket.py
# Realtime chat endpoint.
#
# Protocol contract (must match frontend/src/App.tsx ChatWidget):
#   client -> server : {"message": "<text>"}
#   server -> client : {"type": "token", "token": "<piece>"}   (one or more)
#                      {"type": "done", "sources": [...], "needs_human": bool,
#                       "session_id": "<id>"}                  (exactly one, ends the turn)
#
# The agent graph produces a complete answer (non-streaming), so we chunk the
# text into token frames to preserve the widget's incremental render, then send
# a terminal "done" frame carrying the turn metadata. On failure we emit a
# user-visible token followed by "done" so the widget never hangs in "typing".

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.graph import agent_graph
from app.services.conversation_service import load_history, save_history

logger = logging.getLogger(__name__)
router = APIRouter()

# Approximate characters per streamed token frame. Small enough to look
# incremental, large enough to avoid flooding the socket.
_TOKEN_CHUNK_SIZE = 24
# Tiny per-chunk delay so the browser paints progressively instead of once.
_TOKEN_DELAY_SECONDS = 0.015


def _chunk_text(text: str, size: int = _TOKEN_CHUNK_SIZE) -> list[str]:
    """Split text into pieces without dropping characters or leading spaces."""
    if not text:
        return []
    return [text[i : i + size] for i in range(0, len(text), size)]


async def _stream_response(websocket: WebSocket, text: str) -> None:
    for chunk in _chunk_text(text):
        await websocket.send_json({"type": "token", "token": chunk})
        if _TOKEN_DELAY_SECONDS:
            await asyncio.sleep(_TOKEN_DELAY_SECONDS)


@router.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    await websocket.accept()
    history = load_history(session_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except (TypeError, ValueError):
                logger.warning("Ignoring malformed WS payload for %s", session_id)
                continue

            message = (payload.get("message") or "").strip()
            if not message:
                continue

            try:
                state = agent_graph.run(
                    conversation_id=session_id,
                    message=message,
                    history=list(history),
                )
                history = state.messages
                save_history(session_id, history)

                await _stream_response(websocket, state.response)
                await websocket.send_json(
                    {
                        "type": "done",
                        "sources": state.sources,
                        "needs_human": state.needs_human,
                        "session_id": session_id,
                        "intent": state.intent,
                        "slots": state.slots,
                        "booking": state.booking,
                    }
                )
            except Exception as exc:  # keep the socket alive for the next turn
                logger.exception("WebSocket turn failed for %s: %s", session_id, exc)
                await _stream_response(
                    websocket,
                    "Sorry, something went wrong on our side. Please try again or share your email and we'll follow up.",
                )
                await websocket.send_json(
                    {"type": "done", "sources": [], "needs_human": True, "session_id": session_id}
                )
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("WebSocket error: %s", exc)
