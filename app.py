# app.py
import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template, abort
from werkzeug.utils import secure_filename
from google.oauth2 import service_account
from googleapiclient.discovery import build
from PIL import Image
from pdf2image import convert_from_path


# Загрузка конфигурации
try:
    from config import GOOGLE_CREDENTIALS_FILE, SHEET_ID, SHEET_NAME, UPLOAD_DIR, TEMPLATES_DIR, HOST, PORT, DEBUG
except Exception:
    # дефолтные значения
    GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "credentials/service-account.json")
    SHEET_ID = "1HhUse8eizCFiGJcjfwwG3MXECmfqrR_LIR_aTCQ1kSg"
    SHEET_NAME = "Sheet1"
    UPLOAD_DIR = "uploads"
    TEMPLATES_DIR = "templates_json"
    HOST = "0.0.0.0"
    PORT = 5000
    DEBUG = True

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

ALLOWED_EXT = {'pdf', 'png', 'jpg', 'jpeg'}

app = Flask(__name__, static_folder='static', template_folder='templates')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.',1)[1].lower() in ALLOWED_EXT

def get_sheets_service():
    creds = service_account.Credentials.from_service_account_file(
        GOOGLE_CREDENTIALS_FILE,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    service = build('sheets', 'v4', credentials=creds)
    return service

def append_row(values):
    service = get_sheets_service()
    range_name = f"{SHEET_NAME}!A:Z"
    body = {"values": [values]}
    result = service.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=range_name,
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body=body
    ).execute()
    return result

# --- Routes ---

@app.route("/")
def index():
    return render_template("list_templates.html")

# Editor interface
@app.route("/editor")
def editor():
    return render_template("editor.html")

# Student view (by template id)
@app.route("/test/<template_id>")
def test_page(template_id):
    return render_template("student.html", template_id=template_id)

# Serve uploaded files
@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)

# API: upload file (pdf/png/jpg) — returns filename
@app.route("/api/upload_file", methods=["POST"])
def api_upload_file():
    if 'file' not in request.files:
        return jsonify({"ok": False, "error": "No file part"}), 400

    f = request.files['file']
    if f.filename == "":
        return jsonify({"ok": False, "error": "No selected file"}), 400

    if f and allowed_file(f.filename):
        filename = secure_filename(f.filename)
        save_path = os.path.join(UPLOAD_DIR, filename)
        f.save(save_path)

        ext = filename.rsplit('.', 1)[1].lower()
        if ext == "pdf":
            try:
                # Конвертируем все страницы PDF
                images = convert_from_path(
                    save_path,
                    poppler_path=r"D:\poppler\Library\bin"  # путь к Poppler
                )

                page_files = []
                base = filename.rsplit('.', 1)[0]
                for i, img in enumerate(images, start=1):
                    img_filename = f"{base}_page{i}.png"
                    img_path = os.path.join(UPLOAD_DIR, img_filename)
                    img.save(img_path, "PNG")
                    page_files.append(img_filename)

                return jsonify({"ok": True, "pages": page_files})
            except Exception as e:
                return jsonify({"ok": False, "error": str(e)}), 500
        else:
            # Если загружается не PDF
            return jsonify({"ok": True, "pages": [filename]})
    else:
        return jsonify({"ok": False, "error": "Invalid extension"}), 400


# API: save template JSON
@app.route("/api/save_template", methods=["POST"])
def api_save_template():
    data = request.get_json()
    # expected: { "template_id": "lesson_7", "file": "lesson7.png", "width": 1200, "height": 1600, "fields": [ {id, x, y, w, h, variants:[...]} ] }
    template_id = data.get("template_id")
    if not template_id:
        return jsonify({"ok":False,"error":"template_id required"}), 400
    fname = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
    with open(fname, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    return jsonify({"ok": True, "path": fname})

# API: list templates
@app.route("/api/templates", methods=["GET"])
def api_list_templates():
    res = []
    for fn in os.listdir(TEMPLATES_DIR):
        if fn.endswith(".json"):
            path = os.path.join(TEMPLATES_DIR, fn)
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
                res.append(data)
    return jsonify(res)

# API: get template by id
@app.route("/api/template/<template_id>", methods=["GET"])
def api_get_template(template_id):
    path = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
    if not os.path.exists(path):
        return jsonify({"ok": False, "error": "not found"}), 404
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return jsonify(data)

# API: submit answers (student)
@app.route("/api/submit/<template_id>", methods=["POST"])
def api_submit(template_id):
    data = request.get_json(force=True)
    first = data.get("first_name","")
    last = data.get("last_name","")
    klass = data.get("class","")
    answers = data.get("answers", [])  # list of strings

    # load template to get key variants
    path = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
    if not os.path.exists(path):
        return jsonify({"ok": False, "error": "template not found"}), 404
    with open(path, encoding="utf-8") as fh:
        tpl = json.load(fh)

    fields = tpl.get("fields", [])
    total = len(fields)
    correct = 0

    def norm(s):
        if s is None:
            return ""
        return "".join(s.strip().lower().split())

    for i, field in enumerate(fields):
        allowed = field.get("variants", [])
        allowed_norm = [norm(x) for x in allowed]
        ans = ""
        if i < len(answers):
            ans = answers[i]
        if allowed_norm and norm(ans) in allowed_norm:
            correct += 1

    # prepare row
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    row = [timestamp, first, last, klass, template_id]
    # append each answer
    row.extend(answers)
    row.append(str(correct))
    row.append(str(total))

    try:
        append_row(row)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    return jsonify({"ok": True, "correct": correct, "total": total})

if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=DEBUG)
