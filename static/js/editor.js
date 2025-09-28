// Глобальные переменные
let currentTemplate = {
    template_id: '',
    name: '',
    files: [],
    width: 0,
    height: 0,
    fields: [],
    sheet_url: '',
    classes: [],
    images_data: [] // Добавим для явности, хотя в загружаемом шаблоне они будут
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

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.field') && !event.target.closest('#fieldProperties')) {
            clearFieldSelection();
        }
    });

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.addEventListener('click', prevPage);
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.addEventListener('click', nextPage);
    const addFieldBtn = document.getElementById('addFieldBtn');
    if (addFieldBtn) addFieldBtn.addEventListener('click', addField);
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveTemplate);
    const loadTemplateBtn = document.getElementById('loadTemplateBtn');
    if (loadTemplateBtn) loadTemplateBtn.addEventListener('click', loadSelectedTemplate);
}


/**
 * Отрисовывает поля для текущей страницы, преобразуя PDF-координаты в экранные.
 * Вызывается после загрузки изображения страницы.
 */
function drawFieldsForEditor(pageIndex) {
    const pageContainer = document.getElementById(`page-${pageIndex}`);
    if (!pageContainer) return;

    // Удаляем все существующие поля, чтобы избежать дублирования
    pageContainer.querySelectorAll('.field').forEach(el => el.remove());

    const img = pageContainer.querySelector('img');
    if (!img) return;

    const pageData = currentTemplate.images_data?.[pageIndex];
    // Используем page_width/page_height из images_data (PDF points)
    const pdfW = pageData?.page_width || img.naturalWidth;
    const pdfH = pageData?.page_height || img.naturalHeight;

    // Вычисляем коэффициент масштабирования: пиксели экрана / PDF points
    const scaleX = img.clientWidth / pdfW;
    const scaleY = img.clientHeight / pdfH;

    currentTemplate.fields
        .filter(f => f.page === pageIndex)
        .forEach(f => {
            // f.x, f.y, f.w, f.h - это "чистые" PDF points

            // 1. Инвертируем Y: из PDF-координат (Y_bottom) в веб-координаты (Y_top)
            // (WEB_Y_points = PDF_HEIGHT - PDF_Y - FIELD_HEIGHT)
            const webPointsY = pdfH - f.y - f.h;

            // 2. Преобразуем PDF points в экранные пиксели
            const screenX = f.x * scaleX;
            const screenY = webPointsY * scaleY;
            const screenW = f.w * scaleX;
            const screenH = f.h * scaleY;

            // Создаем и размещаем элемент
            const field = createFieldElement(f.id, 'text'); // Предполагаем 'text' или передавайте f.type
            field.style.left = screenX + 'px';
            field.style.top = screenY + 'px';
            field.style.width = screenW + 'px';
            field.style.height = screenH + 'px';

            pageContainer.appendChild(field);
            makeFieldInteractive(field); // Делаем поле интерактивным
        });
}


function setupModal() {
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = event => { if (event.target === modal) modal.style.display = 'none'; };
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

// ==================== Работа с документом ====================

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();

        if (result.success) {
            
            if (!result.files || result.files.length === 0) {
                 showModal('Ошибка: Файл загружен, но страницы документа не были сгенерированы. Проверьте, что файл не поврежден или не защищен паролем.');
                 return;
            }
            
            const firstFile = result.files[0];
            
            // --- ИСПРАВЛЕНИЕ ЛОГИКИ ОПРЕДЕЛЕНИЯ ИМЕН ФАЙЛОВ ---
            let fileNames;
            if (typeof firstFile === 'string') {
                // Если элемент - это строка (прямое имя файла)
                fileNames = result.files;
            } else if (firstFile.filename) {
                // Если элемент - это объект (ожидаемый формат)
                fileNames = result.files.map(d => d.filename);
            } else {
                showModal('Ошибка: Неизвестный формат данных о файлах от сервера.');
                return;
            }
            // ----------------------------------------------------
            
            currentTemplate = {
                template_id: '',
                name: '',
                files: fileNames, // Используем очищенный массив имен файлов
                
                // Используем данные первого файла, предполагая, что это объект
                width: firstFile.width || 0, 
                height: firstFile.height || 0, 
                
                fields: [],
                sheet_url: '',
                classes: [],
                images_data: result.files
            };
            
            currentPage = 0;
            fieldCounter = 0;
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
    if (currentPage >= currentTemplate.files.length) currentPage = 0;

    const pageDiv = document.createElement('div');
    pageDiv.className = 'document-page';
    pageDiv.id = `page-${currentPage}`;
    pageDiv.style.position = 'relative';

    const img = document.createElement('img');
    img.src = `/uploads/${currentTemplate.files[currentPage]}`;
    
    // !!! ГЛАВНОЕ ИСПРАВЛЕНИЕ: Отрисовка полей после загрузки изображения !!!
    img.onload = function () {
        // Обновляем текущие размеры в глобальных переменных (используются при создании поля)
        currentTemplate.width = this.naturalWidth;
        currentTemplate.height = this.naturalHeight;
        
        // Пересчитываем и отрисовываем поля из PDF-координат в пиксели
        drawFieldsForEditor(currentPage);
    };
    img.onerror = () => pageDiv.innerHTML = '<div class="placeholder">Ошибка загрузки изображения</div>';

    pageDiv.appendChild(img);
    viewer.appendChild(pageDiv);
    updatePageNavigation();
    
    // Снимаем выделение, чтобы обновились свойства полей
    clearFieldSelection();
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
    } else nav.style.display = 'none';
}

function prevPage() {
    if (currentPage > 0) {
        saveCurrentPagePositions();
        currentPage--;
        loadDocument(); // loadDocument теперь отвечает за отрисовку новой страницы
    }
}

function nextPage() {
    if (currentPage < currentTemplate.files.length - 1) {
        saveCurrentPagePositions();
        currentPage++;
        loadDocument(); // loadDocument теперь отвечает за отрисовку новой страницы
    }
}


function saveCurrentPagePositions() {
    const pageFields = currentTemplate.fields.filter(f => f.page === currentPage);
    const img = document.querySelector(`#page-${currentPage} img`);
    if (!img) return;

    // Получаем данные о странице для вычисления PDF-координат
    const pageData = currentTemplate.images_data?.[currentPage];
    const pdfW = pageData?.page_width || currentTemplate.width;
    const pdfH = pageData?.page_height || currentTemplate.height;
    const zoom = pageData?.zoom || 1;

    // Вычисляем масштаб преобразования экранных пикселей в PDF points
    const scaleFactorX = (pdfW) / img.clientWidth;
    const scaleFactorY = (pdfH) / img.clientHeight;

    pageFields.forEach(fieldData => {
        const fieldElement = document.getElementById(fieldData.id);
        if (fieldElement) {
            const computedStyle = window.getComputedStyle(fieldElement);
            const screenX = parseFloat(computedStyle.left) || 0;
            const screenY = parseFloat(computedStyle.top) || 0;
            const screenW = parseFloat(computedStyle.width) || 0;
            const screenH = parseFloat(computedStyle.height) || 0;

            // Преобразуем экранные пиксели в "чистые" PDF points
            const pdfPointsX = screenX * scaleFactorX;
            const pdfPointsY = screenY * scaleFactorY;
            const pdfPointsW = screenW * scaleFactorX;
            const pdfPointsH = screenH * scaleFactorY;
            
            // Инвертируем Y: из веб-координат (Y_top) в PDF-координаты (Y_bottom)
            // (PDF_Y = PDF_HEIGHT - WEB_Y - FIELD_HEIGHT)
            fieldData.x = pdfPointsX;
            fieldData.w = pdfPointsW;
            fieldData.h = pdfPointsH;
            // PDF-координата Y поля - это Y его нижней границы
            fieldData.y = pdfH - pdfPointsY - pdfPointsH; 
        }
    });
}

function enableEditingControls() {
    ['addFieldBtn', 'saveBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
    });
}

// ==================== Управление полями ====================

function updateFieldCounter() {
    let maxCounter = 0;
    currentTemplate.fields.forEach(field => {
        const match = field.id.match(/field_(\d+)_(\d+)/);
        if (match) maxCounter = Math.max(maxCounter, parseInt(match[2]));
    });
    fieldCounter = maxCounter;
}

function generateUniqueFieldId(page) {
    let newId;
    let attempts = 0;
    do {
        fieldCounter++;
        newId = `field_${page}_${fieldCounter}`;
        attempts++;
        if (attempts > 1000) { newId = `field_${page}_${Date.now()}`; break; }
    } while (currentTemplate.fields.some(f => f.id === newId));
    return newId;
}

function createFieldElement(id, type = 'text') {
     const fieldContainer = document.createElement('div');
     fieldContainer.className = 'field editor-field';
     fieldContainer.id = id;
     fieldContainer.style.border = '1px dashed #999';
     fieldContainer.style.position = 'absolute';
     fieldContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.7)'; // Сделаем полупрозрачным

     const input = document.createElement('input');
     input.type = type;
     input.placeholder = 'Введите ответ...';
     input.style.width = '100%';
     input.style.height = '100%';
     input.style.border = 'none';
     input.style.outline = 'none';
     input.style.padding = '2px';
     input.style.boxSizing = 'border-box';
     input.style.pointerEvents = 'none'; // Чтобы можно было кликнуть на div для interact.js
     fieldContainer.appendChild(input);

     fieldContainer.addEventListener('click', e => { e.stopPropagation(); selectField(fieldContainer); });
     return fieldContainer;
}

function addField() {
    if (!currentTemplate.files || currentTemplate.files.length === 0) {
        showModal('Сначала загрузите документ');
        return;
    }
    
    // Обязательно сохраняем текущие позиции перед добавлением нового
    saveCurrentPagePositions();

    const fieldId = generateUniqueFieldId(currentPage);
    
    // Используем центральную позицию для нового поля, переведенную в PDF-координаты.
    // Для простоты, пока просто используем фиксированные пиксели, но лучше бы пересчитывать
    const initialScreenX = 50;
    const initialScreenY = 50;
    const initialScreenW = 150;
    const initialScreenH = 30;
    
    // Временно создаем элемент, чтобы получить его и установить стили
    const fieldContainer = createFieldElement(fieldId, 'text');
    fieldContainer.style.left = initialScreenX + 'px';
    fieldContainer.style.top = initialScreenY + 'px';
    fieldContainer.style.width = initialScreenW + 'px';
    fieldContainer.style.height = initialScreenH + 'px';

    const page = document.getElementById(`page-${currentPage}`);
    if (page) { page.appendChild(fieldContainer); makeFieldInteractive(fieldContainer); }

    // Добавляем поле в данные. Его PDF-координаты будут корректно сохранены
    // при следующем вызове saveCurrentPagePositions.
    currentTemplate.fields.push({ 
        id: fieldId, 
        page: currentPage, 
        x: 0, y: 0, w: 0, h: 0, // Временно 0, будет обновлено в saveCurrentPagePositions
        variants: [], 
        checkable: true 
    });
    
    // Сразу сохраняем, чтобы получить правильные PDF-координаты
    saveCurrentPagePositions(); 
    
    updateFieldCount();
    selectField(fieldContainer);
}

// Обновленная интерактивность
function makeFieldInteractive(field) {
    interact(field)
        .draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    const left = (parseFloat(target.style.left) || 0) + event.dx;
                    const top = (parseFloat(target.style.top) || 0) + event.dy;
                    target.style.left = left + 'px';
                    target.style.top = top + 'px';
                    // Не обновляем PDF-координаты напрямую, а ждем saveCurrentPagePositions
                    // updateFieldPosition(target.id, left, top); 
                    
                    // Обновляем sidebar, чтобы видеть изменения
                    if (selectedField?.id === target.id) showFieldProperties(target); 
                }
            },
            onend: () => saveCurrentPagePositions() // Сохраняем после перетаскивания
        })
        .resizable({
            edges: { right: true, bottom: true },
            listeners: {
                move(event) {
                    const target = event.target;
                    const w = event.rect.width;
                    const h = event.rect.height;
                    const left = (parseFloat(target.style.left) || 0) + event.deltaRect.left;
                    const top = (parseFloat(target.style.top) || 0) + event.deltaRect.top;
                    
                    target.style.width = w + 'px';
                    target.style.height = h + 'px';
                    target.style.left = left + 'px';
                    target.style.top = top + 'px';
                    
                    // Обновляем sidebar, чтобы видеть изменения
                    if (selectedField?.id === target.id) showFieldProperties(target); 
                }
            },
            onend: () => saveCurrentPagePositions() // Сохраняем после изменения размера
        });
}

function selectField(field) {
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
    if (!sidebar) return;
    const fieldData = currentTemplate.fields.find(f => f.id === field.id);
    if (!fieldData) return;
    
    // Для отображения в сайдбаре используем сохраненные PDF-координаты
    const x = fieldData.x ? fieldData.x.toFixed(2) : 'N/A';
    const y = fieldData.y ? fieldData.y.toFixed(2) : 'N/A';
    const w = fieldData.w ? fieldData.w.toFixed(2) : 'N/A';
    const h = fieldData.h ? fieldData.h.toFixed(2) : 'N/A';

    sidebar.innerHTML = `
        <h3>Свойства поля</h3>
        <label>Правильные ответы (каждый с новой строки):</label>
        <textarea id="fieldVariants" style="width:100%; height:100px; margin-bottom:10px; padding:5px; border:1px solid #ddd; border-radius:3px;">
${fieldData.variants.join('\n')}
        </textarea>
        <button id="updateFieldBtn" class="btn" style="width:100%; margin-bottom:10px;">Обновить данные</button>
        <button id="deleteFieldBtn" class="btn btn-danger" style="width:100%;">Удалить поле</button>
        <div style="margin-top:15px; font-size:12px; color:#666;">
            <strong>ID:</strong> ${fieldData.id}<br>
            <strong>Страница:</strong> ${fieldData.page + 1}<br>
            <strong>Позиция (PDF points):</strong> x:${x}, y:${y}<br>
            <strong>Размер (PDF points):</strong> ${w}×${h}
        </div>
    `;

    document.getElementById('fieldVariants').addEventListener('blur', () => {
        fieldData.variants = document.getElementById('fieldVariants').value
            .split('\n').map(v => v.trim()).filter(v => v);
    });
    document.getElementById('updateFieldBtn').onclick = () => {
        fieldData.variants = document.getElementById('fieldVariants').value
            .split('\n').map(v => v.trim()).filter(v => v);
    };
    document.getElementById('deleteFieldBtn').onclick = () => deleteField();
}

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

// Функции updateFieldPosition/Size удалены, т.к. теперь все сохраняется через saveCurrentPagePositions
// Это упрощает логику и гарантирует, что координаты всегда сохраняются в PDF points.


function updateFieldCount() {
    const el = document.getElementById('fieldCount');
    if (el) el.textContent = currentTemplate.fields.length;
}

// ==================== Шаблоны ====================

async function saveTemplate() {
    const templateName = document.getElementById('templateName');
    if (!templateName || !templateName.value.trim()) { showModal('Введите название шаблона'); return; }
    if (currentTemplate.fields.length === 0) { showModal('Добавьте хотя бы одно поле'); return; }

    const noAnswers = currentTemplate.fields.filter(f => f.checkable && (!f.variants || f.variants.length === 0));
    if (noAnswers.length > 0) { showModal('У некоторых проверяемых полей нет правильных ответов'); return; }

    // Сохраняем позиции перед отправкой
    saveCurrentPagePositions();

    currentTemplate.name = templateName.value.trim();
    currentTemplate.sheet_url = (document.getElementById('sheetUrl')?.value || '').trim();
    currentTemplate.classes = document.getElementById('availableClasses')?.value
        .split(',').map(c => c.trim()) || [];

    if (!currentTemplate.template_id) currentTemplate.template_id = `tpl_${Date.now()}`;

    try {
        const response = await fetch('/save_template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentTemplate)
        });
        const result = await response.json();
        if (result.success) showModal('Шаблон сохранен успешно');
        else showModal('Ошибка сохранения: ' + result.error);
        loadTemplateList();
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
    if (!select || !select.value) { showModal('Выберите шаблон'); return; }
    try {
        const response = await fetch(`/load_template/${select.value}`);
        const template = await response.json();
        if (response.ok) {
            currentTemplate = template;
            currentPage = 0;
            updateFieldCounter();
            
            // Обновляем поля ввода
            ['templateName', 'sheetUrl', 'availableClasses'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'templateName') el.value = template.name || '';
                    if (id === 'sheetUrl') el.value = template.sheet_url || '';
                    if (id === 'availableClasses') el.value = (template.classes || []).join(', ');
                }
            });
            
            // Загружаем документ, который после загрузки изображения сам отрисует поля
            if (template.files?.length > 0) { 
                loadDocument(); 
                enableEditingControls(); 
            }
            else showModal('В шаблоне нет файлов');
            updateFieldCount();
        } else showModal('Ошибка загрузки: ' + (template.error || 'Неизвестная'));
    } catch (err) {
        showModal('Ошибка: ' + err.message);
    }
}