# auth_utils.py
import os
import time
from datetime import datetime, date
from dateutil import parser as date_parser
from google.oauth2.service_account import Credentials
import gspread

# Кэш на небольшое время, чтобы не дергать Sheets API на каждый запрос
_CACHE = {
    "rows": None,
    "fetched_at": 0
}
CACHE_TTL = 60  # seconds

class AuthManager:
    def __init__(self, creds_path=None, sheet_url=None, sheet_range="Sheet1!A:C", tzname="Asia/Almaty"):
        from config import Config  # локальная конфигурация
        self.creds_path = creds_path or getattr(Config, 'CREDENTIALS_PATH', os.path.join(Config.CREDENTIALS_FOLDER, 'credentials.json'))
        self.sheet_url = sheet_url or getattr(Config, 'USERS_SHEET_URL', None)
        self.sheet_range = sheet_range
        self.tzname = tzname

    def _get_sheets_client(self):
        if not os.path.exists(self.creds_path):
            raise FileNotFoundError(f"Credentials not found: {self.creds_path}")
        creds = Credentials.from_service_account_file(self.creds_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
        client = gspread.authorize(creds)
        return client

    def _fetch_rows(self):
        """Возвращает список строк из листа: каждая строка — list [login, password, expiry]"""
        now = time.time()
        if _CACHE["rows"] and (now - _CACHE["fetched_at"] < CACHE_TTL):
            return _CACHE["rows"]

        client = self._get_sheets_client()
        if not self.sheet_url:
            raise ValueError("USERS_SHEET_URL not set in config")
        sh = client.open_by_url(self.sheet_url)
        # Используем весь первый лист, или можно изменить range
        try:
            values = sh.sheet1.get_all_values()
        except Exception as e:
            # fallback: try a range
            values = sh.values_get(self.sheet_range).get('values', [])
        # Сохраняем в кэш
        _CACHE["rows"] = values
        _CACHE["fetched_at"] = time.time()
        return values

    def _parse_date(self, raw):
        if not raw or str(raw).strip() == '':
            return None
        try:
            # поддерживает разные форматы
            dt = date_parser.parse(str(raw), dayfirst=False)
            return dt.date()
        except Exception:
            return None

    def authenticate_user(self, login, password):
        """
        Проверяет логин/пароль. Возвращает dict:
        { "success": True, "login": login, "expiry": date or None, "days_left": int or None }
        или { "success": False, "error": "..." }
        """
        rows = self._fetch_rows()
        if not rows:
            return {"success": False, "error": "Список пользователей пуст или недоступен"}

        # Если в таблице есть заголовок — можно попытаться его пропустить.
        # Предположим, что первая строка может быть заголовком — если обнаружит слова "login" или "password".
        start_index = 0
        first = [c.lower() for c in rows[0]] if rows and len(rows[0]) > 0 else []
        if any(h in ("login", "логин", "username") for h in first) or any(h in ("password", "пароль") for h in first):
            start_index = 1

        for r in rows[start_index:]:
            if not r:
                continue
            row_login = str(r[0]).strip() if len(r) > 0 else ''
            row_pass = str(r[1]).strip() if len(r) > 1 else ''
            row_exp = r[2].strip() if len(r) > 2 else ''

            if row_login == login and row_pass == password:
                expiry = self._parse_date(row_exp)
                days_left = None
                if expiry:
                    today = date.today()
                    days_left = (expiry - today).days
                return {
                    "success": True,
                    "login": row_login,
                    "expiry": expiry.isoformat() if expiry else None,
                    "days_left": days_left
                }

        return {"success": False, "error": "Неверный логин или пароль"}

    def get_user_info(self, login):
        """Возвращаем данные пользователя (expiry в ISO) по логину"""
        rows = self._fetch_rows()
        start_index = 0
        first = [c.lower() for c in rows[0]] if rows and len(rows[0]) > 0 else []
        if any(h in ("login", "логин", "username") for h in first) or any(h in ("password", "пароль") for h in first):
            start_index = 1

        for r in rows[start_index:]:
            if not r:
                continue
            row_login = str(r[0]).strip() if len(r) > 0 else ''
            row_exp = r[2].strip() if len(r) > 2 else ''
            if row_login == login:
                expiry = self._parse_date(row_exp)
                days_left = None
                if expiry:
                    today = date.today()
                    days_left = (expiry - today).days
                return {
                    "login": row_login,
                    "expiry": expiry.isoformat() if expiry else None,
                    "days_left": days_left
                }
        return None
