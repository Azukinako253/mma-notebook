function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function triggerUpload(id) {
  document.getElementById(id).click();
}

// ---------- 画像アップロード（サーバへ保存） ----------

function renderImageThumb(grid, image) {
  const thumb = document.createElement('div');
  thumb.className = 'img-thumb';
  thumb.dataset.imageId = image.id;
  thumb.innerHTML = `
    <img src="/api/images/file/${image.id}" alt="${image.caption ?? ''}">
    <button class="img-remove" title="削除">✕</button>
    <div class="img-caption">${image.caption ?? ''}</div>
  `;
  thumb.querySelector('.img-remove').addEventListener('click', () => deleteImage(image.id, thumb));
  grid.appendChild(thumb);
}

async function deleteImage(id, thumbEl) {
  try {
    const res = await fetch(`/api/images/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error('削除に失敗しました');
    thumbEl.remove();
  } catch (err) {
    console.error(err);
    alert('画像の削除に失敗しました');
  }
}

async function loadImages(section, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  try {
    const res = await fetch(`/api/images/${section}`);
    if (!res.ok) throw new Error('画像の読み込みに失敗しました');
    const images = await res.json();
    grid.innerHTML = '';
    images.forEach(image => renderImageThumb(grid, image));
  } catch (err) {
    console.error(err);
  }
}

async function handleImages(event, gridId) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const section = gridId.replace(/-imgs$/, '');
  const grid = document.getElementById(gridId);
  const formData = new FormData();
  Array.from(files).forEach(file => formData.append('images', file));

  try {
    const res = await fetch(`/api/images/${section}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '画像のアップロードに失敗しました');
    }
    const images = await res.json();
    images.forEach(image => renderImageThumb(grid, image));
  } catch (err) {
    console.error(err);
    alert(err.message || '画像のアップロードに失敗しました');
  } finally {
    event.target.value = '';
  }
}

// ---------- フリーノート（サーバへ保存） ----------

const noteSaveTimers = {};

async function saveNote(key, content) {
  try {
    await fetch(`/api/notes/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error(err);
  }
}

function scheduleSaveNote(key, content) {
  clearTimeout(noteSaveTimers[key]);
  noteSaveTimers[key] = setTimeout(() => saveNote(key, content), 800);
}

async function loadNotes() {
  try {
    const res = await fetch('/api/notes');
    if (!res.ok) throw new Error('メモの読み込みに失敗しました');
    const notes = await res.json();
    document.querySelectorAll('.editable-note[data-note-key]').forEach(el => {
      const key = el.dataset.noteKey;
      el.textContent = notes[key] ?? '';
    });
  } catch (err) {
    console.error(err);
  }
}

function initNotes() {
  document.querySelectorAll('.editable-note[data-note-key]').forEach(el => {
    const key = el.dataset.noteKey;
    el.addEventListener('input', () => scheduleSaveNote(key, el.textContent));
    el.addEventListener('blur', () => {
      clearTimeout(noteSaveTimers[key]);
      saveNote(key, el.textContent);
    });
  });
}

// ---------- 初期化 ----------

document.addEventListener('DOMContentLoaded', () => {
  initNotes();
  loadNotes();
  loadImages('strike', 'strike-imgs');
  loadImages('grapple', 'grapple-imgs');
  loadImages('ground', 'ground-imgs');
});
