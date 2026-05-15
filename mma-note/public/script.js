function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function triggerUpload(id) {
  document.getElementById(id).click();
}

function handleImages(event, gridId) {
  const files = event.target.files;
  const grid = document.getElementById(gridId);
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const thumb = document.createElement('div');
      thumb.className = 'img-thumb';
      thumb.innerHTML = `
        <img src="${e.target.result}" alt="${file.name}">
        <button class="img-remove" onclick="this.closest('.img-thumb').remove()" title="削除">✕</button>
        <div class="img-caption">${file.name.replace(/\.[^.]+$/, '')}</div>
      `;
      grid.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}
