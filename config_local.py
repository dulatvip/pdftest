# config_local.py
class Config:
    DEBUG = True
    SECRET_KEY = "local-dev-key"
    
    # Отключаем Google Sheets для локальной разработки
    USERS_SHEET_URL = None
    
    UPLOAD_FOLDER = "uploads"
    TEMPLATES_FOLDER = "templates_json"
    STATIC_FOLDER = "static"
    CREDENTIALS_FOLDER = "credentials"

    PDF_DPI = 200
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}

    @staticmethod
    def create_directories():
        import os
        for folder in [Config.UPLOAD_FOLDER, Config.TEMPLATES_FOLDER, Config.STATIC_FOLDER, Config.CREDENTIALS_FOLDER]:
            os.makedirs(folder, exist_ok=True)

    @staticmethod
    def check_credentials():
        return False  # Отключаем проверку credentials