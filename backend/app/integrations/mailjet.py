from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import get_settings
from app.database.session import engine
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mailjet", tags=["mailjet"])


class MailjetEmailRequest(BaseModel):
    to: str = Field(..., min_length=1)
    subject: str = Field(..., min_length=1)
    html: str = Field(..., min_length=1)
    trigger: str = "new_lead"


class MailjetClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _require_config(self) -> None:
        if not self.settings.mailjet_api_key or not self.settings.mailjet_secret_key:
            raise RuntimeError("Mailjet credentials are not configured.")

    async def _log_email(
        self,
        *,
        to_email: str,
        subject: str,
        trigger: str,
        status: str,
        error: str | None = None,
        attempts: int = 1,
    ) -> None:
        """Record a delivery attempt using the live ``email_logs`` schema.

        The production table (see ``004_create_email_logs.sql``) uses
        ``trigger_name``/``recipient``/``attempts`` rather than
        ``trigger``/``to_email``. CREATE TABLE IF NOT EXISTS is a no-op once the
        table exists, so any mismatch made every insert fail silently. Guard with
        ADD COLUMN IF NOT EXISTS so both historical and fresh databases work, and
        log (never swallow) real failures.
        """
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS email_logs (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            trigger_name TEXT,
                            recipient TEXT,
                            subject TEXT,
                            status TEXT,
                            attempts INTEGER NOT NULL DEFAULT 0,
                            error TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        )
                        """
                    )
                )
                conn.execute(text("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS trigger_name TEXT"))
                conn.execute(text("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient TEXT"))
                conn.execute(text("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0"))
                conn.execute(
                    text(
                        """
                        INSERT INTO email_logs (trigger_name, recipient, subject, status, attempts, error)
                        VALUES (:trigger_name, :recipient, :subject, :status, :attempts, :error)
                        """
                    ),
                    {
                        "trigger_name": trigger,
                        "recipient": to_email,
                        "subject": subject,
                        "status": status,
                        "attempts": attempts,
                        "error": error,
                    },
                )
        except Exception as exc:  # noqa: BLE001 - logging must not break sending
            logger.warning("email_log_write_failed trigger=%s status=%s: %s", trigger, status, exc)

    def _template(self, trigger: str, **context: Any) -> str:
        name = str(context.get("name") or "there")
        company = str(context.get("company") or "your company")
        website = str(context.get("website") or "your website")
        start_time = str(context.get("start_time") or "your selected time")
        if trigger == "meeting_booked":
            return f"<html><body><h2>Meeting booked</h2><p>Hello {name}, your meeting has been booked successfully.</p><p>Company: {company}</p><p>Selected time: {start_time}</p><p>Website: {website}</p></body></html>"
        if trigger == "hot_lead":
            return f"<html><body><h2>Hot lead alert</h2><p>A hot lead was captured for {company}.</p><p>Contact: {name}</p><p>Website: {website}</p><p>Action needed: follow up immediately.</p></body></html>"
        if trigger == "proposal_requested":
            return f"<html><body><h2>Proposal requested</h2><p>{name} from {company} requested a proposal.</p><p>Website: {website}</p></body></html>"
        return f"<html><body><h2>New lead captured</h2><p>New lead from {company} has been captured.</p><p>Name: {name}</p><p>Website: {website}</p></body></html>"

    async def send_email(self, to: str, subject: str, html: str, trigger: str = "new_lead") -> dict[str, str]:
        self._require_config()
        payload = {
            "Messages": [
                {
                    "From": {"Email": self.settings.mailjet_from_email or "noreply@example.com", "Name": self.settings.mailjet_from_name or "AI Sales Agent"},
                    "To": [{"Email": to, "Name": to}],
                    "Subject": subject,
                    "HTMLPart": html,
                    "TextPart": html.replace("<br>", " ").replace("<p>", " ").replace("</p>", " "),
                }
            ]
        }
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        "https://api.mailjet.com/v3.1/send",
                        auth=(self.settings.mailjet_api_key, self.settings.mailjet_secret_key),
                        json=payload,
                    )
                    response.raise_for_status()
                await self._log_email(
                    to_email=to, subject=subject, trigger=trigger, status="sent", attempts=attempt + 1
                )
                return {"status": "sent", "message": "email queued"}
            except Exception as exc:
                if attempt == 2:
                    await self._log_email(
                        to_email=to,
                        subject=subject,
                        trigger=trigger,
                        status="failed",
                        error=str(exc),
                        attempts=attempt + 1,
                    )
                    raise RuntimeError(f"Failed to send Mailjet email after retries: {exc}") from exc
                await asyncio.sleep(2 ** attempt)
        raise RuntimeError("Mailjet send failed")

    async def send_sales_notification(self, subject: str, body: str) -> dict[str, str]:
        self._require_config()
        recipient = self.settings.sales_team_email or self.settings.mailjet_from_email or "noreply@example.com"
        return await self.send_email(recipient, subject, f"<html><body>{body}</body></html>", trigger="sales_team")


def _sales_recipient(settings) -> str:
    """Where lead alerts go: the sales team inbox, else the configured sender."""
    return settings.sales_team_email or settings.mailjet_from_email or ""


async def notify_trigger(trigger: str, *, to: str | None = None, **context: Any) -> dict[str, str]:
    """Fire-and-forget notification used by the chat/booking flows.

    Never raises: email is a side effect and must not break a conversation or a
    booking confirmation. Failures are logged so PRIORITY 6 can verify them.
    """
    settings = get_settings()
    if not settings.mailjet_api_key or not settings.mailjet_secret_key:
        logger.info("mailjet_not_configured trigger=%s (skipped)", trigger)
        return {"status": "skipped", "reason": "not_configured"}
    client = MailjetClient()
    recipient = to or context.get("to") or settings.mailjet_from_email
    if not recipient:
        logger.warning("mailjet_no_recipient trigger=%s (skipped)", trigger)
        return {"status": "skipped", "reason": "no_recipient"}
    subject = str(context.get("subject") or trigger.replace("_", " ").title())
    html = str(context.get("html") or client._template(trigger, **context))
    try:
        result = await client.send_email(str(recipient), subject, html, trigger=trigger)
        logger.info("mailjet_sent trigger=%s to=%s", trigger, recipient)
        return result
    except Exception as exc:  # noqa: BLE001 - notifications must not propagate
        logger.warning("mailjet_send_failed trigger=%s to=%s: %s", trigger, recipient, exc)
        return {"status": "failed", "error": str(exc)}


def notify_lead_captured(lead: dict[str, Any]) -> None:
    """Notify the sales team that a new lead was captured (best-effort)."""
    settings = get_settings()
    to = _sales_recipient(settings)
    if not to:
        logger.warning("mailjet_no_recipient trigger=new_lead (skipped)")
        return
    context = {
        "name": lead.get("full_name") or lead.get("name") or "a visitor",
        "company": lead.get("company_name") or lead.get("company") or "their company",
        "website": lead.get("website_url") or lead.get("website") or "",
        "email": lead.get("email") or "",
        "phone": lead.get("phone") or "",
        "score": lead.get("lead_score") or lead.get("score") or "",
        "services": ", ".join(str(s) for s in (lead.get("required_services") or lead.get("services") or [])),
    }
    asyncio.create_task(notify_trigger("new_lead", to=to, **context))
    temperature = str(lead.get("lead_score") or lead.get("temperature") or "").lower()
    if not temperature:
        temperature = str(lead.get("temperature") or "").lower()
    if temperature.startswith("hot"):
        asyncio.create_task(notify_trigger("hot_lead", to=to, **context))


def notify_handoff(lead: dict[str, Any], reason: str = "") -> None:
    """Notify the sales team that a visitor requested a human."""
    settings = get_settings()
    to = _sales_recipient(settings)
    if not to:
        logger.warning("mailjet_no_recipient trigger=human_handoff (skipped)")
        return
    context = {
        "name": lead.get("full_name") or lead.get("name") or "a visitor",
        "company": lead.get("company_name") or lead.get("company") or "their company",
        "website": lead.get("website_url") or "",
        "email": lead.get("email") or "",
        "phone": lead.get("phone") or "",
        "subject": "Human handoff requested",
        "html": (
            "<html><body><h2>Human handoff requested</h2>"
            f"<p>Visitor: {lead.get('full_name') or 'Unknown'} ({lead.get('email') or 'no email'})</p>"
            f"<p>Reason: {reason or 'Visitor asked to speak with a human.'}</p></body></html>"
        ),
    }
    asyncio.create_task(notify_trigger("human_handoff", to=to, **context))


def notify_meeting_booked(*, attendee_email: str, name: str, start_time: str, company: str = "") -> None:
    """Confirm a booking to the attendee. Best-effort."""
    settings = get_settings()
    if not attendee_email:
        logger.warning("mailjet_no_recipient trigger=meeting_booked (skipped)")
        return
    asyncio.create_task(
        notify_trigger(
            "meeting_booked",
            to=attendee_email,
            name=name or attendee_email,
            company=company or "your company",
            start_time=start_time,
            subject="Your meeting is confirmed",
        )
    )


@router.post("/send")
async def send_mail(payload: MailjetEmailRequest) -> dict[str, str]:
    client = MailjetClient()
    return await client.send_email(payload.to, payload.subject, payload.html, trigger=payload.trigger)


@router.post("/trigger")
async def trigger_email(payload: dict[str, str]) -> dict[str, str]:
    client = MailjetClient()
    trigger = payload.get("trigger", "new_lead")
    to_email = payload.get("to") or payload.get("email") or ""
    if not to_email:
        raise ValueError("Email recipient is required")
    subject = payload.get("subject") or "AI sales notification"
    html = payload.get("html") or client._template(trigger, **payload)
    return await client.send_email(to_email, subject, html, trigger=trigger)
