import pytest

from app.integrations.calcom import CalComClient
from app.integrations.google_sheets import GoogleSheetsClient
from app.integrations.mailjet import MailjetClient
from app.leads.qualification import extract_lead_signals
from app.leads.scoring import calculate_lead_score


def test_lead_scoring_temperature() -> None:
    signals = extract_lead_signals("We need a proposal and want to schedule a call this week for our company website https://example.com")
    score = calculate_lead_score(signals)

    assert score.temperature == "HOT"
    assert score.score >= 70


@pytest.mark.parametrize("client", [CalComClient(), MailjetClient(), GoogleSheetsClient()])
def test_integrations_require_credentials(client: object, monkeypatch: pytest.MonkeyPatch) -> None:
    method_name = {
        CalComClient: "get_available_slots",
        MailjetClient: "send_sales_notification",
        GoogleSheetsClient: "upsert_lead",
    }[type(client)]
    credential_fields = {
        CalComClient: ("calcom_api_key", "calcom_event_type_id"),
        MailjetClient: ("mailjet_api_key", "mailjet_secret_key"),
        GoogleSheetsClient: ("google_service_account_json", "google_sheet_id"),
    }[type(client)]
    settings = getattr(client, "settings")
    for field in credential_fields:
        monkeypatch.setattr(settings, field, None)
    method = getattr(client, method_name)
    with pytest.raises(RuntimeError):
        if method_name == "send_sales_notification":
            import asyncio

            asyncio.run(method("subject", "body"))
        elif method_name == "upsert_lead":
            import asyncio

            asyncio.run(method({}))
        else:
            import asyncio

            asyncio.run(method())
