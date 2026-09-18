// ==================== 共通ユーティリティ ====================

const TABS = ["strike", "grapple", "ground"];
const TYPE_LABELS = { cards: "カード", combos: "コンビネーション", warnings: "警告", techniques: "技一覧テーブル" };
const CATEGORIES = ["strike", "grapple", "ground"];
const CATEGORY_LABELS = { strike: "打撃", grapple: "組み", ground: "寝技" };

// 状態はサーバーからの取得結果をタブごとに保持しておく（編集モーダルで既存データを引くため）
const state = {
  blocks: { strike: [], grapple: [], ground: [] },
  quizScenarios: [], // クイズ管理一覧
  quizCurrent: null, // 今出題中の問題
};

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
function findScenario(scenarioId) {
  return state.quizScenarios.find((s) => String(s.id) === String(scenarioId));
}
function findChoice(scenario, choiceId) {
  return scenario?.choices.find((c) => String(c.id) === String(choiceId));
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

// ==================== クイズ（出題） ====================

async function loadRandomScenario() {
  const category = document.getElementById("quiz-category").value;
  const game = document.getElementById("quiz-game");
  game.innerHTML = `<div class="quiz-loading">問題を読み込み中...</div>`;

  const url = category ? `/api/quiz/random?category=${category}` : "/api/quiz/random";
  try {
    const scenario = await api(url);
    state.quizCurrent = scenario;
    renderQuizGame(scenario, null);
  } catch {
    game.innerHTML = `<div class="quiz-loading">この条件の問題がまだありません。下の「問題の管理」から追加してください。</div>`;
  }
}

// selectedChoiceId が null のときは「未回答」、値が入っていれば「回答済み・正誤を表示」
function renderQuizGame(scenario, selectedChoiceId) {
  const answered = selectedChoiceId != null;

  const choicesHtml = scenario.choices
    .map((choice) => {
      let stateClass = "";
      if (answered) {
        if (String(choice.id) === String(selectedChoiceId)) stateClass = choice.correct ? "is-correct" : "is-wrong";
        else if (choice.correct) stateClass = "is-correct-reveal";
      }
      const explanation = answered && choice.explanation ? `<div class="quiz-explanation">${esc(choice.explanation)}</div>` : "";
      return `
        <button type="button" class="quiz-choice-btn ${stateClass}" data-action="answer" data-choice-id="${choice.id}" ${answered ? "disabled" : ""}>
          <div class="quiz-choice-text">${esc(choice.label)}</div>
          ${explanation}
        </button>
      `;
    })
    .join("");

  const nextBtn = answered
    ? `<button type="button" class="btn btn-primary quiz-next-btn" onclick="loadRandomScenario()">次の問題へ →</button>`
    : "";

  document.getElementById("quiz-game").innerHTML = `
    <div class="quiz-situation">
      <span class="tag">${CATEGORY_LABELS[scenario.category]}</span>
      <p>${esc(scenario.situation)}</p>
    </div>
    <div class="quiz-choices">${choicesHtml}</div>
    ${nextBtn}
  `;
}

function handleQuizAnswer(choiceId) {
  if (!state.quizCurrent) return;
  renderQuizGame(state.quizCurrent, choiceId);
}

// ==================== クイズ（問題の管理） ====================

async function loadQuizManage() {
  const scenarios = await api("/api/quiz");
  state.quizScenarios = scenarios;
  renderQuizManage(scenarios);
}

function renderQuizManage(scenarios) {
  document.getElementById("quiz-manage").innerHTML = scenarios.map(renderScenarioCard).join("");
}

function renderScenarioCard(scenario) {
  const choicesHtml = scenario.choices
    .map(
      (choice) => `
    <li class="quiz-choice-row-view">
      <span class="quiz-choice-mark">${choice.correct ? "✓" : "✕"}</span>
      <span class="quiz-choice-row-label">${esc(choice.label)}</span>
      <span class="item-actions">
        <button type="button" class="icon-btn" data-action="edit-choice" data-scenario-id="${scenario.id}" data-choice-id="${choice.id}" title="編集">✎</button>
        <button type="button" class="icon-btn" data-action="delete-choice" data-scenario-id="${scenario.id}" data-choice-id="${choice.id}" title="削除">✕</button>
      </span>
    </li>
  `
    )
    .join("");

  return `
    <div class="quiz-scenario-card">
      <div class="quiz-scenario-head">
        <span class="tag">${CATEGORY_LABELS[scenario.category]}</span>
        <span class="quiz-scenario-situation">${esc(scenario.situation)}</span>
        <span class="block-actions">
          <button type="button" class="icon-btn" data-action="edit-scenario" data-scenario-id="${scenario.id}" title="編集">✎</button>
          <button type="button" class="icon-btn" data-action="delete-scenario" data-scenario-id="${scenario.id}" title="削除">🗑</button>
        </span>
      </div>
      <ul class="quiz-choice-list">${choicesHtml}</ul>
      <button type="button" class="add-item-btn" data-action="add-choice" data-scenario-id="${scenario.id}">＋ 選択肢を追加</button>
    </div>
  `;
}

async function deleteScenario(scenarioId) {
  if (!confirm("この問題を削除しますか？選択肢もすべて削除されます。")) return;
  await api(`/api/quiz/${scenarioId}`, "DELETE");
  await loadQuizManage();
}

async function deleteChoice(choiceId) {
  if (!confirm("この選択肢を削除しますか？")) return;
  await api(`/api/quiz/choices/${choiceId}`, "DELETE");
  await loadQuizManage();
}

// 新しい問題を作るときだけ、選択肢の入力欄を「増やす/減らす」できるようにする
function setupQuizChoiceRows() {
  const rowsContainer = document.getElementById("quiz-choice-rows");
  const addRow = () => {
    const row = document.createElement("div");
    row.className = "quiz-choice-row";
    row.innerHTML = `
      <input type="text" class="qc-label" placeholder="選択肢の内容">
      <label class="qc-correct-label"><input type="checkbox" class="qc-correct"> 正解</label>
      <textarea class="qc-explanation" rows="2" placeholder="解説（任意）"></textarea>
      <button type="button" class="icon-btn" data-action="remove-choice-row" title="この選択肢を削除">✕</button>
    `;
    rowsContainer.appendChild(row);
  };
  addRow();
  addRow();
  document.getElementById("quiz-add-choice-row").addEventListener("click", addRow);
  rowsContainer.addEventListener("click", (event) => {
    if (event.target.dataset.action !== "remove-choice-row") return;
    if (rowsContainer.children.length <= 2) {
      alert("選択肢は最低2つ必要です");
      return;
    }
    event.target.closest(".quiz-choice-row").remove();
  });
}

function collectQuizChoiceRows() {
  return Array.from(document.querySelectorAll("#quiz-choice-rows .quiz-choice-row")).map((row) => ({
    label: row.querySelector(".qc-label").value,
    correct: row.querySelector(".qc-correct").checked,
    explanation: row.querySelector(".qc-explanation").value,
  }));
}

function openScenarioModal(existingScenario) {
  const isEdit = !!existingScenario;
  modalTitleEl.textContent = isEdit ? "問題を編集" : "新しい問題を追加";

  const categoryOptions = CATEGORIES.map(
    (c) => `<option value="${c}" ${c === (existingScenario?.category ?? "ground") ? "selected" : ""}>${CATEGORY_LABELS[c]}</option>`
  ).join("");

  const choicesField = isEdit
    ? ""
    : `<div class="field">
        <label>選択肢（2つ以上・複数を「正解」にしてもOK）</label>
        <div id="quiz-choice-rows"></div>
        <button type="button" class="add-item-btn" id="quiz-add-choice-row">＋ 選択肢を増やす</button>
      </div>`;

  modalBodyEl.innerHTML = `
    <div class="field"><label for="f-category">カテゴリ</label><select id="f-category">${categoryOptions}</select></div>
    <div class="field"><label for="f-situation">状況設定</label><textarea id="f-situation" rows="3" required>${esc(existingScenario?.situation ?? "")}</textarea></div>
    ${choicesField}
  `;
  if (!isEdit) setupQuizChoiceRows();

  currentSubmitHandler = async () => {
    const category = document.getElementById("f-category").value;
    const situation = document.getElementById("f-situation").value;

    if (isEdit) {
      await api(`/api/quiz/${existingScenario.id}`, "PUT", { category, situation });
    } else {
      const choices = collectQuizChoiceRows();
      await api("/api/quiz", "POST", { category, situation, choices });
    }
    closeModal();
    await loadQuizManage();
  };
  showModal();
}

function openChoiceModal(scenario, existingChoice) {
  const isEdit = !!existingChoice;
  modalTitleEl.textContent = isEdit ? "選択肢を編集" : "選択肢を追加";

  modalBodyEl.innerHTML = `
    <div class="field"><label for="f-label">選択肢の内容</label><input id="f-label" type="text" required value="${esc(existingChoice?.label ?? "")}"></div>
    <div class="field"><label><input type="checkbox" id="f-correct" ${existingChoice?.correct ? "checked" : ""}> これは正解にする</label></div>
    <div class="field"><label for="f-explanation">解説</label><textarea id="f-explanation" rows="3">${esc(existingChoice?.explanation ?? "")}</textarea></div>
  `;

  currentSubmitHandler = async () => {
    const payload = {
      label: document.getElementById("f-label").value,
      correct: document.getElementById("f-correct").checked,
      explanation: document.getElementById("f-explanation").value,
    };
    if (isEdit) {
      await api(`/api/quiz/choices/${existingChoice.id}`, "PUT", payload);
    } else {
      await api(`/api/quiz/${scenario.id}/choices`, "POST", payload);
    }
    closeModal();
    await loadQuizManage();
  };
  showModal();
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

  // ---- クイズ関連のアクション ----
  if (action === "answer") return handleQuizAnswer(btn.dataset.choiceId);
  if (action === "edit-scenario") return openScenarioModal(findScenario(btn.dataset.scenarioId));
  if (action === "delete-scenario") return deleteScenario(btn.dataset.scenarioId);
  if (action === "add-choice") return openChoiceModal(findScenario(btn.dataset.scenarioId));
  if (action === "edit-choice") {
    const scenario = findScenario(btn.dataset.scenarioId);
    return openChoiceModal(scenario, findChoice(scenario, btn.dataset.choiceId));
  }
  if (action === "delete-choice") return deleteChoice(btn.dataset.choiceId);

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
  await Promise.all([
    ...TABS.map((tab) => Promise.all([loadBlocks(tab), loadImages(tab)])),
    loadRandomScenario(),
    loadQuizManage(),
  ]);
}

document.addEventListener("DOMContentLoaded", init);
