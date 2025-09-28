import os
from datetime import date
from dateutil import parser as date_parser
from google.oauth2.service_account import Credentials
import gspread

# Укажи путь к credentials.json
CREDS_PATH = os.path.join("credentials", "credentials.json")
SHEET_URL = "https://docs.google.com/spreadsheets/d/1yI_73HFTwXFuG2-2nwxqodoGCM0gDC6uDDp16t3aLa8/edit?gid=0#gid=0"

def parse_date(raw):
    if not raw or str(raw).strip() == '':
        return None
    try:
        return date_parser.parse(str(raw), dayfirst=False).date()
    except Exception:
        return None

def main():
    username_input = input("Введите логин: ").strip()
    password_input = input("Введите пароль: ").strip()

    creds = Credentials.from_service_account_file(
        CREDS_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    client = gspread.authorize(creds)
    sheet = client.open_by_url(SHEET_URL).sheet1

    rows = sheet.get_all_values()
    print(f"\nВсего строк: {len(rows)}\n")
    
    found = False
    for i, r in enumerate(rows, start=1):
        row_login = r[0].strip() if len(r) > 0 else ''
        row_pass = r[1].strip() if len(r) > 1 else ''
        row_exp = r[2].strip() if len(r) > 2 else ''

        print(f"Строка {i}: login={repr(row_login)}, password={repr(row_pass)}, expiry={repr(row_exp)}")

        if row_login.lower() == username_input.lower() and row_pass == password_input:
            found = True
            expiry_date = parse_date(row_exp)
            days_left = (expiry_date - date.today()).days if expiry_date else None
            print(f"\n✅ Найден пользователь: {row_login}")
            print(f"Срок подписки: {expiry_date}, дней до истечения: {days_left}")
            break

    if not found:
        print("\n❌ Пользователь не найден или пароль неверный")

if __name__ == "__main__":
    main()
