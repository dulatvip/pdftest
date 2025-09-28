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

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.field') && !event.target.closest('#fieldProperties')) {
            clearFieldSelection();
        }
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
    img.onload = function () {
        currentTemplate.width = this.naturalWidth;
        currentTemplate.height = this.naturalHeight;
        loadFieldsForCurrentPage();
    };
    img.onerror = () => pageDiv.innerHTML = '<div class="placeholder">Ошибка загрузки изображения</div>';

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
    } else nav.style.display = 'none';
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
    const img = document.querySelector(`#page-${currentPage} img`);
    if (!img) return;

    // Получаем данные о странице для вычисления PDF-координат
    const pageData = currentTemplate.images_data?.[currentPage];
    const pdfW = pageData?.page_width || currentTemplate.width;
    const pdfH = pageData?.page_height || currentTemplate.height;
    const zoom = pageData?.zoom || 1;

    // Вычисляем масштаб преобразования экранных пикселей в PDF points
    const scaleFactorX = (pdfW * zoom) / img.clientWidth;
    const scaleFactorY = (pdfH * zoom) / img.clientHeight;

    pageFields.forEach(fieldData => {
        const fieldElement = document.getElementById(fieldData.id);
        if (fieldElement) {
            const computedStyle = window.getComputedStyle(fieldElement);
            const screenX = parseFloat(computedStyle.left) || 0;
            const screenY = parseFloat(computedStyle.top) || 0;
            const screenW = parseFloat(computedStyle.width) || 0;
            const screenH = parseFloat(computedStyle.height) || 0;

            // 1. Преобразуем экранные пиксели в PDF-пиксели (с учетом зума)
            const pdfZoomedX = screenX * scaleFactorX;
            const pdfZoomedY = screenY * scaleFactorY;
            const pdfZoomedW = screenW * scaleFactorX;
            const pdfZoomedH = screenH * scaleFactorY;
            
            // 2. Делим на zoom, чтобы получить "чистые" PDF points
            const pdfPointsX = pdfZoomedX / zoom;
            const pdfPointsY = pdfZoomedY / zoom;
            const pdfPointsW = pdfZoomedW / zoom;
            const pdfPointsH = pdfZoomedH / zoom;
            
            // 3. Инвертируем Y: из веб-координат (Y_top) в PDF-координаты (Y_bottom)
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

function addField() {
    if (!currentTemplate.files || currentTemplate.files.length === 0) {
        showModal('Сначала загрузите документ');
        return;
    }
    const fieldId = generateUniqueFieldId(currentPage);
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'field editor-field';
    fieldContainer.id = fieldId;
    fieldContainer.style.left = '50px';
    fieldContainer.style.top = '50px';
    fieldContainer.style.width = '150px';
    fieldContainer.style.height = '30px';
    fieldContainer.style.border = '1px dashed #999';
    fieldContainer.style.position = 'absolute';
    fieldContainer.style.backgroundColor = '#fff';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Введите ответ...';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.padding = '2px';
    input.style.boxSizing = 'border-box';
    fieldContainer.appendChild(input);

    fieldContainer.addEventListener('click', e => { e.stopPropagation(); selectField(fieldContainer); });

    const page = document.getElementById(`page-${currentPage}`);
    if (page) { page.appendChild(fieldContainer); makeFieldInteractive(fieldContainer); }

    currentTemplate.fields.push({ id: fieldId, page: currentPage, x: 50, y: 50, w: 150, h: 30, variants: [], checkable: true });
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
                    const left = (parseFloat(target.style.left) || 0) + event.deltaRect.left;
                    const top = (parseFloat(target.style.top) || 0) + event.deltaRect.top;
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
            <strong>Позиция:</strong> x:${fieldData.x}, y:${fieldData.y}<br>
            <strong>Размер:</strong> ${fieldData.w}×${fieldData.h}
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
        field.style.position = 'absolute';
        field.style.border = '1px dashed #999';
        field.style.backgroundColor = '#fff';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Введите ответ...';
        input.style.width = '100%';
        input.style.height = '100%';
        input.style.border = 'none';
        input.style.outline = 'none';
        input.style.pointerEvents = 'none';
        field.appendChild(input);

        field.addEventListener('click', e => { e.stopPropagation(); selectField(field); });

        const page = document.getElementById(`page-${currentPage}`);
        if (page) { page.appendChild(field); makeFieldInteractive(field); }
    });
}

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
            ['templateName', 'sheetUrl', 'availableClasses'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'templateName') el.value = template.name || '';
                    if (id === 'sheetUrl') el.value = template.sheet_url || '';
                    if (id === 'availableClasses') el.value = (template.classes || []).join(', ');
                }
            });
            if (template.files?.length > 0) { loadDocument(); enableEditingControls(); }
            else showModal('В шаблоне нет файлов');
            updateFieldCount();
        } else showModal('Ошибка загрузки: ' + (template.error || 'Неизвестная'));
    } catch (err) {
        showModal('Ошибка: ' + err.message);
    }
}
