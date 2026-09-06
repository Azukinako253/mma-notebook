// ==================== 共通ユーティリティ ====================

const TABS = ["strike", "grapple", "ground"];
const TYPE_LABELS = { cards: "カード", combos: "コンビネーション", warnings: "警告", techniques: "技一覧テーブル" };

// 状態はサーバーからの取得結果をタブごとに保持しておく（編集モーダルで既存データを引くため）
const state = { blocks: { strike: [], grapple: [], ground: [] } };

// innerHTMLに差し込む前にユーザー入力をエスケープする（HTMLとして解釈されるのを防ぐ）
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function colorSelect(id, selected) {
  const options = [
    ["", "なし"],
    ["red", "レッド"],
    ["yellow", "イエロー"],
    ["blue", "ブルー"],
  ];
  return `<select id="${id}">${options
    .map(([value, label]) => `<option value="${value}" ${value === (selected || "") ? "selected" : ""}>${label}</option>`)
    .join("")}</select>`;
}

// サーバーAPIを叩く共通ヘルパー。エラー時はアラートを出して例外を投げる
async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "エラーが発生しました" }));
    alert(err.error || "エラーが発生しました");
    throw new Error(err.error || "request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

function findBlock(tab, blockId) {
  return state.blocks[tab]?.find((b) => String(b.id) === String(blockId));
}
function findItem(block, itemId) {
  return block?.items.find((i) => String(i.id) === String(itemId));
}

// ==================== タブ切り替え ====================

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"].tab-btn`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
}

// ==================== フリーノート ====================

async function loadNotes() {
  const notes = await api("/api/notes");
  document.querySelectorAll(".editable-note[data-note-key]").forEach((el) => {
    el.textContent = notes[el.dataset.noteKey] ?? "";
  });
}

const noteSaveTimers = {};
function setupNoteAutosave() {
  document.querySelectorAll(".editable-note[data-note-key]").forEach((el) => {
    el.addEventListener("input", () => {
      const key = el.dataset.noteKey;
      clearTimeout(noteSaveTimers[key]);
      // 打つたびに毎回保存しにいくと重いので、入力が0.8秒止まったら保存する（デバウンス）
      noteSaveTimers[key] = setTimeout(() => {
        api(`/api/notes/${key}`, "POST", { content: el.innerText });
      }, 800);
    });
  });
}

// ==================== 画像アップロード ====================

function triggerUpload(id) {
  document.getElementById(id).click();
}

function renderImages(section, images) {
  const grid = document.getElementById(`${section}-imgs`);
  grid.innerHTML = images
    .map(
      (img) => `
    <div class="img-thumb">
      <img src="/api/images/file/${img.id}" alt="${esc(img.filename)}">
      <button class="img-remove" data-action="delete-image" data-image-id="${img.id}" data-section="${section}" title="削除">✕</button>
      <div class="img-caption">${esc(img.caption)}</div>
    </div>
  `
    )
    .join("");
}

async function loadImages(section) {
  const images = await api(`/api/images/${section}`);
  renderImages(section, images);
}

async function handleImages(event, section) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("images", file));

  const res = await fetch(`/api/images/${section}`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "アップロードに失敗しました" }));
    alert(err.error || "アップロードに失敗しました");
  }
  event.target.value = "";
  await loadImages(section);
}

async function deleteImage(imageId, section) {
  if (!confirm("この画像を削除しますか？")) return;
  await api(`/api/images/${imageId}`, "DELETE");
  await loadImages(section);
}

// ==================== セクション（blocks）の描画 ====================

async function loadBlocks(tab) {
  const blocks = await api(`/api/blocks?tab=${tab}`);
  state.blocks[tab] = blocks;
  renderBlocks(tab, blocks);
}

function renderBlocks(tab, blocks) {
  const container = document.getElementById(`blocks-${tab}`);
  container.innerHTML = blocks.map((block, index) => renderBlock(block, index)).join("");
}

function renderBlock(block, index) {
  const num = String(index + 1).padStart(2, "0");
  const badge = block.badgeLabel
    ? `<div class="badge badge-${block.badgeColor || "red"}" style="margin-bottom:12px">${esc(block.badgeLabel)}</div>`
    : "";

  const header = `
    ${badge}
    <div class="section-label">Section ${num}</div>
    <div class="section-title" style="color:var(--${block.tab})">
      ${esc(block.title)}
      <span class="block-actions">
        <button type="button" class="icon-btn" data-action="edit-block" data-block-id="${block.id}" title="セクションを編集">✎</button>
        <button type="button" class="icon-btn" data-action="delete-block" data-block-id="${block.id}" title="セクションを削除">🗑</button>
      </span>
    </div>
  `;

  const renderer = { cards: renderCards, combos: renderCombos, warnings: renderWarnings, techniques: renderTechniques }[block.type];
  const content = renderer ? renderer(block) : "";

  const addLabel = { cards: "カード", combos: "コンボ", warnings: "警告", techniques: "技" }[block.type] || "項目";
  const addBtn = `<button type="button" class="add-item-btn" data-action="add-item" data-block-id="${block.id}">＋ ${addLabel}を追加</button>`;

  return `<div class="block" data-block-id="${block.id}">${header}${content}${addBtn}</div>`;
}

function itemActions(block, item) {
  return `
    <span class="item-actions">
      <button type="button" class="icon-btn" data-action="edit-item" data-block-id="${block.id}" data-item-id="${item.id}" title="編集">✎</button>
      <button type="button" class="icon-btn" data-action="delete-item" data-block-id="${block.id}" data-item-id="${item.id}" title="削除">✕</button>
    </span>
  `;
}

function renderCards(block) {
  const cards = block.items
    .map(
      (item) => `
    <div class="card" data-accent="${block.tab}">
      <div class="card-header">${esc(item.data.header)} ${itemActions(block, item)}</div>
      <ul>${item.data.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </div>
  `
    )
    .join("");
  return `<div class="card-grid">${cards}</div>`;
}

function renderCombos(block) {
  const combos = block.items
    .map(
      (item, i) => `
    <div class="combo-item" style="border-left-color:var(--${block.tab})">
      <div class="combo-num" style="color:var(--${block.tab})">${String(i + 1).padStart(2, "0")}</div>
      <div class="combo-body">
        <div class="combo-name" style="color:var(--${block.tab})">${esc(item.data.name)} ${itemActions(block, item)}</div>
        <div class="combo-desc">${esc(item.data.desc)}</div>
        <div class="combo-tags">${item.data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
    </div>
  `
    )
    .join("");
  return `<div class="combo-list">${combos}</div>`;
}

function renderWarnings(block) {
  const colorClass = block.color === "yellow" || block.color === "blue" ? ` ${block.color}` : "";
  return block.items
    .map(
      (item) => `
    <div class="warning-block${colorClass}">
      <div class="warning-title">${esc(item.data.title)} ${itemActions(block, item)}</div>
      <div class="warning-text">${esc(item.data.text)}</div>
    </div>
  `
    )
    .join("");
}

function renderTechniques(block) {
  const rows = block.items
    .map(
      (item) => `
    <tr>
      <td class="tech-name">${esc(item.data.name)}</td>
      <td><span class="badge badge-${item.data.badgeColor}">${esc(item.data.badgeLabel)}</span></td>
      <td>${esc(item.data.point)}</td>
      <td class="tech-actions">${itemActions(block, item)}</td>
    </tr>
  `
    )
    .join("");
  return `
    <table class="technique-table">
      <thead><tr><th>技名</th><th>種別</th><th>ポイント</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ==================== モーダル（追加・編集フォーム） ====================

const modalOverlay = document.getElementById("modal-overlay");
const modalTitleEl = document.getElementById("modal-title");
const modalBodyEl = document.getElementById("modal-body");
const modalForm = document.getElementById("modal-form");
let currentSubmitHandler = null;

function showModal() {
  modalOverlay.hidden = false;
}
function closeModal() {
  modalOverlay.hidden = true;
  modalForm.reset();
  currentSubmitHandler = null;
}
modalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentSubmitHandler) await currentSubmitHandler();
});

function openBlockModal(tab, existingBlock) {
  const isEdit = !!existingBlock;
  modalTitleEl.textContent = isEdit ? "セクションを編集" : "新しいセクションを追加";

  const typeField = isEdit
    ? `<div class="field"><label>種類</label><div>${TYPE_LABELS[existingBlock.type]}（追加後は変更できません）</div></div>`
    : `<div class="field"><label for="f-type">種類</label>
        <select id="f-type" required>
          <option value="cards">カード（見出し＋箇条書き）</option>
          <option value="combos">コンビネーション（番号付きリスト）</option>
          <option value="warnings">警告・注意ブロック</option>
          <option value="techniques">技一覧テーブル</option>
        </select>
      </div>`;

  modalBodyEl.innerHTML = `
    ${typeField}
    <div class="field"><label for="f-title">タイトル</label><input id="f-title" type="text" required value="${esc(existingBlock?.title ?? "")}"></div>
    <div class="field"><label for="f-badge-label">バッジ文字（任意。例: DEFENSE）</label><input id="f-badge-label" type="text" value="${esc(existingBlock?.badgeLabel ?? "")}"></div>
    <div class="field"><label for="f-badge-color">バッジの色</label>${colorSelect("f-badge-color", existingBlock?.badgeColor)}</div>
    <div class="field"><label for="f-color">警告ブロックの色（種類が「警告」の場合のみ使用）</label>${colorSelect("f-color", existingBlock?.color)}</div>
  `;

  currentSubmitHandler = async () => {
    const payload = {
      title: document.getElementById("f-title").value,
      badgeLabel: document.getElementById("f-badge-label").value || null,
      badgeColor: document.getElementById("f-badge-color").value || null,
      color: document.getElementById("f-color").value || null,
    };
    if (isEdit) {
      await api(`/api/blocks/${existingBlock.id}`, "PUT", payload);
    } else {
      payload.type = document.getElementById("f-type").value;
      payload.tab = tab;
      await api("/api/blocks", "POST", payload);
    }
    closeModal();
    await loadBlocks(tab);
  };
  showModal();
}

function fieldsForItem(type, d) {
  if (type === "cards") {
    return `
      <div class="field"><label for="f-header">見出し</label><input id="f-header" type="text" required value="${esc(d.header ?? "")}"></div>
      <div class="field"><label for="f-bullets">箇条書き（1行に1つ）</label><textarea id="f-bullets" rows="5">${esc((d.bullets ?? []).join("\n"))}</textarea></div>
    `;
  }
  if (type === "combos") {
    return `
      <div class="field"><label for="f-name">技・コンボ名</label><input id="f-name" type="text" required value="${esc(d.name ?? "")}"></div>
      <div class="field"><label for="f-desc">説明</label><textarea id="f-desc" rows="4">${esc(d.desc ?? "")}</textarea></div>
      <div class="field"><label for="f-tags">タグ（カンマ区切り）</label><input id="f-tags" type="text" value="${esc((d.tags ?? []).join(", "))}"></div>
    `;
  }
  if (type === "warnings") {
    return `
      <div class="field"><label for="f-title">タイトル</label><input id="f-title" type="text" required value="${esc(d.title ?? "")}"></div>
      <div class="field"><label for="f-text">内容</label><textarea id="f-text" rows="4">${esc(d.text ?? "")}</textarea></div>
    `;
  }
  if (type === "techniques") {
    return `
      <div class="field"><label for="f-name">技名</label><input id="f-name" type="text" required value="${esc(d.name ?? "")}"></div>
      <div class="field"><label for="f-badge-label">種別（バッジ文字）</label><input id="f-badge-label" type="text" value="${esc(d.badgeLabel ?? "")}"></div>
      <div class="field"><label for="f-badge-color">バッジの色</label>${colorSelect("f-badge-color", d.badgeColor ?? "yellow")}</div>
      <div class="field"><label for="f-point">ポイント</label><textarea id="f-point" rows="3">${esc(d.point ?? "")}</textarea></div>
    `;
  }
  return "";
}

function collectItemData(type) {
  if (type === "cards") {
    return {
      header: document.getElementById("f-header").value,
      bullets: document.getElementById("f-bullets").value.split("\n").map((s) => s.trim()).filter(Boolean),
    };
  }
  if (type === "combos") {
    return {
      name: document.getElementById("f-name").value,
      desc: document.getElementById("f-desc").value,
      tags: document.getElementById("f-tags").value.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }
  if (type === "warnings") {
    return {
      title: document.getElementById("f-title").value,
      text: document.getElementById("f-text").value,
    };
  }
  if (type === "techniques") {
    return {
      name: document.getElementById("f-name").value,
      badgeLabel: document.getElementById("f-badge-label").value,
      badgeColor: document.getElementById("f-badge-color").value || "yellow",
      point: document.getElementById("f-point").value,
    };
  }
  return {};
}

function openItemModal(tab, block, existingItem) {
  const isEdit = !!existingItem;
  modalTitleEl.textContent = isEdit ? "項目を編集" : "項目を追加";
  modalBodyEl.innerHTML = fieldsForItem(block.type, existingItem?.data ?? {});

  currentSubmitHandler = async () => {
    const data = collectItemData(block.type);
    if (isEdit) {
      await api(`/api/items/${existingItem.id}`, "PUT", { data });
    } else {
      await api(`/api/blocks/${block.id}/items`, "POST", { data });
    }
    closeModal();
    await loadBlocks(tab);
  };
  showModal();
}

async function deleteBlock(tab, blockId) {
  if (!confirm("このセクションを削除しますか？中の項目もすべて削除されます。")) return;
  await api(`/api/blocks/${blockId}`, "DELETE");
  await loadBlocks(tab);
}

async function deleteItem(tab, blockId, itemId) {
  if (!confirm("この項目を削除しますか？")) return;
  await api(`/api/items/${itemId}`, "DELETE");
  await loadBlocks(tab);
}

// ==================== クリックの委任（動的に増える要素のボタンをまとめて処理） ====================

document.body.addEventListener("click", (event) => {
  if (event.target === modalOverlay) return; // モーダルの背景クリックはHTML側のonclickで処理
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === "delete-image") {
    deleteImage(btn.dataset.imageId, btn.dataset.section);
    return;
  }

  const tab = btn.closest("[data-tab]")?.dataset.tab;
  if (!tab) return;
  const block = btn.dataset.blockId ? findBlock(tab, btn.dataset.blockId) : null;

  if (action === "edit-block") openBlockModal(tab, block);
  else if (action === "delete-block") deleteBlock(tab, btn.dataset.blockId);
  else if (action === "add-item") openItemModal(tab, block);
  else if (action === "edit-item") openItemModal(tab, block, findItem(block, btn.dataset.itemId));
  else if (action === "delete-item") deleteItem(tab, btn.dataset.blockId, btn.dataset.itemId);
});

// ==================== 初期化 ====================

async function init() {
  await loadNotes();
  setupNoteAutosave();
  await Promise.all(TABS.map((tab) => Promise.all([loadBlocks(tab), loadImages(tab)])));
}

document.addEventListener("DOMContentLoaded", init);
