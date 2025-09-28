class Config:
    DEBUG = True
    SECRET_KEY = "super-secret-key"

    SESSION_TIMEOUT_HOURS = 2  

    UPLOAD_FOLDER = "uploads"
    TEMPLATES_FOLDER = "templates_json"
    STATIC_FOLDER = "static"
    CREDENTIALS_FOLDER = "credentials"

    PDF_DPI = 200
    POPPLER_PATH = r"C:\Program Files\poppler-23.05.0\Library\bin"

    GOOGLE_SHEETS_SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    # 🔑 Вот эту переменную нужно обязательно прописать:
    USERS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1yI_73HFTwXFuG2-2nwxqodoGCM0gDC6uDDp16t3aLa8/edit?gid=0#gid=0"

    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}

    @staticmethod
    def create_directories():
        import os
        for folder in [Config.UPLOAD_FOLDER, Config.TEMPLATES_FOLDER, Config.STATIC_FOLDER, Config.CREDENTIALS_FOLDER]:
            os.makedirs(folder, exist_ok=True)

    @staticmethod
    def check_credentials():
        import os
        creds_path = os.path.join(Config.CREDENTIALS_FOLDER, 'credentials.json')
        return os.path.exists(creds_path)
