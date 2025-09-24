# config_example.py
import os

# Путь к JSON-ключу сервисного аккаунта Google (установите этот путь в env GOOGLE_APPLICATION_CREDENTIALS или сюда)
GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "credentials/pdftest-473116-4b109bbff929.json")

# ID Google Sheets (вставьте ваш ID)
SHEET_ID = "1HhUse8eizCFiGJcjfwwG3MXECmfqrR_LIR_aTCQ1kSg"

# Имя листа в таблице Google Sheets
SHEET_NAME = "Sheet1"

# Куда сохранять загруженные файлы и шаблоны
UPLOAD_DIR = "uploads"
TEMPLATES_DIR = "templates_json"

# Дополнительно: HOST/PORT (при локальном запуске)
HOST = "0.0.0.0"
PORT = 5000
DEBUG = True
