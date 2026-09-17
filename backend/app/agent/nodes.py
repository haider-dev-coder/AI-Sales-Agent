import asyncio
import concurrent.futures
import json
import os
import re
import random
from pathlib import Path
from typing import Any

from app.agent.prompts import FALLBACK_PROMPT, GREETING_RESPONSES, SALES_ASSISTANT_PROMPT
from app.agent.state import ChatMessage, SalesAgentState
from app.agent.tools import request_human_handoff, search_knowledge_base
from app.config import get_settings
from app.database.models import Website
from app.database.session import SessionLocal
from app.services.lead_service import EMAIL_RE, PHONE_RE, capture_lead, extract_lead_data, lead_confirmation

import logging

logger = logging.getLogger(__name__)

# Valid, generateContent-capable Gemini models (verified via ListModels + live
# generateContent probes for the configured API key). Note: gemini-2.5-* now
# returns 404 for new-user keys. The configured GEMINI_MODEL is always tried
# first; these are ordered fallbacks for when it is unset or unavailable.
_DEFAULT_GEMINI_MODEL = "gemini-flash-latest"
_FALLBACK_GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-flash-lite-latest"]

GREETING_PATTERNS = [
    r"^\s*(hi|hello|hey|howdy|greetings|good\s+(morning|afternoon|evening))\b",
    r"^\s*(hiya|heya|what'?s\s+up|how\s+are\s+you)\b",
]

# Words that legitimately appear in a *bare* greeting. A turn only counts as a
# greeting when every word is one of these; anything else (a request, a
# question, a name) means the visitor has actually told us something.
_GREETING_FILLER = {
    "hi", "hii", "hiii", "hello", "hey", "heya", "hiya", "howdy", "greetings",
    "good", "morning", "afternoon", "evening", "day", "there", "you", "your",
    "how", "are", "is", "it", "going", "doing", "whats", "what's", "up", "sup",
    "thanks", "thank", "please", "and", "a", "an", "the", "to", "for", "i",
    "am", "im", "just", "ok", "okay", "yes", "yeah", "sure", "again",
}


def _is_greeting(message: str) -> bool:
    """True only when the message is *just* a greeting.

    Previously any message that merely *began* with "hi" was treated as a
    greeting, so "Hi, my name is Sarah, my email is ..." was answered with a
    canned hello and the lead data was thrown away: the greeting branch sets
    ``intent="greeting"``, skips retrieval, and returns before lead capture runs.
    A greeting with substantive content is a real enquiry, not a greeting.
    """
    text = (message or "").lower().strip()
    if not any(re.search(pattern, text) for pattern in GREETING_PATTERNS):
        return False
    # Contact details or a name/question in the same turn always mean business.
    if EMAIL_RE.search(message) or PHONE_RE.search(message):
        return False
    tokens = set(re.findall(r"[a-z']+", text))
    return bool(tokens) and tokens.issubset(_GREETING_FILLER)


def _get_business_info() -> dict[str, str]:
    """Fetch business information from Settings database."""
    try:
        with SessionLocal() as db:
            website = db.query(Website).first()
            if website:
                return {
                    "name": website.name or get_settings().app_name,
                    "description": website.description if hasattr(website, 'description') and website.description else f"Welcome to {website.name or get_settings().app_name}!",
                    "url": website.url if website.url else "",
                }
    except Exception:
        pass
    settings = get_settings()
    return {
        "name": settings.app_name,
        "description": f"Welcome to {settings.app_name}!",
        "url": str(settings.target_website_url) if settings.target_website_url else "",
    }


def _services_from_crawl() -> list[str]:
    """Collect product/service page titles from the crawler output (best-effort)."""
    path = Path(__file__).resolve().parents[2] / "crawler" / "output" / "pages.json"
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    titles: list[str] = []
    for page in raw:
        if str(page.get("page_type", "")).lower() not in {"product", "service"}:
            continue
        title = str(page.get("title") or "").strip()
        # Skip price-bearing / navigation titles; keep readable product names.
        if not title or "$" in title:
            continue
        for sep in (" – ", " — ", " - ", " | ", " � "):
            if sep in title:
                title = title.split(sep)[0].strip()
        if title:
            titles.append(title)
    return titles


def _get_services_list() -> str:
    """Describe what the business offers.

    Prefers the ServiceCatalog table, then crawled product/service page titles.
    Sales reps are people, not services, so they are never used here.
    """
    services: list[str] = []
    try:
        with SessionLocal() as db:
            from app.database.models import ServiceCatalogItem
            for svc in db.query(ServiceCatalogItem).all():
                if svc.name:
                    services.append(svc.name)
    except Exception:
        pass

    if not services:
        services = _services_from_crawl()

    if not services:
        return "our products and services"

    # Deduplicate while preserving order and cap the list for prompt size.
    unique = list(dict.fromkeys(services))
    return ", ".join(unique[:12])


def _get_faqs_list() -> str:
    """Get FAQs from database."""
    faqs = []
    try:
        with SessionLocal() as db:
            from app.database.models import FAQ
            faqs_from_db = db.query(FAQ).filter(FAQ.is_published).all()
            for faq in faqs_from_db:
                if faq.question and faq.answer:
                    faqs.append(f"Q: {faq.question}\nA: {faq.answer}")
    except Exception:
        pass
    
    return "\n\n".join(faqs) if faqs else "No FAQs available yet."


def get_target_website() -> str:
    """Read target website name from Settings DB, fall back to env var."""
    try:
        with SessionLocal() as db:
            website = db.query(Website).first()
            if website and website.name:
                return website.name
    except Exception:
        pass
    return os.getenv("TARGET_WEBSITE", os.getenv("TARGET_WEBSITE_URL", "our website"))


_DEFAULT_AGENT_NAME = "Ava"


def _get_agent_name() -> str:
    """Name the agent introduces itself with (settings override, else default)."""
    try:
        from app.api.settings import _load_section

        agent_settings = _load_section("ai_agent")
        name = str(agent_settings.get("agent_name") or "").strip()
        if name:
            return name
    except Exception:
        pass
    return os.getenv("AGENT_NAME", "").strip() or _DEFAULT_AGENT_NAME


_GEMINI_CLIENT = None


def _get_gemini_client():
    """Get a cached Gemini client."""
    global _GEMINI_CLIENT
    if _GEMINI_CLIENT is not None:
        return _GEMINI_CLIENT
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("No Gemini API key")
    from google import genai

    _GEMINI_CLIENT = genai.Client(api_key=api_key)
    return _GEMINI_CLIENT


def _gemini_model_candidates() -> list[str]:
    """Configured model first, then known-good fallbacks (deduplicated, in order)."""
    configured = (get_settings().gemini_model or os.getenv("GEMINI_MODEL") or "").strip()
    if not configured:
        configured = _DEFAULT_GEMINI_MODEL
    candidates: list[str] = []
    for model in [configured, *_FALLBACK_GEMINI_MODELS]:
        name = (model or "").strip()
        if name and name not in candidates:
            candidates.append(name)
    return candidates


def _gemini_generate(system_prompt: str, context: str, question: str) -> str:
    """Generate a response using Gemini, trying the configured model then fallbacks."""
    candidates = _gemini_model_candidates()
    prompt = (
        f"System: {system_prompt}\n\nContext:\n{context}\n\n"
        f"Visitor question: {question}\n\nAnswer:"
    )
    for model in candidates:
        try:
            response = _get_gemini_client().models.generate_content(model=model, contents=prompt)
            text = (getattr(response, "text", "") or "").strip()
            if text:
                if model != candidates[0]:
                    logger.info("Gemini answered using fallback model %s", model)
                return text
            logger.warning("Gemini model %s returned an empty response", model)
        except Exception as exc:  # noqa: BLE001 - try the next candidate model
            logger.warning("Gemini model %s failed: %s", model, exc)
            continue
    # Fallback: construct a helpful response from context without the LLM
    if context:
        sentences = context.split('.')
        relevant = [
            s.strip()
            for s in sentences
            if any(
                kw in s.lower()
                for kw in ['service', 'price', 'offer', 'contact', 'email', 'phone', 'website', 'about']
            )
        ]
        if relevant:
            return (
                f"Based on our website: {'. '.join(relevant[:3])}. "
                "For more details, I can connect you with our team."
            )
    return (
        "I'm not certain about that — let me connect you with someone from the team. "
        "Please share your name and email and we'll get back to you."
    )


def detect_language(state: SalesAgentState) -> SalesAgentState:
    message = _last_user_message(state)
    spanish_words = {"hola", "gracias", "precio", "servicio"}
    state.language = "es" if any(word in message.lower() for word in spanish_words) else "en"
    return state


def detect_intent(state: SalesAgentState) -> SalesAgentState:
    message = _last_user_message(state).lower()
    
    # Check for greetings first
    if _is_greeting(message):
        state.intent = "greeting"
    elif any(word in message for word in ["human", "agent", "person", "representative"]):
        state.intent = "handoff"
    elif any(
        phrase in message
        for phrase in (
            "book a meeting", "book meeting", "schedule a meeting", "schedule a call",
            "book a demo", "book demo", "schedule demo", "set up a meeting",
            "set up a call", "book a call", "arrange a meeting", "book an appointment",
            "schedule an appointment", "i want to book", "book a time", "meeting",
        )
    ):
        state.intent = "booking"
        state.booking_requested = True
    elif any(word in message for word in ["price", "pricing", "cost", "service", "help", "need", "quote"]):
        state.intent = "sales"
    else:
        state.intent = "question"
    return state


def retrieve(state: SalesAgentState) -> SalesAgentState:
    # Skip RAG retrieval for greetings
    message = _last_user_message(state)
    if _is_greeting(message):
        state.response = ""
        state.sources = []
        state.retrieved_context = []
        return state

    answer = search_knowledge_base(message)
    state.response = str(answer["answer"])
    state.sources = list(answer["sources"])
    # retrieved_context must hold the actual chunk text (not source dicts) so the
    # response generator can ground its answer in real website content.
    context = str(answer.get("context") or "").strip()
    state.retrieved_context = [context] if context else []
    if not answer["grounded"]:
        state.handoff_reason = "Knowledge base did not contain enough information."
    return state


def qualify(state: SalesAgentState) -> SalesAgentState:
    """Accumulate qualification signals from the whole conversation.

    Details are collected one at a time across turns, so every visitor message so
    far is parsed rather than only the latest one.
    """
    message = _last_user_message(state)
    extracted = extract_lead_data(state.messages)
    # Keep previously learned fields and let newly parsed values win.
    merged = {**state.lead_data, **{k: v for k, v in extracted.items() if k != "transcript" and v}}
    if merged.get("email") and "email" not in state.lead_data:
        state.lead_data["email"] = merged["email"]
    if merged.get("full_name"):
        state.lead_data["full_name"] = merged["full_name"]
    if merged.get("phone"):
        state.lead_data["phone"] = merged["phone"]
    if merged.get("company_name"):
        state.lead_data["company_name"] = merged["company_name"]
    if merged.get("website_url"):
        state.lead_data["website_url"] = merged["website_url"]
    if merged.get("requirement"):
        state.lead_data["need"] = merged["requirement"]
    if "website" in message.lower() or "leads" in message.lower() or "quote" in message.lower():
        state.lead_data.setdefault("need", message)
    return state


def _normalize_slots(raw: list[dict[str, object]]) -> list[dict[str, object]]:
    """Keep the next few upcoming slots, tolerance for either the API or ISO shape."""
    normalized: list[dict[str, object]] = []
    for slot in raw or []:
        if isinstance(slot, dict):
            start = str(slot.get("start") or slot.get("time") or "").strip()
        else:
            start = str(slot).strip()
        if not start:
            continue
        normalized.append({"start": start, "end": str(slot.get("end") or "") if isinstance(slot, dict) else ""})
        if len(normalized) >= 6:
            break
    return normalized


def _run_coro_blocking(coro: Any) -> Any:
    """Run a coroutine to completion from inside sync code.

    ``asyncio.run`` raises ``RuntimeError: asyncio.run() cannot be called from a
    running event loop`` because the agent graph executes inside FastAPI's loop.
    That exception was being swallowed and every booking turn degraded to "no
    slots" even though Cal.com was returning 320 of them. When a loop is already
    running we hand the coroutine to a worker thread with a loop of its own.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _handle_booking(state: SalesAgentState, website_name: str) -> SalesAgentState:
    """Offer real Cal.com slots in-chat and remember who is booking.

    Retrieval runs synchronously inside the agent graph, so we drive the async
    Cal.com client to completion here. Failures degrade to a helpful message
    instead of breaking the turn.
    """
    slots: list[dict[str, object]] = []
    try:
        from app.integrations.calcom import CalComClient

        slots = _normalize_slots(
            _run_coro_blocking(CalComClient().get_available_slots())
        )
    except Exception as exc:  # noqa: BLE001 - booking offer must not break chat
        logger.warning("booking_slot_fetch_failed: %s", exc)

    state.slots = slots
    state.booking = {
        "name": state.lead_data.get("full_name") or "",
        "email": state.lead_data.get("email") or "",
        "company": state.lead_data.get("company_name") or "",
        "conversation_id": state.conversation_id,
    }

    if slots:
        preview = slots[:3]
        listing = "; ".join(str(slot["start"]) for slot in preview)
        state.response = (
            f"Happy to set that up with the {website_name} team. "
            f"I have openings at: {listing}. "
            "Which one works for you? I'll also need the best email to send the calendar invite."
        )
    else:
        state.response = (
            f"I'd be glad to arrange a call with the {website_name} team. "
            "What day and time works best for you, and what's the best email to send the invite?"
        )
    state.messages.append(ChatMessage(role="assistant", content=state.response))
    # Still attempt capture so contact details shared here become a lead.
    _append_lead_confirmation(state, _last_user_message(state))
    return state


def _notify_handoff(state: SalesAgentState) -> None:
    """Alert the sales team (best-effort) that a visitor wants a human."""
    try:
        from app.integrations.mailjet import notify_handoff

        notify_handoff(state.lead_data, state.handoff_reason or "Visitor requested a human.")
    except Exception as exc:  # noqa: BLE001 - notification must not break chat
        logger.warning("handoff_notification_failed: %s", exc)


def _append_lead_confirmation(state: SalesAgentState, question: str) -> None:
    """Persist the lead and, on the turn contact details arrive, acknowledge it.

    Capture is attempted on every sales turn (details accumulate across the
    conversation), but the confirmation sentence is only appended when the visitor
    has just shared an email or phone number - otherwise the agent would repeat
    "I've saved your details" on every reply.
    """
    lead = capture_lead(
        conversation_id=state.conversation_id,
        messages=state.messages,
        trigger_message=question,
    )
    if not lead:
        return
    state.lead_data["lead_id"] = lead.get("id")
    state.lead_data["temperature"] = lead.get("temperature")
    # Signal to API layers that a lead exists for this conversation.
    state.lead_data.setdefault("captured", True)

    just_shared_contact = bool(EMAIL_RE.search(question) or PHONE_RE.search(question))
    if just_shared_contact:
        confirmation = lead_confirmation(str(lead.get("temperature") or "Cold"))
        if confirmation not in state.response:
            state.response = f"{state.response} {confirmation}".strip()


def generate_response(state: SalesAgentState) -> SalesAgentState:
    question = _last_user_message(state)
    
    # Get business info
    business_info = _get_business_info()
    website_name = business_info["name"]
    website_description = business_info["description"]
    services_list = _get_services_list()
    faqs_list = _get_faqs_list()
    agent_name = _get_agent_name()
    
    # Check if it's a greeting: always answer warmly with the agent identity.
    if _is_greeting(question):
        template = random.choice(GREETING_RESPONSES)
        state.response = template.format(agent_name=agent_name, website_name=website_name)
        state.messages.append(ChatMessage(role="assistant", content=state.response))
        return state
    
    # Booking intent: offer real availability and collect the invite email.
    if state.intent == "booking":
        return _handle_booking(state, website_name)

    # Check if intent is handoff
    if state.intent == "handoff":
        handoff = request_human_handoff(state.conversation_id, "Visitor requested a human.")
        state.needs_human = True
        state.handoff_reason = str(handoff["reason"])
        state.response = (
            f"I'll connect you with someone from the {website_name} team. "
            "Could you share your name and the best email to reach you, so they can follow up?"
        )
        state.messages.append(ChatMessage(role="assistant", content=state.response))
        _append_lead_confirmation(state, question)
        _notify_handoff(state)
        return state
    
    # Check if RAG has grounded answer
    if state.needs_human or not state.retrieved_context:
        # Use fallback prompt with business info
        fallback_prompt = FALLBACK_PROMPT.format(
            agent_name=agent_name,
            website_name=website_name,
            website_description=website_description,
            services_list=services_list,
            faqs_list=faqs_list,
        )
        
        context = " ".join(str(item) for item in state.retrieved_context if item)

        state.response = _gemini_generate(fallback_prompt, context, question)
        state.messages.append(ChatMessage(role="assistant", content=state.response))
        _append_lead_confirmation(state, question)
        return state
    
    # Generate proper LLM answer from KB context using sales assistant prompt
    sales_prompt = SALES_ASSISTANT_PROMPT.format(
        agent_name=agent_name,
        website_name=website_name,
        website_description=website_description,
        services_list=services_list,
    )
    
    context = "\n\n".join(str(item) for item in state.retrieved_context) or state.response
    state.response = _gemini_generate(sales_prompt, context, question)
    state.messages.append(ChatMessage(role="assistant", content=state.response))
    _append_lead_confirmation(state, question)
    return state


def _last_user_message(state: SalesAgentState) -> str:
    for message in reversed(state.messages):
        if message.role == "user":
            return message.content
    return ""