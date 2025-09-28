from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for
import os
import json
import uuid
from werkzeug.utils import secure_filename
# --- ИЗМЕНЕНИЯ ЗДЕСЬ ---
# from pdf2image import convert_from_path # <-- УДАЛЕНО
import fitz # <-- ДОБАВЛЕНО: PyMuPDF
# -----------------------
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime
import re
from config_0 import Config
from auth_utils import auth_manager, login_required

app = Flask(__name__)
app.config.from_object(Config)
app.secret_key = app.config['SECRET_KEY']

# Создаем необходимые папки
Config.create_directories()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

# ==============================================================================
# НОВАЯ ФУНКЦИЯ КОНВЕРТАЦИИ PDF с использованием fitz
# ==============================================================================
def convert_pdf_to_images(pdf_path, output_dir):
    """Конвертация PDF в PNG изображения с использованием PyMuPDF и передача масштаба для полей"""
    image_data = []
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    
    try:
        doc = fitz.open(pdf_path)
        zoom = Config.PDF_DPI / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=matrix)
            image_filename = f"{base_name}_page_{i+1}.png"
            image_path = os.path.join(output_dir, image_filename)
            pix.save(image_path)
            
            image_data.append({
                'filename': image_filename,
                'width': pix.width,
                'height': pix.height,
                'page_width': page.rect.width,   # ширина страницы в PDF points
                'page_height': page.rect.height, # высота страницы в PDF points
                'zoom': zoom
            })
        
        doc.close()
        return image_data
    except Exception as e:
        print(f"Ошибка конвертации PDF (PyMuPDF): {e}")
        return None
# ==============================================================================

def save_to_google_sheets(sheet_url, student_data):
    """Сохранение результатов в Google Таблицы"""
    try:
        # Загружаем credentials
        creds_path = os.path.join(Config.CREDENTIALS_FOLDER, 'credentials.json')
        if not os.path.exists(creds_path):
            return {"error": "Файл credentials.json не найден"}
        
        creds = Credentials.from_service_account_file(creds_path, scopes=Config.GOOGLE_SHEETS_SCOPES)
        client = gspread.authorize(creds)
        
        # Открываем таблицу по URL
        sheet = client.open_by_url(sheet_url)
        
        # Создаем или получаем лист "Результаты"
        try:
            worksheet = sheet.worksheet("Результаты")
        except gspread.WorksheetNotFound:
            worksheet = sheet.add_worksheet(title="Результаты", rows=1000, cols=10)
            # Добавляем заголовки
            worksheet.append_row(['ФИО', 'Класс', 'Дата', 'Время', 'Правильных ответов', 'Всего вопросов', 'Процент'])
        
        # Добавляем данные
        now = datetime.now()
        date_str = now.strftime('%d.%m.%Y')
        time_str = now.strftime('%H:%M:%S')
        
        total_questions = student_data['total_questions']
        correct_answers = student_data['correct_answers']
        percentage = round((correct_answers / total_questions * 100), 1) if total_questions > 0 else 0
        
        row_data = [
            student_data['name'],
            student_data['class'],
            date_str,
            time_str,
            correct_answers,
            total_questions,
            f"{percentage}%"
        ]
        
        worksheet.append_row(row_data)
        return {"success": True}
        
    except Exception as e:
        return {"error": str(e)}

@app.route('/')
@login_required
def index():
    return render_template('editor.html', login=session.get('login'))
    
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'):
        return redirect(url_for('index'))
        
    error = None
    if request.method == 'POST':
        login_val = request.form.get('login')
        password_val = request.form.get('password')
        
        result = auth_manager.authenticate_user(login_val, password_val)
        
        if result['success']:
            session['logged_in'] = True
            session['login'] = result['login']
            next_url = request.args.get('next') or url_for('index')
            return redirect(next_url)
        else:
            error = result['error']
            
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    session.pop('login', None)
    return redirect(url_for('login'))


@app.route('/student')
def student():
    return render_template('student.html')

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не выбран'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        if filename.lower().endswith('.pdf'):
            image_data = convert_pdf_to_images(file_path, Config.UPLOAD_FOLDER)
            if image_data:
                return jsonify({
                    'success': True,
                    'files': [item['filename'] for item in image_data],
                    'images_data': image_data,  # данные о размере, zoom и page_height
                    'type': 'pdf'
                })
            else:
                return jsonify({'error': 'Ошибка конвертации PDF'}), 500
        else:
            return jsonify({
                'success': True,
                'files': [filename],
                'type': 'image'
            })
    
    return jsonify({'error': 'Неподдерживаемый формат файла'}), 400


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(Config.UPLOAD_FOLDER, filename)

@app.route('/save_template', methods=['POST'])
@login_required
def save_template():
    try:
        data = request.get_json()
        
        # Генерируем ID если не указан
        if 'template_id' not in data or not data['template_id']:
            data['template_id'] = f"tpl_{uuid.uuid4().hex[:8]}"
        
        # Сохраняем в JSON файл
        filename = f"{data['template_id']}.json"
        filepath = os.path.join(Config.TEMPLATES_FOLDER, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'template_id': data['template_id']})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/load_template/<template_id>')
def load_template(template_id):
    try:
        filepath = os.path.join(Config.TEMPLATES_FOLDER, f"{template_id}.json")
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Шаблон не найден'}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return jsonify(data)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_templates')
def list_templates():
    try:
        templates = []
        if os.path.exists(Config.TEMPLATES_FOLDER):
            for filename in os.listdir(Config.TEMPLATES_FOLDER):
                if filename.endswith('.json'):
                    filepath = os.path.join(Config.TEMPLATES_FOLDER, filename)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        templates.append({
                            'id': data.get('template_id', filename[:-5]),
                            'name': data.get('name', filename[:-5])
                        })
        
        return jsonify(templates)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/check_answers', methods=['POST'])
def check_answers():
    try:
        data = request.get_json()
        template_id = data.get('template_id')
        answers = data.get('answers', {})
        student_info = data.get('student_info', {})
        sheet_url = data.get('sheet_url')

        # Загружаем шаблон
        template_path = os.path.join(Config.TEMPLATES_FOLDER, f"{template_id}.json")
        if not os.path.exists(template_path):
            return jsonify({"success": False, "error": "Шаблон не найден"})

        with open(template_path, 'r', encoding='utf-8') as f:
            template = json.load(f)

        # Сортируем поля по ID для обеспечения консистентного порядка
        #fields = sorted(template.get('fields', []), key=lambda x: x['id'])
        fields = template.get('fields', []) 
        
        # Проверка ответов
        correct_count = 0
        total_count = len(fields)
        detailed_results = []
        student_answers_list = [] 
        question_headers = [] 

        for i, field in enumerate(fields):
            field_id = field['id']
            correct_variants = [v.strip().lower() for v in field.get('variants', [])]
            student_answer = answers.get(field_id, "").strip()
            student_answer_lower = student_answer.lower()

            is_correct = student_answer_lower in correct_variants if correct_variants else False
            if is_correct:
                correct_count += 1

            detailed_results.append({
                "field_id": field_id,
                "student_answer": student_answer,
                "correct_variants": correct_variants,
                "is_correct": is_correct
            })
            
            student_answers_list.append(student_answer)
            
            if correct_variants:
                base_header = correct_variants[0]
                clean_header = re.sub(r'[^\w\s\-а-яёА-ЯЁ]', '', base_header)
                clean_header = clean_header[:30].strip()
                
                if not clean_header:
                    clean_header = f"Вопрос {i+1}"
                
                header = clean_header
                if clean_header in question_headers:
                    header = f"{clean_header} ({i+1})"
            else:
                header = f"Вопрос {i+1}"
            
            question_headers.append(header)

        percentage = round((correct_count / total_count) * 100, 2) if total_count else 0

        # Запись в Google Sheets
        sheets_result = None
        if sheet_url:
            try:
                creds_path = os.path.join(Config.CREDENTIALS_FOLDER, 'credentials.json')
                if not os.path.exists(creds_path):
                    sheets_result = {"success": False, "error": "Файл credentials.json не найден"}
                else:
                    creds = Credentials.from_service_account_file(creds_path, scopes=Config.GOOGLE_SHEETS_SCOPES)
                    client = gspread.authorize(creds)
                    
                    sheet = client.open_by_url(sheet_url)
                    
                    try:
                        worksheet = sheet.worksheet("Результаты")
                    except gspread.WorksheetNotFound:
                        worksheet = sheet.add_worksheet(title="Результаты", rows=1000, cols=10)
                    
                    try:
                        existing_data = worksheet.get_all_values()
                    except:
                        existing_data = []
                    
                    base_headers = [
                        "Название шаблона",
                        "ФИО", 
                        "Класс",
                        "Дата",
                        "Время",
                        "Правильных ответов",
                        "Всего вопросов",
                        "Процент"
                    ]
                    
                    all_headers = base_headers + question_headers
                    
                    if not existing_data or existing_data[0] != all_headers:
                        worksheet.clear()
                        worksheet.append_row(all_headers)
                    
                    now = datetime.now()
                    base_row_data = [
                        template.get("name", template_id),
                        student_info.get("name", ""),
                        student_info.get("class", ""),
                        now.strftime("%d.%m.%Y"),
                        now.strftime("%H:%M:%S"),
                        correct_count,
                        total_count,
                        f"{percentage}%"
                    ]
                    
                    complete_row_data = base_row_data + student_answers_list
                    
                    worksheet.append_row(complete_row_data)
                    
                    sheets_result = {
                        "success": True,
                        "message": f"Результаты сохранены. Добавлено {len(complete_row_data)} значений",
                        "headers": question_headers
                    }
                    
            except Exception as e:
                sheets_result = {"success": False, "error": str(e)}

        return jsonify({
            "success": True,
            "correct_count": correct_count,
            "total_count": total_count,
            "percentage": percentage,
            "details": detailed_results,
            "sheets_result": sheets_result,
            "question_headers": question_headers
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/static/classes.json')
def get_classes():
    try:
        classes_path = os.path.join(Config.STATIC_FOLDER, 'classes.json')
        with open(classes_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        default_classes = [
            "1А", "1Б", "1В",
            "2А", "2Б", "2В", 
            "3А", "3Б", "3В",
            "4А", "4Б", "4В",
            "5А", "5Б", "5В",
            "6А", "6Б", "6В",
            "7А", "7Б", "7В",
            "8А", "8Б", "8В",
            "9А", "9Б", "9В",
            "10А", "10Б",
            "11А", "11Б"
        ]
        
        os.makedirs(Config.STATIC_FOLDER, exist_ok=True)
        classes_path = os.path.join(Config.STATIC_FOLDER, 'classes.json')
        with open(classes_path, 'w', encoding='utf-8') as f:
            json.dump(default_classes, f, ensure_ascii=False, indent=2)
        
        return jsonify(default_classes)

if __name__ == '__main__':
    app.run(debug=Config.DEBUG)