// static/js/student.js

let template = null;
const docArea = document.getElementById('doc_area');

async function loadTemplate(){
  const r = await fetch(`/api/template/${templateId}`);
  if (r.status !== 200) {
    docArea.innerText = "Шаблон не найден";
    return;
  }
  template = await r.json();
  // show image
  const img = document.createElement('img');
  img.src = '/uploads/' + template.file;
  img.style.maxWidth = '600px';
  img.id = 'student_img';
  docArea.appendChild(img);

  img.onload = () => {
    // place inputs
    const scale = img.clientWidth / template.width;
    template.fields.forEach((f, idx) => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.style.position = 'absolute';
      inp.style.left = (f.x * scale) + 'px';
      inp.style.top = (f.y * scale) + 'px';
      inp.style.width = Math.max(80, f.w * scale) + 'px';
      inp.dataset.idx = idx;
      docArea.appendChild(inp);
    });
  };
}

document.getElementById('submit_btn').addEventListener('click', async ()=>{
  const first = document.getElementById('first').value;
  const last = document.getElementById('last').value;
  const klass = document.getElementById('class').value;
  const inputs = [...document.querySelectorAll('#doc_area input')];
  const answers = inputs.map(i=>i.value);

  const payload = {first_name: first, last_name: last, class: klass, answers: answers};
  const r = await fetch(`/api/submit/${templateId}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  document.getElementById('res').innerText = JSON.stringify(j, null, 2);
});

loadTemplate();
