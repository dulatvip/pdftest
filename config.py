import os

class Config:
    DEBUG = True
    SECRET_KEY = "super-secret-key"

    UPLOAD_FOLDER = 'uploads'
    TEMPLATES_FOLDER = 'templates_json'
    STATIC_FOLDER = 'static'

    SESSION_TIMEOUT_HOURS = 2  

    # 📂 Абсолютный путь до корня проекта
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    TEMPLATES_FOLDER = os.path.join(BASE_DIR, "templates_json")
    STATIC_FOLDER = os.path.join(BASE_DIR, "static")

    PDF_DPI = 200

    GOOGLE_SHEETS_SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    # 🔑 ссылка на Google Sheets
    USERS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1yI_73HFTwXFuG2-2nwxqodoGCM0gDC6uDDp16t3aLa8/edit?gid=0#gid=0"

    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}


    @staticmethod
    def create_directories():
        import os
        for folder in [
            Config.UPLOAD_FOLDER, 
            Config.TEMPLATES_FOLDER, 
            Config.STATIC_FOLDER, 
            "templates"
        ]:os.makedirs(folder, exist_ok=True)

   
