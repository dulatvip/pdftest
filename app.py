from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for, flash
import os
import json
import uuid
from werkzeug.utils import secure_filename
from pdf2image import convert_from_path
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime, timedelta
import re
from functools import wraps
from config import Config
from auth_utils import AuthManager

app = Flask(__name__)
app.config.from_object(Config)

# Настройка сессий
app.secret_key = Config.SECRET_KEY
app.permanent_session_lifetime = timedelta(hours=Config.SESSION_TIMEOUT_HOURS)

# Создаем необходимые папки
Config.create_directories()

# Инициализируем менеджер авторизации
auth_manager = AuthManager()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def login_required(f):
    """Декоратор для проверки авторизации"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            # Для AJAX запросов возвращаем JSON
            if request.is_json or request.headers.get('Content-Type') == 'application/json':
                return jsonify({'error': 'Необходима авторизация', 'redirect': '/login'}), 401
            return redirect(url_for('login'))
        
        # Проверяем актуальность сессии
        if 'login_time' in session:
            login_time = datetime.fromisoformat(session['login_time'])
            if datetime.now() - login_time > app.permanent_session_lifetime:
                session.clear()
                if request.is_json or request.headers.get('Content-Type') == 'application/json':
                    return jsonify({'error': 'Сессия истекла', 'redirect': '/login'}), 401
                return redirect(url_for('login'))
        
        return f(*args, **kwargs)
    return decorated_function

def convert_pdf_to_images(pdf_path, output_dir):
    """Конвертация PDF в PNG изображения"""
    try:
        # Для Windows указываем путь к poppler
        if os.name == 'nt' and os.path.exists(Config.POPPLER_PATH):
            images = convert_from_path(pdf_path, dpi=Config.PDF_DPI, poppler_path=Config.POPPLER_PATH)
        else:
            images = convert_from_path(pdf_path, dpi=Config.PDF_DPI)
        
        image_files = []
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        
        for i, image in enumerate(images):
            image_filename = f"{base_name}_page_{i+1}.png"
            image_path = os.path.join(output_dir, image_filename)
            image.save(image_path, 'PNG')
            image_files.append(image_filename)
        
        return image_files
    except Exception as e:
        print(f"Ошибка конвертации PDF: {e}")
        return None

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

# === МАРШРУТЫ АВТОРИЗАЦИИ ===

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Страница входа в систему"""
    if request.method == 'POST':
        if request.is_json:
            # AJAX запрос
            data = request.get_json()
            login_name = data.get('login', '').strip()
            password = data.get('password', '').strip()
        else:
            # Обычная форма
            login_name = request.form.get('login', '').strip()
            password = request.form.get('password', '').strip()
        
        if not login_name or not password:
            error_msg = "Введите логин и пароль"
            if request.is_json:
                return jsonify({"success": False, "error": error_msg})
            else:
                return render_template('login.html', error=error_msg)
        
        # Проверяем учетные данные
        auth_result = auth_manager.authenticate_user(login_name, password)
        
        if auth_result["success"]:
            session['logged_in'] = True
            session['login'] = login_name
            session['login_time'] = datetime.now().isoformat()
            session.permanent = True
            
            # Добавляем информацию о подписке в сессию
            if 'days_left' in auth_result and auth_result['days_left'] is not None:
                session['days_left'] = auth_result['days_left']
            
            if request.is_json:
                return jsonify({"success": True, "redirect": url_for('index')})
            else:
                flash('Вход выполнен успешно!', 'success')
                return redirect(url_for('index'))
        else:
            if request.is_json:
                return jsonify(auth_result)
            else:
                return render_template('login.html', error=auth_result["error"])
    
    # Если пользователь уже авторизован, перенаправляем
    if 'logged_in' in session and session['logged_in']:
        return redirect(url_for('index'))
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Выход из системы"""
    session.clear()
    flash('Вы успешно вышли из системы', 'info')
    return redirect(url_for('login'))

@app.route('/user_info')
@login_required
def user_info():
    """Получение информации о текущем пользователе"""
    login = session.get('login')
    if login:
        info = auth_manager.get_user_info(login)
        return jsonify(info)
    return jsonify({"success": False, "error": "Пользователь не найден в сессии"})

# === ОСНОВНЫЕ МАРШРУТЫ ===

@app.route('/')
@login_required
def index():
    """Главная страница - редактор шаблонов"""
    user_login = session.get('login', 'Пользователь')
    days_left = session.get('days_left')
    return render_template('editor.html', user_login=user_login, days_left=days_left)

@app.route('/student')
@login_required  
def student():
    """Страница для студентов"""
    user_login = session.get('login', 'Пользователь')
    return render_template('student.html', user_login=user_login)

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    """Загрузка файлов"""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не выбран'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Добавляем префикс пользователя к имени файла для изоляции
        user_prefix = session.get('login', 'user')
        filename = f"{user_prefix}_{filename}"
        
        file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        # Если PDF - конвертируем в изображения
        if filename.lower().endswith('.pdf'):
            image_files = convert_pdf_to_images(file_path, Config.UPLOAD_FOLDER)
            if image_files:
                return jsonify({
                    'success': True,
                    'files': image_files,
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
@login_required
def uploaded_file(filename):
    """Отдача загруженных файлов"""
    return send_from_directory(Config.UPLOAD_FOLDER, filename)

@app.route('/save_template', methods=['POST'])
@login_required
def save_template():
    """Сохранение шаблона"""
    try:
        data = request.get_json()
        
        # Добавляем информацию о создателе
        data['created_by'] = session.get('login')
        data['created_at'] = datetime.now().isoformat()
        
        # Генерируем ID если не указан
        if 'template_id' not in data or not data['template_id']:
            user_prefix = session.get('login', 'user')
            data['template_id'] = f"{user_prefix}_tpl_{uuid.uuid4().hex[:8]}"
        
        # Сохраняем в JSON файл
        filename = f"{data['template_id']}.json"
        filepath = os.path.join(Config.TEMPLATES_FOLDER, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'template_id': data['template_id']})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/load_template/<template_id>')
@login_required
def load_template(template_id):
    """Загрузка шаблона"""
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
@login_required
def list_templates():
    """Список доступных шаблонов"""
    try:
        templates = []
        current_user = session.get('login')
        
        if os.path.exists(Config.TEMPLATES_FOLDER):
            for filename in os.listdir(Config.TEMPLATES_FOLDER):
                if filename.endswith('.json'):
                    filepath = os.path.join(Config.TEMPLATES_FOLDER, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            
                        # Показываем все шаблоны, но отмечаем владельца
                        template_info = {
                            'id': data.get('template_id', filename[:-5]),
                            'name': data.get('name', filename[:-5]),
                            'created_by': data.get('created_by', 'Неизвестно'),
                            'created_at': data.get('created_at', ''),
                            'is_owner': data.get('created_by') == current_user
                        }
                        templates.append(template_info)
                    except Exception as e:
                        print(f"Ошибка чтения шаблона {filename}: {e}")
                        continue
        
        # Сортируем по дате создания (новые сначала)
        templates.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return jsonify(templates)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/check_answers', methods=['POST'])
@login_required
def check_answers():
    """Проверка ответов студента"""
    try:
        data = request.get_json()
        template_id = data.get('template_id')
        answers = data.get('answers', {})
        student_info = data.get('student_info', {})
        sheet_url = data.get('sheet_url')

        # Добавляем информацию о том, кто проводил тест
        student_info['tested_by'] = session.get('login')
        student_info['test_date'] = datetime.now().isoformat()

        # Загружаем шаблон
        template_path = os.path.join(Config.TEMPLATES_FOLDER, f"{template_id}.json")
        if not os.path.exists(template_path):
            return jsonify({"success": False, "error": "Шаблон не найден"})

        with open(template_path, 'r', encoding='utf-8') as f:
            template = json.load(f)

        # Сортируем поля по ID для обеспечения консистентного порядка
        fields = sorted(template.get('fields', []), key=lambda x: x['id'])
        
        # Проверка ответов
        correct_count = 0
        total_count = len(fields)
        detailed_results = []
        student_answers_list = []  # Список ответов студента в порядке полей
        question_headers = []  # Заголовки для вопросов

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
            
            # Добавляем ответ студента в список
            student_answers_list.append(student_answer)
            
            # Создаем заголовок для вопроса
            if correct_variants:
                # Берем первый правильный вариант как основной заголовок
                base_header = correct_variants[0]
                # Очищаем от специальных символов и ограничиваем длину
                clean_header = re.sub(r'[^\w\s\-а-яё\'А-ЯЁ]', '', base_header)
                clean_header = clean_header[:30].strip()  # Ограничиваем длину
                
                # Если заголовок пустой после очистки, используем номер вопроса
                if not clean_header:
                    clean_header = f"Вопрос {i+1}"
                
                # Добавляем номер вопроса если есть дубликаты
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
                # Загружаем credentials
                creds_path = os.path.join(Config.CREDENTIALS_FOLDER, 'credentials.json')
                if not os.path.exists(creds_path):
                    sheets_result = {"success": False, "error": "Файл credentials.json не найден"}
                else:
                    creds = Credentials.from_service_account_file(creds_path, scopes=Config.GOOGLE_SHEETS_SCOPES)
                    client = gspread.authorize(creds)
                    
                    # Открываем таблицу по URL
                    sheet = client.open_by_url(sheet_url)
                    
                    # Создаем или получаем лист "Результаты"
                    try:
                        worksheet = sheet.worksheet("Результаты")
                    except gspread.WorksheetNotFound:
                        worksheet = sheet.add_worksheet(title="Результаты", rows=1000, cols=50)
                    
                    # Получаем все существующие данные
                    try:
                        existing_data = worksheet.get_all_values()
                    except:
                        existing_data = []
                    
                    # Создаем заголовки
                    base_headers = [
                        "Название шаблона",
                        "ФИО", 
                        "Класс",
                        "Дата",
                        "Время",
                        "Проверяющий",
                        "Правильных ответов",
                        "Всего вопросов",
                        "Процент"
                    ]
                    
                    all_headers = base_headers + question_headers
                    
                    # Если лист пустой или заголовки не совпадают, обновляем их
                    if not existing_data or existing_data[0] != all_headers:
                        worksheet.clear()
                        worksheet.append_row(all_headers)
                    
                    # Формируем данные для строки
                    now = datetime.now()
                    base_row_data = [
                        template.get("name", template_id),
                        student_info.get("name", ""),
                        student_info.get("class", ""),
                        now.strftime("%d.%m.%Y"),
                        now.strftime("%H:%M:%S"),
                        session.get('login', ''),
                        correct_count,
                        total_count,
                        f"{percentage}%"
                    ]
                    
                    complete_row_data = base_row_data + student_answers_list
                    
                    # Добавляем новую строку
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
            "question_headers": question_headers,
            "tested_by": session.get('login')
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/static/classes.json')
@login_required
def get_classes():
    """Получение списка классов"""
    try:
        classes_path = os.path.join(Config.STATIC_FOLDER, 'classes.json')
        with open(classes_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # Создаем файл по умолчанию
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

# === ОБРАБОТЧИКИ ОШИБОК ===

@app.errorhandler(401)
def unauthorized(error):
    if request.is_json:
        return jsonify({'error': 'Необходима авторизация', 'redirect': '/login'}), 401
    return redirect(url_for('login'))

@app.errorhandler(404)
def not_found(error):
    if request.is_json:
        return jsonify({'error': 'Страница не найдена'}), 404
    return render_template('error.html', error="Страница не найдена"), 404

@app.errorhandler(500)
def internal_error(error):
    if request.is_json:
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
    return render_template('error.html', error="Внутренняя ошибка сервера"), 500

if __name__ == '__main__':
    # Проверяем наличие credentials.json
    if not Config.check_credentials():
        print("\n" + "="*60)
        print("⚠️  ВНИМАНИЕ: Система авторизации требует настройки!")
        print("="*60)
    
    print(f"\n🚀 Запуск приложения...")
    print(f"📊 Google Таблица пользователей: {Config.USERS_SHEET_URL}")
    print(f"🔐 Авторизация: {'Включена' if Config.check_credentials() else 'Требует настройки'}")
    print(f"🌐 Приложение будет доступно по адресу: http://localhost:5000")
    
    app.run(debug=Config.DEBUG)