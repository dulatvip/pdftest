// Глобальные переменные
let currentTemplate = {
    template_id: '',
    name: '',
    files: [],
    width: 0,
    height: 0,
    fields: [],
    sheet_url: '',
    classes: []
};

let currentPage = 0;
let selectedField = null;
let fieldCounter = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', function () {
    setupEventListeners();
    loadTemplateList();
    setupModal();
});

function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Клик вне поля — убираем выделение
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.field') && !event.target.closest('#fieldProperties')) {
            clearFieldSelection();
        }
    });
}

function setupModal() {
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');

    if (closeBtn) {
        closeBtn.onclick = function () {
            modal.style.display = 'none';
        };
    }

    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

function showModal(message) {
    console.log('Modal message:', message);
    const modalText = document.getElementById('modalText');
    const modal = document.getElementById('modal');
    if (modalText && modal) {
        modalText.textContent = message;
        modal.style.display = 'block';
    } else {
        alert(message);
    }
}

// ==================== Работа с документом ====================

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            currentTemplate = {
                template_id: '',
                name: '',
                files: result.files,
                width: 0,
                height: 0,
                fields: [],
                sheet_url: '',
                classes: []
            };
            currentPage = 0;
            fieldCounter = 0; // Сбрасываем счетчик для нового документа

            loadDocument();
            enableEditingControls();
            clearForm();
        } else {
            showModal('Ошибка загрузки: ' + result.error);
        }
    } catch (error) {
        showModal('Ошибка: ' + error.message);
    }
}

function clearForm() {
    ['templateName', 'sheetUrl', 'availableClasses'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    updateFieldCount();
}

function loadDocument() {
    const viewer = document.getElementById('documentViewer');
    if (!viewer) return;

    viewer.innerHTML = '';

    if (!currentTemplate.files || currentTemplate.files.length === 0) {
        viewer.innerHTML = '<div class="placeholder">Файлы документа не найдены</div>';
        return;
    }

    if (currentPage >= currentTemplate.files.length) {
        currentPage = 0;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'document-page';
    pageDiv.id = `page-${currentPage}`;
    pageDiv.style.position = 'relative';

    const img = document.createElement('img');
    img.src = `/uploads/${currentTemplate.files[currentPage]}`;
    img.onload = function () {
        currentTemplate.width = this.naturalWidth;
        currentTemplate.height = this.naturalHeight;
        loadFieldsForCurrentPage();
    };

    img.onerror = function () {
        pageDiv.innerHTML = '<div class="placeholder">Ошибка загрузки изображения</div>';
    };

    pageDiv.appendChild(img);
    viewer.appendChild(pageDiv);

    updatePageNavigation();
}

function updatePageNavigation() {
    const nav = document.getElementById('pageNavigation');
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (!nav || !pageInfo || !prevBtn || !nextBtn) return;

    if (currentTemplate.files && currentTemplate.files.length > 1) {
        nav.style.display = 'block';
        pageInfo.textContent = `${currentPage + 1} / ${currentTemplate.files.length}`;
        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = currentPage === currentTemplate.files.length - 1;
    } else {
        nav.style.display = 'none';
    }
}

function prevPage() {
    if (currentPage > 0) {
        saveCurrentPagePositions();
        currentPage--;
        loadDocument();
    }
}

function nextPage() {
    if (currentPage < currentTemplate.files.length - 1) {
        saveCurrentPagePositions();
        currentPage++;
        loadDocument();
    }
}

function saveCurrentPagePositions() {
    const pageFields = currentTemplate.fields.filter(f => f.page === currentPage);

    pageFields.forEach(fieldData => {
        const fieldElement = document.getElementById(fieldData.id);
        if (fieldElement) {
            const computedStyle = window.getComputedStyle(fieldElement);
            fieldData.x = parseInt(computedStyle.left) || fieldData.x;
            fieldData.y = parseInt(computedStyle.top) || fieldData.y;
            fieldData.w = parseInt(computedStyle.width) || fieldData.w;
            fieldData.h = parseInt(computedStyle.height) || fieldData.h;
        }
    });
}

function enableEditingControls() {
    ['addFieldBtn', 'saveBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
    });
}

// Функция для обновления счетчика полей на основе существующих
function updateFieldCounter() {
    let maxCounter = 0;
    
    currentTemplate.fields.forEach(field => {
        // Извлекаем номер из ID поля (формат: field_page_counter)
        const match = field.id.match(/field_(\d+)_(\d+)/);
        if (match) {
            const counter = parseInt(match[2]);
            maxCounter = Math.max(maxCounter, counter);
        }
    });
    
    fieldCounter = maxCounter;
    console.log(`Установлен fieldCounter: ${fieldCounter} (найдено ${currentTemplate.fields.length} полей)`);
}

// Функция для генерации уникального ID поля
function generateUniqueFieldId(page) {
    let newId;
    let attempts = 0;
    
    do {
        fieldCounter++;
        newId = `field_${page}_${fieldCounter}`;
        attempts++;
        
        // Защита от бесконечного цикла
        if (attempts > 1000) {
            newId = `field_${page}_${Date.now()}`;
            break;
        }
    } while (currentTemplate.fields.some(f => f.id === newId));
    
    return newId;
}

function addField() {
    if (!currentTemplate.files || currentTemplate.files.length === 0) {
        showModal('Сначала загрузите документ');
        return;
    }

    // Генерируем уникальный ID
    const fieldId = generateUniqueFieldId(currentPage);

    const field = document.createElement('div');
    field.className = 'field';
    field.id = fieldId;
    field.style.left = '50px';
    field.style.top = '50px';
    field.style.width = '150px';
    field.style.height = '30px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Введите ответ...';
    input.style.pointerEvents = 'none'; // отключаем для редактора
    field.appendChild(input);

    field.addEventListener('click', (e) => {
        e.stopPropagation();
        selectField(field);
    });

    const page = document.getElementById(`page-${currentPage}`);
    if (page) {
        page.appendChild(field);
        makeFieldInteractive(field);
    }

    const fieldData = {
        id: fieldId,
        page: currentPage,
        x: 50,
        y: 50,
        w: 150,
        h: 30,
        variants: [],
        checkable: true
    };

    currentTemplate.fields.push(fieldData);
    updateFieldCount();
    selectField(field);
    
    console.log(`Добавлено поле: ${fieldId}`);
}

function makeFieldInteractive(field) {
    interact(field)
        .draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    const left = (parseInt(target.style.left) || 0) + event.dx;
                    const top = (parseInt(target.style.top) || 0) + event.dy;
                    target.style.left = left + 'px';
                    target.style.top = top + 'px';
                    updateFieldPosition(target.id, left, top);
                }
            }
        })
        .resizable({
            edges: { right: true, bottom: true },
            listeners: {
                move(event) {
                    const target = event.target;
                    const w = event.rect.width;
                    const h = event.rect.height;
                    const left = parseInt(target.style.left) + event.deltaRect.left;
                    const top = parseInt(target.style.top) + event.deltaRect.top;
                    target.style.width = w + 'px';
                    target.style.height = h + 'px';
                    target.style.left = left + 'px';
                    target.style.top = top + 'px';
                    updateFieldSize(target.id, w, h, left, top);
                }
            }
        });
}

function selectField(field) {
    // Убираем выделение со всех полей
    document.querySelectorAll('.field').forEach(f => f.classList.remove('selected'));
    
    selectedField = field;
    if (field) {
        field.classList.add('selected');
        showFieldProperties(field);
    }
}

function clearFieldSelection() {
    document.querySelectorAll('.field').forEach(f => f.classList.remove('selected'));
    const sidebar = document.getElementById('fieldProperties');
    if (sidebar) sidebar.innerHTML = '<p>Выберите поле для редактирования</p>';
    selectedField = null;
}

function showFieldProperties(field) {
    const sidebar = document.getElementById('fieldProperties');
    if (!sidebar) {
        console.error('Элемент #fieldProperties не найден в DOM');
        return;
    }

    sidebar.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Свойства поля';
    sidebar.appendChild(title);

    // Найдем данные поля в currentTemplate.fields
    const fieldData = currentTemplate.fields.find(f => f.id === field.id);
    
    const label = document.createElement('label');
    label.textContent = 'Правильные ответы (каждый с новой строки):';
    sidebar.appendChild(label);

    const variantsInput = document.createElement('textarea');
    variantsInput.style.width = '100%';
    variantsInput.style.height = '100px';
    variantsInput.style.marginBottom = '10px';
    variantsInput.style.padding = '5px';
    variantsInput.style.border = '1px solid #ddd';
    variantsInput.style.borderRadius = '3px';
    
    // Заполняем текущие варианты
    if (fieldData && fieldData.variants && fieldData.variants.length > 0) {
        variantsInput.value = fieldData.variants.join('\n');
    }
    
    variantsInput.placeholder = 'Введите варианты ответов (каждый с новой строки)';
    
    // Автосохранение при потере фокуса
    variantsInput.addEventListener('blur', function() {
        const newVariants = variantsInput.value
            .split('\n')
            .map(v => v.trim())
            .filter(v => v !== '');

        // Обновляем данные в currentTemplate.fields
        if (fieldData) {
            const oldVariants = fieldData.variants ? fieldData.variants.slice() : [];
            fieldData.variants = newVariants;
            
            // Показываем визуальную обратную связь только если данные изменились
            if (JSON.stringify(oldVariants) !== JSON.stringify(newVariants)) {
                // Временно меняем стиль для показа сохранения
                const originalBorder = variantsInput.style.border;
                variantsInput.style.border = '2px solid #27ae60';
                variantsInput.style.backgroundColor = '#d5f4e6';
                
                setTimeout(() => {
                    variantsInput.style.border = originalBorder;
                    variantsInput.style.backgroundColor = '';
                }, 800);
                
                console.log(`Автосохранение для поля ${field.id}: ${newVariants.length} вариантов`);
            }
        }
    });
    
    sidebar.appendChild(variantsInput);

    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Обновить данные';
    updateBtn.className = 'btn';
    updateBtn.style.width = '100%';
    updateBtn.style.marginBottom = '10px';
    
    updateBtn.onclick = () => {
        const newVariants = variantsInput.value
            .split('\n')
            .map(v => v.trim())
            .filter(v => v !== '');

        // Обновляем данные в currentTemplate.fields
        if (fieldData) {
            const oldVariants = fieldData.variants ? fieldData.variants.slice() : [];
            fieldData.variants = newVariants;
            
            // Показываем визуальную обратную связь
            const originalBackground = updateBtn.style.backgroundColor;
            updateBtn.style.backgroundColor = '#27ae60';
            updateBtn.textContent = 'Сохранено ✅';
            
            setTimeout(() => {
                updateBtn.style.backgroundColor = originalBackground;
                updateBtn.textContent = 'Обновить данные';
            }, 1500);
            
            console.log(`Ручное сохранение для поля ${field.id}: ${newVariants.length} вариантов`);
        }
    };
    sidebar.appendChild(updateBtn);

    // Кнопка удаления поля
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Удалить поле';
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.style.width = '100%';
    
    deleteBtn.onclick = () => {
        deleteField();
    };
    sidebar.appendChild(deleteBtn);

    // Информация о поле
    const info = document.createElement('div');
    info.style.marginTop = '15px';
    info.style.fontSize = '12px';
    info.style.color = '#666';
    info.innerHTML = `
        <strong>ID:</strong> ${field.id}<br>
        <strong>Страница:</strong> ${(fieldData ? fieldData.page + 1 : 'N/A')}<br>
        <strong>Позиция:</strong> x:${fieldData ? fieldData.x : 0}, y:${fieldData ? fieldData.y : 0}<br>
        <strong>Размер:</strong> ${fieldData ? fieldData.w : 0}×${fieldData ? fieldData.h : 0}
    `;
    sidebar.appendChild(info);
}

// ==================== CRUD для полей ====================

function deleteField() {
    if (!selectedField) return;
    if (confirm('Удалить выбранное поле?')) {
        const id = selectedField.id;
        selectedField.remove();
        currentTemplate.fields = currentTemplate.fields.filter(f => f.id !== id);
        clearFieldSelection();
        updateFieldCount();
    }
}

function updateFieldPosition(id, x, y) {
    const f = currentTemplate.fields.find(f => f.id === id);
    if (f) { f.x = x; f.y = y; }
}

function updateFieldSize(id, w, h, x, y) {
    const f = currentTemplate.fields.find(f => f.id === id);
    if (f) { f.w = w; f.h = h; f.x = x; f.y = y; }
}

function loadFieldsForCurrentPage() {
    document.querySelectorAll('.field').forEach(field => field.remove());
    const pageFields = currentTemplate.fields.filter(f => f.page === currentPage);

    pageFields.forEach(fd => {
        const field = document.createElement('div');
        field.className = 'field';
        field.id = fd.id;
        field.style.left = fd.x + 'px';
        field.style.top = fd.y + 'px';
        field.style.width = fd.w + 'px';
        field.style.height = fd.h + 'px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Введите ответ...';
        input.style.pointerEvents = 'none'; // отключаем для редактора
        field.appendChild(input);

        field.addEventListener('click', (e) => {
            e.stopPropagation();
            selectField(field);
        });

        const page = document.getElementById(`page-${currentPage}`);
        if (page) {
            page.appendChild(field);
            makeFieldInteractive(field);
        }
    });
}

function updateFieldCount() {
    const el = document.getElementById('fieldCount');
    if (el) el.textContent = currentTemplate.fields.length;
}

// ==================== Шаблоны ====================

async function saveTemplate() {
    const templateName = document.getElementById('templateName');
    if (!templateName || !templateName.value.trim()) {
        showModal('Введите название шаблона');
        return;
    }
    if (currentTemplate.fields.length === 0) {
        showModal('Добавьте хотя бы одно поле');
        return;
    }
    const noAnswers = currentTemplate.fields.filter(f => f.checkable && (!f.variants || f.variants.length === 0));
    if (noAnswers.length > 0) {
        showModal('У некоторых проверяемых полей нет правильных ответов');
        return;
    }

    saveCurrentPagePositions();

    currentTemplate.name = templateName.value.trim();
    const sheetUrl = document.getElementById('sheetUrl');
    currentTemplate.sheet_url = sheetUrl ? sheetUrl.value.trim() : '';
    const classesEl = document.getElementById('availableClasses');
    currentTemplate.classes = classesEl && classesEl.value.trim()
        ? classesEl.value.split(',').map(c => c.trim())
        : [];

    if (!currentTemplate.template_id) currentTemplate.template_id = `tpl_${Date.now()}`;

    try {
        const response = await fetch('/save_template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentTemplate)
        });
        const result = await response.json();
        if (result.success) {
            showModal('Шаблон сохранен успешно');
            loadTemplateList();
        } else {
            showModal('Ошибка сохранения: ' + result.error);
        }
    } catch (err) {
        showModal('Ошибка: ' + err.message);
    }
}

async function loadTemplateList() {
    try {
        const response = await fetch('/list_templates');
        const templates = await response.json();
        const select = document.getElementById('templateSelect');
        if (select) {
            select.innerHTML = '<option value="">Выберите шаблон...</option>';
            templates.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.name || t.id;
                select.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Ошибка списка шаблонов:', err);
    }
}

async function loadSelectedTemplate() {
    const select = document.getElementById('templateSelect');
    if (!select) return;
    const id = select.value;
    if (!id) {
        showModal('Выберите шаблон');
        return;
    }
    try {
        const response = await fetch(`/load_template/${id}`);
        const template = await response.json();
        if (response.ok) {
            currentTemplate = template;
            currentPage = 0;
            
            // Обновляем fieldCounter на основе существующих полей
            updateFieldCounter();
            
            ['templateName', 'sheetUrl', 'availableClasses'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'templateName') el.value = template.name || '';
                    if (id === 'sheetUrl') el.value = template.sheet_url || '';
                    if (id === 'availableClasses') el.value = (template.classes || []).join(', ');
                }
            });
            if (template.files && template.files.length > 0) {
                loadDocument();
                enableEditingControls();
            } else {
                showModal('В шаблоне нет файлов');
            }
            updateFieldCount();
            showModal('Шаблон загружен успешно');
        } else {
            showModal('Ошибка загрузки: ' + (template.error || 'Неизвестная'));
        }
    } catch (err) {
        showModal('Ошибка: ' + err.message);
    }
}