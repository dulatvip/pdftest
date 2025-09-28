#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для первоначальной настройки и инициализации системы авторизации
"""

import os
import json
import sys
from datetime import datetime, timedelta

def create_directory_structure():
    """Создание структуры директорий"""
    print("📁 Создание структуры директорий...")
    
    directories = [
        'uploads',
        'templates_json',
        'credentials', 
        'static',
        'static/css',
        'static/js',
        'templates'
    ]
    
    created = []
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            created.append(directory)
            
            # Создаем .gitkeep для пустых папок
            if directory in ['uploads', 'credentials']:
                gitkeep_path = os.path.join(directory, '.gitkeep')
                with open(gitkeep_path, 'w') as f:
                    f.write('# Папка должна существовать\n')
    
    if created:
        print(f"   ✅ Созданы папки: {', '.join(created)}")
    else:
        print("   ✅ Все папки уже существуют")

def create_sample_config():
    """Создание примера конфигурации"""
    config_example = """# Пример переменных окружения для продакшена
# Создайте файл .env и добавьте эти переменные

SECRET_KEY=your-very-secret-key-here-change-this
USERS_SHEET_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
FLASK_ENV=production
"""
    
    if not os.path.exists('.env.example'):
        with open('.env.example', 'w', encoding='utf-8') as f:
            f.write(config_example)
        print("   ✅ Создан файл .env.example")

def create_gitignore():
    """Создание .gitignore файла"""
    gitignore_content = """# Файлы конфигурации
.env
credentials/
*.log

# Загруженные файлы
uploads/
!uploads/.gitkeep

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Flask
instance/
.webassets-cache

# PyCharm
.idea/

# VS Code
.vscode/

# Jupyter Notebook
.ipynb_checkpoints

# pyenv
.python-version

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/
"""
    
    if not os.path.exists('.gitignore'):
        with open('.gitignore', 'w', encoding='utf-8') as f:
            f.write(gitignore_content)
        print("   ✅ Создан файл .gitignore")

def create_requirements():
    """Создание файла requirements.txt"""
    requirements = """Flask>=2.3.0
Werkzeug>=2.3.0
gspread>=5.10.0
google-auth>=2.20.0
pdf2image>=3.1.0
Pillow>=10.0.0
python-dotenv>=1.0.0
"""
    
    if not os.path.exists('requirements.txt'):
        with open('requirements.txt', 'w', encoding='utf-8') as f:
            f.write(requirements)
        print("   ✅ Создан файл requirements.txt")

def create_sample_classes():
    """Создание файла с классами по умолчанию"""
    classes_path = os.path.join('static', 'classes.json')
    
    if not os.path.exists(classes_path):
        default_classes = [
            "1А", "1Б", "1В", "1Г",
            "2А", "2Б", "2В", "2Г", 
            "3А", "3Б", "3В", "3Г",
            "4А", "4Б", "4В", "4Г",
            "5А", "5Б", "5В", "5Г",
            "6А", "6Б", "6В", "6Г",
            "7А", "7Б", "7В", "7Г",
            "8А", "8Б", "8В", "8Г",
            "9А", "9Б", "9В", "9Г",
            "10А", "10Б", "10В",
            "11А", "11Б", "11В"
        ]
        
        with open(classes_path, 'w', encoding='utf-8') as f:
            json.dump(default_classes, f, ensure_ascii=False, indent=2)
        print("   ✅ Создан файл static/classes.json")

def check_dependencies():
    """Проверка установленных зависимостей"""
    print("📦 Проверка зависимостей...")
    
    required_packages = [
        'flask',
        'gspread', 
        'google.auth',
        'pdf2image',
        'PIL'
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package.replace('.', '_'))
        except ImportError:
            missing.append(package)
    
    if missing:
        print(f"   ❌ Отсутствуют пакеты: {', '.join(missing)}")
        print("   💡 Выполните: pip install -r requirements.txt")
        return False
    else:
        print("   ✅ Все зависимости установлены")
        return True

def create_readme():
    """Создание README файла"""
    readme_content = """# Система тестирования с авторизацией

## Быстрый старт

1. **Установите зависимости:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Настройте Google Sheets API:**
   - Создайте проект в Google Cloud Console
   - Включите Google Sheets API
   - Создайте Service Account
   - Скачайте credentials.json в папку `credentials/`

3. **Настройте таблицу пользователей:**
   - Откройте вашу Google Таблицу
   - Дайте доступ Service Account email
   - Структура: Логин | Пароль | Дата истечения

4. **Запустите приложение:**
   ```bash
   python app.py
   ```

5. **Откройте браузер:**
   ```
   http://localhost:5000
   ```

## Структура проекта

```
├── app.py              # Основное приложение
├── config.py           # Конфигурация
├── auth_utils.py       # Утилиты авторизации
├── setup.py            # Скрипт инициализации
├── templates/          # HTML шаблоны
├── static/             # Статические файлы
├── uploads/            # Загруженные файлы
├── templates_json/     # Сохраненные шаблоны тестов
└── credentials/        # Файлы аутентификации
```

## Конфигурация

Основные настройки находятся в `config.py`:

- `USERS_SHEET_URL` - ссылка на Google Таблицу пользователей
- `SECRET_KEY` - секретный ключ Flask (измените!)
- `SESSION_TIMEOUT_HOURS` - время жизни сессии

## Безопасность

⚠️ **Важно для продакшена:**

- Измените `SECRET_KEY`
- Используйте HTTPS
- Ограничьте права Service Account
- Регулярно меняйте пароли

## Поддержка

Если возникли проблемы:

1. Проверьте `python setup.py` 
2. Убедитесь что credentials.json настроен
3. Проверьте доступы к Google Таблице
"""
    
    if not os.path.exists('README.md'):
        with open('README.md', 'w', encoding='utf-8') as f:
            f.write(readme_content)
        print("   ✅ Создан файл README.md")

def print_setup_instructions():
    """Вывод инструкций по настройке"""
    print(f"\n{'='*60}")
    print("🎉 СИСТЕМА ИНИЦИАЛИЗИРОВАНА!")
    print(f"{'='*60}")
    print("\n📋 СЛЕДУЮЩИЕ ШАГИ:")
    print("\n1. 📦 УСТАНОВИТЕ ЗАВИСИМОСТИ:")
    print("   pip install -r requirements.txt")
    
    print("\n2. 🔑 НАСТРОЙТЕ GOOGLE SHEETS API:")
    print("   - Перейдите в Google Cloud Console")
    print("   - Создайте новый проект")
    print("   - Включите Google Sheets API") 
    print("   - Создайте Service Account")
    print("   - Скачайте credentials.json в папку credentials/")
    
    print("\n3. 📊 НАСТРОЙТЕ ТАБЛИЦУ ПОЛЬЗОВАТЕЛЕЙ:")
    print("   - Откройте вашу Google Таблицу")
    print("   - Дайте доступ Service Account (email из credentials.json)")
    print("   - Структура: Столбец A=Логин, B=Пароль, C=Дата истечения")
    
    print("\n4. 🚀 ЗАПУСТИТЕ ПРИЛОЖЕНИЕ:")
    print("   python app.py")
    
    print("\n5. 🌐 ОТКРОЙТЕ В БРАУЗЕРЕ:")
    print("   http://localhost:5000")
    
    print(f"\n{'='*60}")
    print("💡 ПОЛЕЗНЫЕ КОМАНДЫ:")
    print("   python setup.py     # Повторная инициализация")
    print("   python app.py       # Запуск сервера")
    print(f"{'='*60}\n")

def main():
    """Главная функция инициализации"""
    print("🔧 ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ АВТОРИЗАЦИИ")
    print("="*60)
    
    # Создаем структуру
    create_directory_structure()
    
    # Создаем конфигурационные файлы
    print("\n📝 Создание конфигурационных файлов...")
    create_sample_config()
    create_gitignore()
    create_requirements()
    create_sample_classes()
    create_readme()
    
    # Проверяем зависимости
    print()
    deps_ok = check_dependencies()
    
    # Выводим инструкции
    print_setup_instructions()
    
    if not deps_ok:
        print("⚠️  Сначала установите отсутствующие зависимости!")
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(main())