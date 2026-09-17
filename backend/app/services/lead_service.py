"""Lead capture and scoring for the AI Sales Agent.

The agent collects lead details conversationally (name, company, email, phone,
requirement) and then persists them here. This module is the bridge between the
chat transcript and the real ``leads`` table used by the operator console.

Design notes:
- Capture is best-effort: a booking-quality chat must never fail because the
  database or an optional field is unavailable.
- A known email is updated in place rather than inserted again. This uses a
  portable read-then-write instead of ``ON CONFLICT (email)`` because the live
  ``leads`` table may not carry a matching unique constraint.
- Scoring is deterministic and explained through a list of reasons so the UI and
  tests can assert on it.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime

from app.agent.state import ChatMessage
from app.database.session import SessionLocal

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(r"(?:https?://|www\.)[^\s,]+", re.IGNORECASE)

# Introduction phrases that precede a person's name: "my name is ...",
# "I'm ...", "call me ...".
_NAME_RE = re.compile(
    r"(?:my name is|i am|i'm|this is|call me)\s+"
    r"([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*)?)",
    re.IGNORECASE,
)

# Company capture: up to five name-ish words, stopping before punctuation so we
# never swallow the rest of a sentence.
_COMPANY_WORDS = r"[A-Za-z0-9][A-Za-z0-9&'\-]*(?:\s+[A-Za-z0-9&'\-]+){0,4}"
# Labels and "from/we are" phrases name a proper noun, so they require a
# capitalised first word. Without that, "we are based in Karachi" and
# "my company doesn't have a website" captured as a company name.
_COMPANY_WORDS_PROPER = r"[A-Z][A-Za-z0-9&'\-]*(?:\s+[A-Za-z0-9&'\-]+){0,4}"
# Explicit markers (any casing), e.g. "our company is Bright Steel Works" or
# "we work at ACME". Longer alternatives come first so "company is called"
# wins over "company is".
_COMPANY_MARKER_RE = re.compile(
    r"(?:company is called|company's called|company name is|company is|"
    r"our company is|we work at|work at|working at)\s+"
    rf"({_COMPANY_WORDS})",
    re.IGNORECASE,
)
# Phrasings that only name a company when the value looks like a proper noun:
# "I'm Aisha from Bright Steel Works" / "we are Bright Steel Works".
_COMPANY_PROPER_RE = re.compile(
    rf"(?:from|we are|we're)\s+({_COMPANY_WORDS_PROPER})",
)
# Bare labels, e.g. "company Bright Steel Works" / "Company: ACME Ltd".
_COMPANY_LABEL_RE = re.compile(
    rf"company\s*(?:name)?\s*[:\-]?\s+({_COMPANY_WORDS_PROPER})",
    re.IGNORECASE,
)

# Discovery-phase question markers. Used to decide whether the conversation has
# reached a point where a lead is worth persisting.
_REQUIREMENT_WORDS = (
    "need", "want", "looking for", "interested in", "quote", "price", "pricing",
    "cost", "budget", "buy", "order", "book", "meeting", "demo", "help",
)

_HOT_WORDS = (
    "urgent", "urgently", "asap", "immediately", "right away", "this week",
    "next week", "deadline", "budget", "ready to buy", "purchase", "procurement",
)
# Phrases that only ask for a person. They can contain requirement words such as
# "need" but describe no product or service, so they are poor lead notes.
_HANDOFF_WORDS = (
    "human", "agent", "representative", "someone", "sales rep", "salesperson",
    "speak to", "talk to", "speak with", "talk with",
)
_WARM_WORDS = (
    "exploring", "comparing", "options", "considering", "maybe", "thinking about",
    "interested", "quote", "pricing", "cost",
)


# Words that follow "this is" / "we are" style phrases but are never a person or
# company name. Guards against "this is urgent" becoming a lead called "urgent".
_NON_NAME_WORDS = {
    "urgent", "urgently", "asap", "important", "great", "good", "fine", "ok",
    "okay", "here", "ready", "interested", "looking", "wondering", "just",
    "really", "very", "quite", "possible", "available", "the", "a", "an",
    "my", "our", "your", "their", "it", "that", "this", "not", "no", "yes",
    "correct", "right", "wrong", "why", "how", "what", "when", "where", "who",
    "needed", "required", "possible", "kidding", "serious", "busy",
}


def _is_valid_name(name: str) -> bool:
    """Reject non-name captures such as filler words or single letters."""
    lowered = name.strip().lower()
    if not lowered or lowered in _NON_NAME_WORDS:
        return False
    words = lowered.split()
    if any(word in _NON_NAME_WORDS for word in words):
        return False
    # A real name/company has at least two letters in its first word.
    return len(words[0]) >= 2


def _clean_name(value: str) -> str:
    """Trim filler words and trailing punctuation from a captured name."""
    name = value.strip().strip(".,!?")
    name = re.sub(r"^(?:is|am|it's|its)\s+", "", name, flags=re.IGNORECASE)
    # Stop at the first connector so "John and I run ACME" becomes "John". The
    # connector may also end the string ("John and"), so allow trailing whitespace
    # or end-of-input after it.
    name = re.split(
        r"\s+(?:and|from|at|with)(?:\s+|$)", name, maxsplit=1, flags=re.IGNORECASE
    )[0]
    parts = [part for part in name.split() if part]
    # Drop a dangling connector left over from a truncated phrase.
    if parts and parts[-1].lower() in {"and", "from", "at", "with", "is", "am"}:
        parts.pop()
    return " ".join(parts)[:80]


def _extract_company(text: str) -> str | None:
    """Best-effort company capture from a single visitor message.

    Marker phrases are tried before bare labels so "our company is ACME" keeps
    the full name instead of the label branch capturing "is ACME".
    """
    for pattern in (_COMPANY_MARKER_RE, _COMPANY_PROPER_RE, _COMPANY_LABEL_RE):
        for match in pattern.finditer(text):
            company = _clean_name(match.group(1))
            # Drop a leading connector the marker alternation may have swept in
            # ("we are from Bright Steel" -> "Bright Steel").
            company = re.sub(
                r"^(?:from|at|with|our|the)\s+", "", company, flags=re.IGNORECASE
            ).strip()
            if not _is_valid_name(company):
                continue
            if EMAIL_RE.search(company):
                continue
            return company
    return None


def extract_lead_data(messages: list[ChatMessage]) -> dict[str, object]:
    """Extract lead fields from the conversation transcript (best-effort)."""
    data: dict[str, object] = {}
    visitor_parts: list[str] = []

    for message in messages:
        if message.role != "user":
            continue
        text = message.content or ""
        visitor_parts.append(text)
        lower = text.lower()

        if "name" not in data:
            # `re.search` only returns the FIRST match, so a rejected candidate
            # early in the sentence ("this is urgent") used to hide a real
            # introduction further along ("my name is Bilal Ahmed"). Scan every
            # candidate and keep the first one that reads like a person.
            for match in _NAME_RE.finditer(text):
                name = _clean_name(match.group(1))
                # Guard against greetings ("I am looking for ..."), status
                # phrases ("this is urgent") and email-shaped captures.
                if not _is_valid_name(name):
                    continue
                if name.lower() in _REQUIREMENT_WORDS:
                    continue
                if EMAIL_RE.search(name):
                    continue
                data["full_name"] = name
                break

        if "email" not in data:
            match = EMAIL_RE.search(text)
            if match:
                data["email"] = match.group(0).strip(".,!?").lower()

        if "phone" not in data:
            for match in PHONE_RE.finditer(text):
                candidate = match.group(0)
                digits = re.sub(r"\D", "", candidate)
                # Inspect only the matched span (plus one neighbouring character)
                # to reject a phone-shaped run that is really part of an email.
                # Scanning the rest of the message made any *later* email reject a
                # perfectly good phone number, so dense messages lost the phone.
                window = text[max(0, match.start() - 1) : match.end() + 1]
                if 8 <= len(digits) <= 15 and "@" not in window:
                    data["phone"] = candidate.strip()
                    break

        if "company_name" not in data:
            # Two shapes: an explicit marker ("our company is X") or a bare
            # label ("company Bright Steel Works"). The old pattern required a
            # literal "company is", so the bare-label form never matched.
            company = _extract_company(text)
            if company:
                data["company_name"] = company

        if "website_url" not in data:
            match = URL_RE.search(text)
            if match:
                data["website_url"] = match.group(0).strip(".,!?")

        if not data.get("requirement") and any(word in lower for word in _REQUIREMENT_WORDS):
            data["requirement"] = _requirement_sentence(text)

    data["transcript"] = visitor_parts
    return data


def score_lead(
    message: str,
    data: dict[str, object],
    history: list[ChatMessage] | None = None,
) -> tuple[str, list[str]]:
    """Deterministic Hot/Warm/Cold scoring with human-readable reasons."""
    haystack_parts = [message or ""]
    haystack_parts.extend(str(item) for item in (data.get("transcript") or []))
    haystack = " ".join(haystack_parts).lower()

    score = 0
    reasons: list[str] = []

    if data.get("email"):
        score += 2
        reasons.append("Email captured")
    if data.get("phone"):
        score += 1
        reasons.append("Phone captured")
    if data.get("company_name") or data.get("website_url"):
        score += 1
        reasons.append("Company or website captured")
    if data.get("requirement"):
        score += 1
        reasons.append("Service requirement stated")

    hot_hits = [word for word in _HOT_WORDS if word in haystack]
    if hot_hits:
        score += 3
        reasons.append(f"Urgency or budget signals: {', '.join(sorted(set(hot_hits))[:3])}")

    warm_hits = [word for word in _WARM_WORDS if word in haystack]
    if warm_hits:
        score += 1
        reasons.append(f"Buying intent signals: {', '.join(sorted(set(warm_hits))[:3])}")

    if len(history or []) >= 6:
        score += 1
        reasons.append("Engaged conversation (6+ messages)")

    if score >= 6:
        temperature = "Hot"
    elif score >= 3:
        temperature = "Warm"
    else:
        temperature = "Cold"

    if not reasons:
        reasons.append("Browsing with no qualification signals yet")
    return temperature, reasons


def _dispatch_lead_events(record: dict[str, object], is_new: bool) -> None:
    """Kick off Google Sheets sync and Mailjet alerts for a captured lead.

    Both are best-effort side effects: they run as background tasks so a slow or
    misconfigured integration can never delay (or break) the chat turn.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.info("lead_events_skipped_no_loop for %s", record.get("id"))
        return

    try:
        from app.integrations.sheets import GoogleSheetsClient

        loop.create_task(GoogleSheetsClient().upsert_lead(dict(record)))
    except Exception as exc:  # noqa: BLE001 - optional integration
        logger.warning("lead_sheet_sync_dispatch_failed: %s", exc)

    try:
        from app.integrations.mailjet import notify_lead_captured

        # Only announce genuinely new leads; hot-lead alerts fire every time the
        # temperature is Hot so a warming conversation still escalates.
        if is_new:
            notify_lead_captured(dict(record))
        else:
            temperature = str(record.get("temperature") or "").lower()
            if temperature.startswith("hot"):
                from app.integrations.mailjet import notify_trigger

                loop.create_task(notify_trigger("hot_lead", **{**record, "name": record.get("full_name")}))
    except Exception as exc:  # noqa: BLE001 - optional integration
        logger.warning("lead_mailjet_dispatch_failed: %s", exc)


def _strip_contacts(text: str) -> str:
    """Remove emails, URLs and phone numbers so they never leak into notes.

    ``_requirement_list`` splits on ``.`` and an email address contains one, so an
    unstripped contact detail used to shatter "sarah.malik@northwind.com" into
    fake "service" fragments such as "malik@northwind" and "com and my phone is".
    """
    cleaned = EMAIL_RE.sub(" ", text)
    cleaned = URL_RE.sub(" ", cleaned)
    cleaned = PHONE_RE.sub(" ", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _requirement_sentence(text: str) -> str:
    """Return the sentence that actually states what the visitor wants.

    The whole message is kept as a fallback, but when the visitor writes a dense
    opener ("Hi, my name is X ... We need Y") the requirement should be the "We
    need Y" clause, not the greeting they happened to lead with. A request to
    talk to a human ("I need to speak to a human agent, this is urgent") also
    contains "need" but says nothing about what the visitor wants, so clauses
    that only ask for a handoff are skipped in favour of a real ask.
    """
    cleaned = _strip_contacts(text)
    candidates = [part.strip() for part in re.split(r"[.;!?\n]+", cleaned) if part.strip()]
    fallback: str | None = None
    for sentence in candidates:
        lowered = sentence.lower()
        if not any(word in lowered for word in _REQUIREMENT_WORDS):
            continue
        if fallback is None:
            fallback = sentence
        if any(word in lowered for word in _HANDOFF_WORDS):
            # Keep looking for a clause that names an actual requirement.
            continue
        return sentence[:500]
    return (fallback or (candidates[-1] if candidates else cleaned))[:500]


def _requirement_list(data: dict[str, object]) -> list[str]:
    requirement = _strip_contacts(str(data.get("requirement") or "")).strip()
    if not requirement:
        return []
    # Keep it to a few short phrases so the operator console stays readable.
    return [phrase.strip()[:120] for phrase in re.split(r"[.;\n]", requirement) if phrase.strip()][:3]


def capture_lead(
    conversation_id: str,
    messages: list[ChatMessage],
    trigger_message: str = "",
    history: list[ChatMessage] | None = None,
) -> dict[str, object] | None:
    """Persist a lead once enough information exists. Returns the saved lead.

    Returns ``None`` when there is not yet enough information to save a lead, or
    when persistence is unavailable. This function never raises.
    """
    data = extract_lead_data(messages)
    email = data.get("email")
    full_name = data.get("full_name")
    requirement = data.get("requirement")

    # Require a name plus at least one contactable detail, or an explicit
    # requirement with an email. This avoids saving "hi" as a lead.
    has_contact = bool(email or data.get("phone"))
    if not requirement or not has_contact or (not full_name and not email):
        return None

    temperature, reasons = score_lead(trigger_message, data, history)

    record = {
        "session_id": conversation_id,
        "full_name": str(full_name or email or "Website visitor"),
        "email": email,
        "phone": data.get("phone"),
        "company_name": data.get("company_name"),
        "website_url": data.get("website_url"),
        "industry": None,
        "required_services": _requirement_list(data),
        "lead_score": temperature,
        "status": "new",
        "notes": f"Captured by AI chat. Signals: {', '.join(reasons)}",
        "temperature": temperature,
        "reasons": reasons,
    }

    params = {**record, "required_services": _requirement_list(data)}

    try:
        from sqlalchemy import text

        is_new = False
        with SessionLocal() as db:
            existing = None
            if email:
                existing = db.execute(
                    text("SELECT id FROM leads WHERE lower(email) = lower(:email) LIMIT 1"),
                    {"email": email},
                ).fetchone()

            if existing is not None:
                # Known email (or partial details already on file): update in place.
                db.execute(
                    text(
                        """
                        UPDATE leads SET
                          session_id = :session_id,
                          full_name = COALESCE(:full_name, full_name),
                          phone = COALESCE(:phone, phone),
                          company_name = COALESCE(:company_name, company_name),
                          website_url = COALESCE(:website_url, website_url),
                          industry = COALESCE(:industry, industry),
                          required_services = CAST(:required_services AS text[]),
                          lead_score = :lead_score,
                          status = :status,
                          notes = :notes,
                          updated_at = NOW()
                        WHERE id = :lead_id
                        """
                    ),
                    {**params, "lead_id": existing[0]},
                )
                row = existing
            else:
                is_new = True
                row = db.execute(
                    text(
                        """
                        INSERT INTO leads (session_id, full_name, email, phone, company_name,
                                           website_url, industry, required_services, lead_score,
                                           status, notes, updated_at)
                        VALUES (:session_id, :full_name, :email, :phone, :company_name,
                                :website_url, :industry, CAST(:required_services AS text[]),
                                :lead_score, :status, :notes, NOW())
                        RETURNING id
                        """
                    ),
                    params,
                ).fetchone()
            db.commit()
        if row is not None:
            record["id"] = str(row[0])
        logger.info(
            "Captured %s lead for conversation %s (id=%s, new=%s)",
            temperature,
            conversation_id,
            record.get("id"),
            is_new,
        )
        _dispatch_lead_events(record, is_new)
    except Exception as exc:  # noqa: BLE001 - lead capture must not break chat
        logger.warning("Lead capture persistence failed for %s: %s", conversation_id, exc)

    return record


def lead_confirmation(temperature: str) -> str:
    """A short, natural acknowledgement appended after a lead is saved."""
    if temperature == "Hot":
        return "I've passed your details to our team marked as a priority - someone will reach out shortly."
    if temperature == "Warm":
        return "I've saved your details for our team, and they'll follow up with you."
    return "I've noted your details so our team can get in touch."
