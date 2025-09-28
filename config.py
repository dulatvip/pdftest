import os
import json
from google.oauth2.service_account import Credentials
import gspread
from config import Config # Импортируем ваши настройки

# Имя ключа должно совпадать с тем, что вы задали в Replit Secrets
SECRET_KEY_NAME = "GOOGLE_CREDENTIALS_JSON" 

def authorize_google_sheets():
    # 1. Получаем строку JSON из переменной окружения Replit
    credentials_json_string = os.environ.get(SECRET_KEY_NAME) 

    if not credentials_json_string:
        print("СИСТЕМА АВТОРИЗАЦИИ ТРЕБУЕТ НАСТРОЙКИ! Секрет не найден.")
        return None

    try:
        # 2. Парсим строку JSON в словарь Python
        credentials_info = json.loads(credentials_json_string)
        
        # 3. Аутентификация через словарь
        creds = Credentials.from_service_account_info(
            credentials_info, 
            scopes=Config.GOOGLE_SHEETS_SCOPES # Используем области из вашего config.py
        )
        
        # 4. Создаем клиент gspread
        client = gspread.authorize(creds)
        return client

    except Exception as e:
        print(f"Ошибка при авторизации Google API: {e}")
        return None

# Использование:
# gsheet_client = authorize_google_sheets()
# if gsheet_client:
#     # Можно работать с таблицами
#     sheet = gsheet_client.open_by_url(Config.USERS_SHEET_URL)
# else:
#     # Обработка ошибки
#     pass