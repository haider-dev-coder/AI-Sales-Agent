from __future__ import annotations

import logging
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.config import get_settings
from app.database.session import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cal", tags=["calcom"])

CAL_API_VERSION = "2024-08-13"
CAL_API_BASE = "https://api.cal.com/v2"

# Cal.com validates ``attendee.timeZone`` as an IANA zone and rejects anything
# else with HTTP 400 ("timeZone must be a valid IANA time-zone"). The app's
# settings default is the bare label "UTC", which Cal.com refuses, so every
# booking failed. Map the legacy labels we ship as defaults onto real zones.
_TIMEZONE_ALIASES = {
    "utc": "Etc/UTC",
    "gmt": "Etc/GMT",
    "est": "America/New_York",
    "edt": "America/New_York",
    "cst": "America/Chicago",
    "cdt": "America/Chicago",
    "mst": "America/Denver",
    "mdt": "America/Denver",
    "pst": "America/Los_Angeles",
    "pdt": "America/Los_Angeles",
    "pkt": "Asia/Karachi",
    "ist": "Asia/Kolkata",
    "bst": "Europe/London",
    "cet": "Europe/Paris",
    "gst": "Asia/Dubai",
}
# Used when neither the caller nor the settings supply a usable zone.
_DEFAULT_TIMEZONE = "Etc/UTC"


def _normalize_timezone(value: str | None) -> str:
    """Return an IANA timezone Cal.com accepts.

    Falls back to the settings default and then to ``_DEFAULT_TIMEZONE`` so a
    missing or abbreviated zone can never block a booking again.
    """
    candidate = (value or "").strip()
    if not candidate:
        candidate = str(_settings_timezone() or "").strip()
    candidate = _TIMEZONE_ALIASES.get(candidate.lower(), candidate)
    # A valid IANA zone contains an area/city separator; anything else is a label.
    if "/" in candidate:
        return candidate
    return _DEFAULT_TIMEZONE


def _settings_timezone() -> str | None:
    """Best-effort read of the configured General > timezone setting."""
    try:
        from app.api.settings import _load_section

        section = _load_section("general") or {}
        value = section.get("timezone")
        return str(value) if value else None
    except Exception:  # noqa: BLE001 - settings must never block a booking
        return None


class BookingRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    start_time: str = Field(..., min_length=1)
    time_zone: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    lead_id: str | None = Field(default=None)
    conversation_id: str | None = Field(default=None)


class RescheduleRequest(BaseModel):
    start_time: str = Field(..., min_length=1)


def _extract_error(response: httpx.Response) -> str:
    """Return a readable error message from a failed Cal.com response."""
    try:
        payload = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:300] if text else f"HTTP {response.status_code}"

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            details = error.get("details")
            if message and details:
                return f"{message} ({details})"
            if message:
                return str(message)
        for key in ("message", "detail", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return f"HTTP {response.status_code}"


def _calcom_http_error(exc: httpx.HTTPStatusError) -> HTTPException:
    """Translate a Cal.com HTTP error into a clean API error with detail."""
    detail = _extract_error(exc.response)
    # Cal.com returns 400/401/403/404 for bad credentials, unknown booking, etc.
    status = exc.response.status_code
    if status in (401, 403):
        status = 400  # surface auth issues as configuration/validation errors
    return HTTPException(status_code=status, detail=f"Cal.com error: {detail}")


class CalComClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _require_config(self) -> None:
        if not self.settings.calcom_api_key or not self.settings.calcom_event_type_id:
            raise RuntimeError("Cal.com credentials are not configured.")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.calcom_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "cal-api-version": CAL_API_VERSION,
        }

    async def get_available_slots(self) -> list[dict[str, str]]:
        self._require_config()
        async with httpx.AsyncClient(timeout=30.0) as client:
            start_day = date.today().isoformat()
            end_day = (date.today() + timedelta(days=14)).isoformat()
            response = await client.get(
                f"{CAL_API_BASE}/slots/available",
                params={
                    "eventTypeId": self.settings.calcom_event_type_id,
                    "startTime": f"{start_day}T00:00:00.000Z",
                    "endTime": f"{end_day}T23:59:59.999Z",
                },
                headers=self._headers(),
            )
            if response.is_error:
                logger.warning("calcom_availability_failed: %s", _extract_error(response))
                response.raise_for_status()
            payload = response.json()
        slots_container = payload.get("data") if isinstance(payload, dict) else payload
        # Cal.com v2 nests the day map behind an extra "slots" key:
        #   {"data": {"slots": {"2026-09-16": [{"time": "..."}]}}}
        # Older shapes returned the day map directly, so unwrap only when the
        # wrapper is actually present. Without this the loop below iterated the
        # literal key "slots" (a dict, not a day list) and returned zero slots.
        if isinstance(slots_container, dict) and isinstance(
            slots_container.get("slots"), (dict, list)
        ):
            slots_container = slots_container["slots"]
        if isinstance(slots_container, dict):
            normalized: list[dict[str, str]] = []
            for _day_key, day_slots in slots_container.items():
                if isinstance(day_slots, list):
                    for slot in day_slots:
                        if isinstance(slot, dict):
                            # v2 names the timestamp "time"; older shapes used
                            # "start"/"start_time".
                            start = (
                                slot.get("start")
                                or slot.get("start_time")
                                or slot.get("time")
                            )
                            end = slot.get("end") or slot.get("end_time") or ""
                        elif isinstance(slot, str):
                            start, end = slot, ""
                        else:
                            start, end = None, ""
                        if start:
                            normalized.append({"start": str(start), "end": str(end)})
                elif isinstance(day_slots, str):
                    normalized.append({"start": day_slots, "end": ""})
            # Offer the soonest availability first in the chat widget.
            normalized.sort(key=lambda item: item["start"])
            return normalized
        if isinstance(slots_container, list):
            normalized = []
            for slot in slots_container:
                if isinstance(slot, dict):
                    start = slot.get("start") or slot.get("start_time") or slot.get("time")
                    end = slot.get("end") or slot.get("end_time")
                    if start:
                        normalized.append({"start": str(start), "end": str(end) if end else ""})
                elif isinstance(slot, str):
                    normalized.append({"start": slot, "end": ""})
            return normalized
        return []

    async def list_bookings(self) -> list[dict[str, object]]:
        """Real bookings from the Cal.com v2 API for the configured account."""
        self._require_config()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{CAL_API_BASE}/bookings",
                params={"take": 100, "sortStart": "desc"},
                headers=self._headers(),
            )
            if response.is_error:
                logger.warning("calcom_list_bookings_failed: %s", _extract_error(response))
                response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict):
            raw_items = payload.get("data") or payload.get("bookings") or []
        elif isinstance(payload, list):
            raw_items = payload
        else:
            raw_items = []
        bookings: list[dict[str, object]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            attendees = [
                {
                    "name": str(att.get("name") or ""),
                    "email": str(att.get("email") or ""),
                    "time_zone": str(att.get("timeZone") or att.get("time_zone") or ""),
                }
                for att in (item.get("attendees") or [])
                if isinstance(att, dict)
            ]
            meeting_url = item.get("meetingUrl") or item.get("meeting_url")
            if not meeting_url:
                location = item.get("location")
                # location can be a map/URL string or an object in Cal.com v2 responses
                if isinstance(location, str) and location.lower().startswith("http"):
                    meeting_url = location
                elif isinstance(location, dict):
                    meeting_url = location.get("url") or location.get("link") or location.get("meetingUrl")
            bookings.append(
                {
                    "id": str(item.get("id") or item.get("uid") or ""),
                    "uid": str(item.get("uid") or ""),
                    "title": str(item.get("title") or item.get("eventTitle") or "Booking"),
                    "start": item.get("start") or item.get("startTime"),
                    "end": item.get("end") or item.get("endTime"),
                    "status": str(item.get("status") or "accepted").lower(),
                    "attendees": attendees,
                    "meeting_url": meeting_url or None,
                    "created_at": item.get("createdAt") or item.get("created_at"),
                }
            )
        return bookings

    async def book_meeting(
        self,
        start_time: str,
        attendee_email: str,
        name: str | None = None,
        time_zone: str | None = None,
        notes: str | None = None,
    ) -> dict[str, str]:
        self._require_config()
        attendee: dict[str, object] = {
            "name": name or "Guest",
            "email": attendee_email,
            # Cal.com v2 requires a valid IANA zone; an absent/invalid one is a 400.
            "timeZone": _normalize_timezone(time_zone),
        }
        payload: dict[str, object] = {
            "eventTypeId": int(self.settings.calcom_event_type_id),
            "start": start_time,
            "attendee": attendee,
            "metadata": {},
        }
        if notes:
            payload["bookingFieldsResponses"] = {"notes": notes}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{CAL_API_BASE}/bookings",
                headers=self._headers(),
                json=payload,
            )
            if response.is_error:
                logger.warning("calcom_book_failed: %s", _extract_error(response))
                response.raise_for_status()
            data = response.json()
        booking = data.get("data") if isinstance(data, dict) else None
        booking = booking if isinstance(booking, dict) else None
        confirmation_url = ""
        if booking:
            confirmation_url = str(
                booking.get("confirmationUrl")
                or booking.get("confirmation_url")
                or booking.get("url")
                or ""
            )
        booking_id = ""
        if booking:
            booking_id = str(booking.get("id") or booking.get("uid") or "")
        return {
            "status": "confirmed",
            "confirmation_url": confirmation_url,
            "booking_id": booking_id,
            "uid": str(booking.get("uid") or "") if booking else "",
        }

    async def cancel_booking(self, booking_id: str, reason: str | None = None) -> dict[str, str]:
        self._require_config()
        body: dict[str, object] = {}
        if reason:
            body["cancellationReason"] = reason
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{CAL_API_BASE}/bookings/{booking_id}/cancel",
                headers=self._headers(),
                json=body,
            )
            if response.is_error:
                logger.warning("calcom_cancel_failed: %s", _extract_error(response))
                response.raise_for_status()
        return {"status": "cancelled"}

    async def reschedule_booking(self, booking_id: str, new_start_time: str) -> dict[str, str]:
        self._require_config()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{CAL_API_BASE}/bookings/{booking_id}/reschedule",
                headers=self._headers(),
                json={"start": new_start_time},
            )
            if response.is_error:
                logger.warning("calcom_reschedule_failed: %s", _extract_error(response))
                response.raise_for_status()
            data = response.json()
        booking = data.get("data") if isinstance(data, dict) else None
        booking = booking if isinstance(booking, dict) else None
        return {
            "status": "rescheduled",
            "start": str(booking.get("start")) if booking and booking.get("start") else "",
            "uid": str(booking.get("uid") or "") if booking else "",
        }


@router.get("/availability")
async def get_availability() -> dict[str, list[dict[str, str]]]:
    client = CalComClient()
    try:
        slots = await client.get_available_slots()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc
    return {"slots": slots}


@router.get("/bookings")
async def list_bookings() -> dict[str, list[dict[str, object]]]:
    client = CalComClient()
    try:
        bookings = await client.list_bookings()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc
    return {"bookings": bookings}


def _persist_appointment(payload: BookingRequest, result: dict[str, str]) -> None:
    """Record the booking so the dashboard/analytics report it (best-effort)."""
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    """
                    INSERT INTO appointments (lead_id, conversation_id, calcom_booking_id,
                                              event_type, start_time, status, created_at)
                    VALUES (CAST(:lead_id AS uuid), CAST(:conversation_id AS uuid),
                            :booking_id, :event_type, CAST(:start_time AS timestamptz), 'confirmed', NOW())
                    """
                ),
                {
                    "lead_id": payload.lead_id or None,
                    "conversation_id": payload.conversation_id or None,
                    "booking_id": result.get("booking_id") or result.get("uid") or "",
                    "event_type": str(get_settings().calcom_event_type_id or ""),
                    "start_time": payload.start_time,
                },
            )
            db.commit()
    except Exception as exc:  # noqa: BLE001 - persistence must not fail the booking
        logger.warning("appointment_persist_failed: %s", exc)


@router.post("/book")
async def create_booking(payload: BookingRequest) -> dict[str, str]:
    client = CalComClient()
    try:
        result = await client.book_meeting(
            payload.start_time,
            payload.email,
            payload.name,
            payload.time_zone,
            payload.notes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc

    _persist_appointment(payload, result)
    try:
        from app.integrations.mailjet import notify_meeting_booked

        notify_meeting_booked(
            attendee_email=payload.email,
            name=payload.name,
            start_time=payload.start_time,
            company=payload.notes or "",
        )
    except Exception as exc:  # noqa: BLE001 - confirmation email is best-effort
        logger.warning("booking_confirmation_email_dispatch_failed: %s", exc)
    return result


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, reason: str | None = None) -> dict[str, str]:
    client = CalComClient()
    try:
        result = await client.cancel_booking(booking_id, reason)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc
    return result


@router.post("/bookings/{booking_id}/reschedule")
async def reschedule_booking(booking_id: str, payload: RescheduleRequest) -> dict[str, str]:
    client = CalComClient()
    try:
        result = await client.reschedule_booking(booking_id, payload.start_time)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc
    return result


@router.delete("/bookings/{booking_id}")
async def cancel_booking_legacy(booking_id: str) -> dict[str, str]:
    """Kept for backwards compatibility; delegates to the v2 cancel endpoint."""
    client = CalComClient()
    try:
        result = await client.cancel_booking(booking_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise _calcom_http_error(exc) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Cal.com request failed: {exc}") from exc
    return result
