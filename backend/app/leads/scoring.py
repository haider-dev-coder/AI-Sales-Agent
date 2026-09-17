from dataclasses import dataclass


@dataclass(slots=True)
class LeadScore:
    score: int
    temperature: str
    reasons: list[str]


def calculate_lead_score(signals: dict[str, object]) -> LeadScore:
    score = 0
    reasons: list[str] = []
    rules = [
        ("purchase_intent", 30, "purchase intent"),
        ("urgency", 20, "urgency"),
        ("clear_service_need", 20, "clear service need"),
        ("website_provided", 15, "website provided"),
        ("company_provided", 10, "company provided"),
        ("proposal_requested", 10, "proposal requested"),
        ("meeting_requested", 10, "meeting requested"),
    ]
    for key, points, reason in rules:
        if signals.get(key):
            score += points
            reasons.append(reason)
    if score >= 70:
        temperature = "HOT"
    elif score >= 40:
        temperature = "WARM"
    else:
        temperature = "COLD"
    return LeadScore(score=score, temperature=temperature, reasons=reasons)
