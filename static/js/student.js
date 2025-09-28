// Глобальные переменные
let currentTemplate = null;
let currentPage = 0;
let studentAnswers = {};
let studentInfo = {};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    loadClasses();
    loadTemplateList();
    setupModal();

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.addEventListener('change', loadClasses);
    }
});

function setupModal() {
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');
    
    if (!modal || !closeBtn) return;

    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };
    
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

function showModal(message) {
    const modalText = document.getElementById('modalText');
    const modal = document.getElementById('modal');
    if (modalText && modal) {
        modalText.textContent = message;
        modal.style.display = 'block';
    } else {
        alert(message);
    }
}

async function loadClasses() {
    try {
        const templateSelect = document.getElementById('templateSelect');
        const selectedTemplateId = templateSelect ? templateSelect.value : null;
        
        if (selectedTemplateId) {
            const response = await fetch(`/load_template/${selectedTemplateId}`);
            const template = await response.json();
            
            if (response.ok && template.classes && template.classes.length > 0) {
                populateClassSelect(template.classes);
                return;
            }
        }
        
        const response = await fetch('/static/classes.json');
        const classes = await response.json();
        populateClassSelect(classes);
        
    } catch (error) {
        console.error('Ошибка загрузки классов:', error);
        const defaultClasses = ["5А", "5Б", "6А", "6Б", "7А", "7Б", "8А", "8Б", "9А", "9Б", "10А", "10Б", "11А", "11Б"];
        populateClassSelect(defaultClasses);
    }
}

function populateClassSelect(classes) {
    const select = document.getElementById('studentClass');
    if (!select) return;

    select.innerHTML = '<option value="">Выберите класс...</option>';
    
    classes.forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className;
        select.appendChild(option);
    });
}

async function loadTemplateList() {
    try {
        const response = await fetch('/list_templates');
        if (!response.ok) {
            throw new Error('Не удалось загрузить шаблоны');
        }

        const templates = await response.json();
        const select = document.getElementById('templateSelect');
        
        if (!select) return;

        select.innerHTML = '<option value="">Выберите задание...</option>';
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name || t.id;
            select.appendChild(opt);
        });

    } catch (error) {
        console.error('Ошибка загрузки шаблонов:', error);
        showModal('Ошибка при загрузке списка заданий');
    }
}

async function startTest() {
    const name = document.getElementById('studentName').value.trim();
    const studentClass = document.getElementById('studentClass').value;
    const templateId = document.getElementById('templateSelect').value;
    
    if (!name) {
        showModal('Введите ФИО');
        return;
    }
    
    if (!studentClass) {
        showModal('Выберите класс');
        return;
    }
    
    if (!templateId) {
        showModal('Выберите задание');
        return;
    }
    
    try {
        const response = await fetch(`/load_template/${templateId}`);
        const template = await response.json();
        
        if (response.ok) {
            currentTemplate = template;
            currentPage = 0;
            studentAnswers = {};
            studentInfo = { 
                name: name, 
                class: studentClass, 
                sheetUrl: template.sheet_url 
            };
            
            document.getElementById('studentForm').style.display = 'none';
            document.getElementById('testArea').style.display = 'block';
            document.getElementById('displayName').textContent = name;
            document.getElementById('displayClass').textContent = studentClass;
            
            loadTestDocument();
            updateProgress();
            
        } else {
            showModal('Ошибка загрузки задания: ' + template.error);
        }
    } catch (error) {
        showModal('Ошибка: ' + error.message);
    }
}

function loadTestDocument() {
    const viewer = document.getElementById('documentViewer');
    if (!viewer) return;
    
    viewer.innerHTML = '';

    if (!currentTemplate?.files?.length) {
        viewer.innerHTML = '<div class="placeholder">Файлы документа не найдены</div>';
        return;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'document-page';
    pageDiv.id = `test-page-${currentPage}`;
    pageDiv.style.position = 'relative';
    pageDiv.style.display = 'inline-block';

    const img = document.createElement('img');
    img.src = `/uploads/${currentTemplate.files[currentPage]}`;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';

    img.onload = function() {
        if (!currentTemplate.width) {
            currentTemplate.width = img.naturalWidth;
            currentTemplate.height = img.naturalHeight;
        }
        renderFieldsForPage(currentPage);
        updatePageNavigation();
    };
    
    img.onerror = function() {
        pageDiv.innerHTML = '<div class="placeholder">Ошибка загрузки изображения</div>';
    };

    pageDiv.appendChild(img);
    viewer.appendChild(pageDiv);
}
function renderFieldsForPage(pageIndex) {
    const viewer = document.getElementById('documentViewer');
    viewer.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'document-page';
    page.style.position = 'relative';

    const img = document.createElement('img');
    img.src = `/uploads/${currentTemplate.files[pageIndex]}`;
    img.style.width = '100%';

    img.onload = function() {
        drawFields(page, img, pageIndex);
        // При изменении размера окна пересчитываем поля
        window.addEventListener('resize', () => {
            drawFields(page, img, pageIndex);
        });
    };

    page.appendChild(img);
    viewer.appendChild(page);
}

function drawFields(page, img, pageIndex) {
    // Убираем старые поля
    page.querySelectorAll('.student-field-wrapper').forEach(el => el.remove());

    const originalW = currentTemplate.width;
    const originalH = currentTemplate.height;

    const scaleX = img.clientWidth / originalW;
    const scaleY = img.clientHeight / originalH;

    currentTemplate.fields
        .filter(f => f.page === pageIndex) // строго только текущая страница
        .forEach(f => {
            const wrapper = document.createElement('div');
            wrapper.className = 'student-field-wrapper';
            wrapper.style.left = (f.x * scaleX) + 'px';
            wrapper.style.top = (f.y * scaleY) + 'px';
            wrapper.style.width = (f.w * scaleX) + 'px';
            wrapper.style.height = (f.h * scaleY) + 'px';
            wrapper.style.position = 'absolute';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'student-field';
            input.dataset.fieldId = f.id;

            // ВОССТАНАВЛИВАЕМ значение из studentAnswers
            if (studentAnswers[f.id] !== undefined) {
                input.value = studentAnswers[f.id];
            }

            // Сохраняем в объект при вводе
            input.addEventListener('input', (e) => {
                studentAnswers[f.id] = e.target.value;
                updateProgress();
            });
            input.addEventListener('blur', (e) => {
                studentAnswers[f.id] = e.target.value.trim();
                updateProgress();
            });

            wrapper.appendChild(input);
            page.appendChild(wrapper);
        });
}


function updatePageNavigation() {
    const nav = document.getElementById('pageNavigation');
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (!nav || !pageInfo) return;
    
    if (currentTemplate.files && currentTemplate.files.length > 1) {
        nav.style.display = 'flex';
        pageInfo.textContent = `${currentPage + 1} / ${currentTemplate.files.length}`;
        if (prevBtn) prevBtn.disabled = currentPage === 0;
        if (nextBtn) nextBtn.disabled = currentPage === currentTemplate.files.length - 1;
    } else {
        nav.style.display = 'none';
    }
}

function prevPage() {
    if (currentPage > 0) {
        saveCurrentPageAnswers();
        currentPage--;
        loadTestDocument();
    }
}

function nextPage() {
    if (currentPage < currentTemplate.files.length - 1) {
        saveCurrentPageAnswers();
        currentPage++;
        loadTestDocument();
    }
}

function saveCurrentPageAnswers() {
    document.querySelectorAll('.student-field').forEach(input => {
        const fieldId = input.dataset.fieldId;
        if (fieldId) {
            studentAnswers[fieldId] = input.value.trim();
        }
    });
}

function updateProgress() {
    const totalFields = currentTemplate?.fields?.length || 0;
    const filledFields = Object.values(studentAnswers).filter(v => v.trim() !== '').length;
    
    const progressElement = document.getElementById('progress');
    const totalFieldsElement = document.getElementById('totalFields');
    
    if (progressElement) progressElement.textContent = filledFields;
    if (totalFieldsElement) totalFieldsElement.textContent = totalFields;
}

async function checkAnswers() {
    saveCurrentPageAnswers();

    const totalFields = currentTemplate.fields.length;
    const filledFields = Object.values(studentAnswers).filter(v => v.trim() !== '').length;

    if (filledFields < totalFields) {
        showModal(`Заполнено ${filledFields} из ${totalFields} вопросов. Заполните все поля.`);
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Проверка...';
        submitBtn.disabled = true;
    }

    try {
        const response = await fetch('/check_answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: currentTemplate.template_id,
                answers: studentAnswers,
                student_info: studentInfo,
                sheet_url: studentInfo.sheetUrl
            })
        });

        const result = await response.json();
        if (result.success) {
            showResults(result);
        } else {
            showModal('Ошибка проверки: ' + result.error);
        }
    } catch (error) {
        showModal('Ошибка: ' + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.textContent = 'Завершить и проверить';
            submitBtn.disabled = false;
        }
    }
}

function showResults(result) {
    document.getElementById('testArea').style.display = 'none';
    document.getElementById('results').style.display = 'block';
    
    const percentage = Math.round((result.correct_count / result.total_count) * 100);
    
    const scorePercent = document.getElementById('scorePercent');
    const correctCount = document.getElementById('correctCount');
    const totalCount = document.getElementById('totalCount');
    
    if (scorePercent) scorePercent.textContent = percentage + '%';
    if (correctCount) correctCount.textContent = result.correct_count;
    if (totalCount) totalCount.textContent = result.total_count;
    
    const scoreCircle = document.querySelector('.score-circle');
    if (scoreCircle) {
        scoreCircle.style.backgroundColor = 
            percentage >= 80 ? '#27ae60' : 
            percentage >= 60 ? '#f39c12' : '#e74c3c';
    }
    
    const sheetsStatus = document.getElementById('sheetsStatus');
    if (sheetsStatus) {
        if (result.sheets_result?.success) {
            sheetsStatus.innerHTML = "Результаты и ответы сохранены в Google Таблице";
            sheetsStatus.style.color = "#27ae60";
            
            if (result.sheets_result.message) {
                const detailSpan = document.createElement('div');
                detailSpan.style.fontSize = '12px';
                detailSpan.style.marginTop = '5px';
                detailSpan.textContent = result.sheets_result.message;
                sheetsStatus.appendChild(detailSpan);
            }
            
            if (result.sheets_result.headers_used) {
                console.log('Заголовки колонок ответов:', result.sheets_result.headers_used);
            }
        } else {
            sheetsStatus.textContent = "Не удалось сохранить в Google Таблицу: " + (result.sheets_result?.error || "");
            sheetsStatus.style.color = "#e74c3c";
        }
    }
    
    // Логируем сохраненные ответы для отладки
    if (result.student_answers) {
        console.log('Сохраненные ответы студента:', result.student_answers);
    }
    
    const answerReview = document.getElementById('answerReview');
    if (answerReview && result.details) {
        answerReview.innerHTML = '<h3>Результаты по вопросам:</h3>';
        result.details.forEach((detail, index) => {
            const div = document.createElement('div');
            div.innerHTML = `
                <div style="margin: 10px 0; padding: 10px; border-radius: 5px; 
                           background: ${detail.is_correct ? '#d4edda' : '#f8d7da'}; 
                           border: 1px solid ${detail.is_correct ? '#c3e6cb' : '#f5c6cb'};">
                    <strong>Вопрос ${index + 1}:</strong> 
                    ${detail.is_correct ? 'Правильно' : 'Неправильно'}<br>
                    Ваш ответ: "${detail.student_answer || '—'}"<br>
                    Правильно: ${detail.correct_variants.join(', ') || '—'}
                </div>
            `;
            answerReview.appendChild(div);
        });
    }
}

function resetTest() {
    currentTemplate = null;
    currentPage = 0;
    studentAnswers = {};
    studentInfo = {};
    
    document.getElementById('results').style.display = 'none';
    document.getElementById('testArea').style.display = 'none';
    document.getElementById('studentForm').style.display = 'block';
    
    document.getElementById('studentName').value = '';
    document.getElementById('studentClass').value = '';
    document.getElementById('templateSelect').value = '';
}

// Обработчик изменения размера окна
window.addEventListener('resize', function() {
    if (currentTemplate) {
        saveCurrentPageAnswers();
        
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(() => {
            renderFieldsForPage(currentPage);
        }, 200);
    }
});

// Обработчик ориентации для мобильных
window.addEventListener('orientationchange', function() {
    if (currentTemplate) {
        saveCurrentPageAnswers();
        
        setTimeout(() => {
            renderFieldsForPage(currentPage);
        }, 800);
    }
});

// Функция для диагностики позиционирования полей (вызывать из консоли)
window.debugFieldPositions = function() {
    if (!currentTemplate) {
        console.log('Нет загруженного шаблона');
        return;
    }
    
    const page = document.getElementById(`test-page-${currentPage}`);
    const img = page ? page.querySelector('img') : null;
    
    if (!img) {
        console.log('Изображение не найдено');
        return;
    }
    
    console.log('=== ДИАГНОСТИКА ПОЗИЦИОНИРОВАНИЯ ===');
    console.log(`Размер шаблона: ${currentTemplate.width}x${currentTemplate.height}`);
    console.log(`Размер изображения: ${img.offsetWidth}x${img.offsetHeight}`);
    console.log(`Масштаб: ${(img.offsetWidth / currentTemplate.width).toFixed(3)}`);
    console.log(`Смещение изображения: left=${img.offsetLeft}, top=${img.offsetTop}`);
    
    const pageFields = currentTemplate.fields.filter(f => f.page === currentPage);
    pageFields.forEach(field => {
        console.log(`Поле ${field.id}:`);
        console.log(`  Исходные координаты: (${field.x}, ${field.y})`);
        console.log(`  Исходный размер: ${field.w}x${field.h}`);
        
        const wrapper = document.querySelector(`[data-field-id="${field.id}"]`)?.parentElement;
        if (wrapper) {
            console.log(`  Финальная позиция: (${wrapper.style.left}, ${wrapper.style.top})`);
            console.log(`  Финальный размер: ${wrapper.style.width}x${wrapper.style.height}`);
        }
    });
};

// Функция для принудительной перерисовки полей (для отладки)
window.forceRedraw = function() {
    if (currentTemplate) {
        console.log('Принудительная перерисовка полей...');
        saveCurrentPageAnswers();
        renderFieldsForPage(currentPage);
    }
};

console.log('Student.js загружен полностью');