// static/js/editor.js

let uploadedPages = [];
let currentPage = 0;

let template = {
  template_id: "",
  file: [],
  width: 0,
  height: 0,
  fields: []
};

const fileInput = document.getElementById('file_input');
const uploadBtn = document.getElementById('upload_btn');
const canvasContainer = document.getElementById('canvas_container');
const addFieldBtn = document.getElementById('add_field');
const saveBtn = document.getElementById('save_template');
const templateIdInput = document.getElementById('template_id');
const loadBtn = document.getElementById('load_template');
const prevBtn = document.getElementById('prev_page');
const nextBtn = document.getElementById('next_page');
const pageInfo = document.getElementById('page_info');

uploadBtn.addEventListener('click', async () => {
  if (!fileInput.files.length) return alert("Выберите файл");
  const f = fileInput.files[0];
  const form = new FormData();
  form.append('file', f);
  const resp = await fetch('/api/upload_file', {method:'POST', body: form});
  const j = await resp.json();
  if (j.ok) {
    uploadedPages = j.pages;
    template.file = uploadedPages;
    currentPage = 0;
    loadPreview();
    updatePageInfo();
  } else {
    alert("Ошибка: " + j.error);
  }
});

async function loadPreview() {
  canvasContainer.innerHTML = '';

  const img = document.createElement('img');
  img.src = '/uploads/' + uploadedPages[currentPage];
  img.style.maxWidth = '100%';
  img.id = 'preview_img';
  img.style.display = 'block';
  canvasContainer.appendChild(img);

  img.onload = () => {
    template.width = img.naturalWidth;
    template.height = img.naturalHeight;
    renderFieldsForPage(currentPage);
  };
}

function renderFieldsForPage(page) {
  // Удаляем все старые поля
  document.querySelectorAll('.field-box').forEach(el => el.remove());

  // Восстанавливаем поля для текущей страницы
  template.fields.filter(f => f.page === page).forEach(f => {
    const box = document.createElement('div');
    box.className = 'draggable resizable field-box';
    box.style.width = f.w + 'px';
    box.style.height = f.h + 'px';
    box.dataset.fieldId = f.id;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ответ...';
    input.style.width = '100%';
    input.style.height = '100%';
    box.appendChild(input);

    box.ondblclick = () => {
      const variants = prompt("Введите допустимые варианты ответа (через запятую):", f.variants.join(', '));
      if (variants !== null) {
        const idx = template.fields.findIndex(ff => ff.id === f.id);
        template.fields[idx].variants = variants.split(',').map(s => s.trim()).filter(Boolean);
      }
    };

    canvasContainer.appendChild(box);

    box.style.transform = `translate(${f.x}px, ${f.y}px)`;
    box.setAttribute('data-x', f.x);
    box.setAttribute('data-y', f.y);

    enableInteract(box);
  });
}

addFieldBtn.addEventListener('click', () => {
  const id = 'field_' + (template.fields.length + 1);
  const box = document.createElement('div');
  box.className = 'draggable resizable field-box';
  box.style.left = '20px';
  box.style.top = '20px';
  box.style.width = '150px';
  box.style.height = '30px';
  box.dataset.fieldId = id;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ответ...';
  input.style.width = '100%';
  input.style.height = '100%';
  box.appendChild(input);

  box.ondblclick = () => {
    const variants = prompt("Введите допустимые варианты ответа (через запятую):", "");
    if (variants !== null) {
      const idx = template.fields.findIndex(f => f.id === id);
      template.fields[idx].variants = variants.split(',').map(s => s.trim()).filter(Boolean);
    }
  };

  canvasContainer.appendChild(box);

  const fieldObj = { id: id, page: currentPage, x: 20, y: 20, w: 150, h: 30, variants: [] };
  template.fields.push(fieldObj);

  enableInteract(box);
});

function enableInteract(el) {
  interact(el)
    .draggable({
      listeners: {
        move (event) {
          const target = event.target;
          const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
          const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute('data-x', x);
          target.setAttribute('data-y', y);
        }
      }
    })
    .resizable({
      edges: { left: true, right: true, bottom: true, top: true }
    })
    .on('resizemove', event => {
      const target = event.target;
      let x = (parseFloat(target.getAttribute('data-x')) || 0);
      let y = (parseFloat(target.getAttribute('data-y')) || 0);

      target.style.width  = event.rect.width + 'px';
      target.style.height = event.rect.height + 'px';

      x += event.deltaRect.left;
      y += event.deltaRect.top;

      target.style.transform = `translate(${x}px, ${y}px)`;
      target.setAttribute('data-x', x);
      target.setAttribute('data-y', y);
    });
}

saveBtn.addEventListener('click', async () => {
  template.template_id = templateIdInput.value || ('tpl_' + Date.now());

  // Обновляем позиции/размеры для всех полей
  const boxes = document.querySelectorAll('.field-box');
  boxes.forEach(b => {
    const id = b.dataset.fieldId;
    const idx = template.fields.findIndex(f => f.id === id);

    const x = parseFloat(b.getAttribute('data-x')) || 0;
    const y = parseFloat(b.getAttribute('data-y')) || 0;
    const w = parseFloat(b.style.width);
    const h = parseFloat(b.style.height);

    template.fields[idx].x = x;
    template.fields[idx].y = y;
    template.fields[idx].w = w;
    template.fields[idx].h = h;
  });

  const resp = await fetch('/api/save_template', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(template)
  });
  const j = await resp.json();
  if (j.ok) {
    alert('Шаблон сохранён: ' + template.template_id);
  } else {
    alert('Ошибка: ' + j.error);
  }
});

// Загрузка сохранённого шаблона
loadBtn.addEventListener('click', async () => {
  const tplId = templateIdInput.value.trim();
  if (!tplId) return alert("Введите Template ID");

  const resp = await fetch('/api/load_template/' + tplId);
  const j = await resp.json();
  if (!j.ok) return alert("Ошибка: " + j.error);

  template = j.template;
  uploadedPages = template.file;
  currentPage = 0;
  loadPreview();
  updatePageInfo();

  alert("Шаблон загружен: " + tplId);
});

// Навигация по страницам
function updatePageInfo() {
  pageInfo.innerText = `Страница ${currentPage+1} из ${uploadedPages.length}`;
}

prevBtn.addEventListener('click', () => {
  if (currentPage > 0) {
    currentPage--;
    loadPreview();
    updatePageInfo();
  }
});
nextBtn.addEventListener('click', () => {
  if (currentPage < uploadedPages.length - 1) {
    currentPage++;
    loadPreview();
    updatePageInfo();
  }
});
