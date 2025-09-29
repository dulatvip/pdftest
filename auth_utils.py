import os
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials
from flask import session, redirect, url_for, request # Импортируем для декоратора
from config import Config
from functools import wraps

class AuthManager:
    """Менеджер авторизации, использующий Google Sheets для данных пользователей."""
    
    def __init__(self):
        # Инициализация gspread клиента
        self.client = None
        self.sheet = None
        
        # ❌ УДАЛЕНО: self.creds_path = Config.get_credentials_path()
        # ❌ УДАЛЕНО: Проверка if not os.path.exists(self.creds_path):

        # 1. Получаем учетные данные из переменных окружения
        credentials_info = self._get_credentials_from_env()

        if not credentials_info:
            print("WARNING: Google API credentials (secrets) not found in environment variables.")
            print("СИСТЕМА АВТОРИЗАЦИИ ТРЕБУЕТ НАСТРОЙКИ! Проверьте Replit App Secrets.")
            return

        try:
            # 2. Авторизация клиента с помощью словаря данных
            creds = Credentials.from_service_account_info(credentials_info, scopes=Config.GOOGLE_SHEETS_SCOPES)
            self.client = gspread.authorize(creds)
            # 3. Открытие таблицы (предполагаем, что данные в первом листе)
            self.sheet = self.client.open_by_url(Config.USERS_SHEET_URL).sheet1
        except Exception as e:
            print(f"Error connecting to Google Sheets for Auth: {e}")
            self.client = None

    def _get_credentials_from_env(self):
        """Собирает информацию сервисного аккаунта из переменных окружения Replit Secrets."""
        
        # Проверяем наличие ключевого секрета (client_email), чтобы избежать лишней работы
        if not os.environ.get("client_email"):
            return None

        # ВАЖНО: Заменяем \\n на \n в private_key, иначе ключ не сработает!
        private_key = os.environ.get("private_key", "").replace('\\n', '\n')
        
        # Простая проверка, что ключ не пуст после замены
        if not private_key or not os.environ.get("project_id"):
             return None

        # Собираем данные в словарь, используя имена переменных из Replit Secrets
        return {
            "type": "service_account",
            "project_id": os.environ.get("project_id"),
            "private_key_id": os.environ.get("private_key_id"),
            "private_key": private_key,
            "client_email": os.environ.get("client_email"),
            "client_id": os.environ.get("client_id"),
            "auth_uri": os.environ.get("auth_uri"),
            "token_uri": os.environ.get("token_uri"),
            "auth_provider_x509_cert_url": os.environ.get("auth_provider_x509_cert_url"),
            "client_x509_cert_url": os.environ.get("client_x509_cert_url"),
            "universe_domain": os.environ.get("universe_domain")
        }
    
    def _fetch_users_data(self):
        """Получает данные пользователей из Google Таблицы."""
        if not self.sheet:
            return None

        # Ожидаемые заголовки: Login, Password, Expiration Date (в формате YYYY-MM-DD)
        try:
            # Получаем все записи как список словарей
            records = self.sheet.get_all_records()
            return records
        except Exception as e:
            print(f"Error fetching data from Google Sheets: {e}")
            return None

    def authenticate_user(self, login, password):
        # ⚠️ Обновляем сообщение об ошибке, если клиент не был инициализирован
        if not self.client:
            return {"success": False, "error": "Ошибка подключения к Google Sheets. Проверьте секреты Replit."}

        users_data = self._fetch_users_data()
        if users_data is None:
             return {"success": False, "error": "Не удалось загрузить данные пользователей."}
        print(f"Loaded users data: {users_data}")

        for user in users_data:
            # Проверка соответствия ключей заголовкам в вашей таблице
            user_login = user.get('Login') 
            user_password = user.get('Password')
            expiry_date_str = user.get('Expiration Date')
            
            if user_login == login and user_password == password:
                # Проверка срока действия
                days_left = None
                try:
                    expiry_date = datetime.strptime(expiry_date_str, '%Y-%m-%d').date()
                    today = datetime.now().date()
                    
                    if today > expiry_date:
                        return {"success": False, "error": f"Срок действия учетной записи истек ({expiry_date_str})."}
                    
                    days_left = (expiry_date - today).days

                except (ValueError, TypeError):
                    # Если формат даты неверен или отсутствует, считаем бессрочным
                    days_left = "Бессрочно"

                return {"success": True, "login": login, "days_left": days_left}
        
        return {"success": False, "error": "Неверный логин или пароль"}

auth_manager = AuthManager()

def login_required(f):
    """Декоратор для защиты маршрутов, требующих авторизации."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Проверяем, есть ли пользователь в сессии
        if session.get('logged_in') != True:
            # Сохраняем запрошенный URL для перенаправления после входа
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function
