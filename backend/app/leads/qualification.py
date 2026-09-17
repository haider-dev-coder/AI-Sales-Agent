import re


def extract_lead_signals(message: str) -> dict[str, bool]:
    lowered = message.lower()
    return {
        "purchase_intent": any(word in lowered for word in ["buy", "hire", "quote", "proposal", "pricing"]),
        "urgency": any(word in lowered for word in ["urgent", "asap", "soon", "this week"]),
        "clear_service_need": any(word in lowered for word in ["need", "looking for", "help with"]),
        "website_provided": bool(re.search(r"https?://|www\.", lowered)),
        "company_provided": "company" in lowered,
        "proposal_requested": "proposal" in lowered,
        "meeting_requested": any(word in lowered for word in ["meeting", "call", "schedule", "book"]),
    }
