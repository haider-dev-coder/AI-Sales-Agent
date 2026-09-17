from app.config import get_settings


class GoogleSheetsClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _require_config(self) -> None:
        if not self.settings.google_service_account_json or not self.settings.google_sheet_id:
            raise RuntimeError("Google Sheets credentials are not configured.")

    async def upsert_lead(self, lead: dict[str, object]) -> dict[str, str]:
        self._require_config()
        raise NotImplementedError("Real Google Sheets sync is pending credentialed integration testing.")
