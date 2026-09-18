import express from "express";
import multer from "multer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";

const root = join(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT || 5173;

const app = express();
app.use(express.json());

// 画像はメモリに受け取ってから DB(BLOB) に保存する
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 1ファイル10MBまで
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("画像ファイルのみアップロードできます"));
      return;
    }
    cb(null, true);
  },
});

const BLOCK_TYPES = ["cards", "combos", "warnings", "techniques"];
const COLORS = ["red", "yellow", "blue"];
const CATEGORIES = ["strike", "grapple", "ground"];

function normalizeColor(value) {
  return COLORS.includes(value) ? value : null;
}

// ブロックの種類ごとに、itemのdataを「決まった形」に整える（変な入力が来ても壊れないように）
function normalizeItemData(type, input) {
  const src = input && typeof input === "object" ? input : {};
  switch (type) {
    case "cards":
      return {
        header: typeof src.header === "string" ? src.header : "",
        bullets: Array.isArray(src.bullets) ? src.bullets.map(String) : [],
      };
    case "combos":
      return {
        name: typeof src.name === "string" ? src.name : "",
        desc: typeof src.desc === "string" ? src.desc : "",
        tags: Array.isArray(src.tags) ? src.tags.map(String) : [],
      };
    case "warnings":
      return {
        title: typeof src.title === "string" ? src.title : "",
        text: typeof src.text === "string" ? src.text : "",
      };
    case "techniques":
      return {
        name: typeof src.name === "string" ? src.name : "",
        badgeLabel: typeof src.badgeLabel === "string" ? src.badgeLabel : "",
        badgeColor: normalizeColor(src.badgeColor) ?? "yellow",
        point: typeof src.point === "string" ? src.point : "",
      };
    default:
      return {};
  }
}

function rowToBlock(row) {
  return {
    id: row.id,
    tab: row.tab,
    type: row.type,
    title: row.title,
    color: row.color,
    badgeLabel: row.badge_label,
    badgeColor: row.badge_color,
    position: row.position,
  };
}

function rowToItem(row) {
  return { id: row.id, blockId: row.block_id, position: row.position, data: JSON.parse(row.data) };
}

function rowToScenario(row) {
  return { id: row.id, category: row.category, situation: row.situation, position: row.position };
}

function rowToChoice(row) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    label: row.label,
    correct: row.is_correct === 1,
    explanation: row.explanation,
    position: row.position,
  };
}

// Fisher-Yatesシャッフル：配列の中身をランダムな順番に並べ替える（元の配列は変更しない）
function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Notes API ----------

// 全メモ取得: { strike: "...", grapple: "...", ground: "..." }
app.get("/api/notes", (req, res) => {
  const rows = db.prepare("SELECT key, content FROM notes").all();
  const notes = {};
  for (const row of rows) notes[row.key] = row.content;
  res.json(notes);
});

// 1件取得
app.get("/api/notes/:key", (req, res) => {
  const row = db
    .prepare("SELECT key, content, updated_at FROM notes WHERE key = ?")
    .get(req.params.key);
  res.json(row ?? { key: req.params.key, content: "", updated_at: null });
});

// 保存（新規 or 上書き）
app.post("/api/notes/:key", (req, res) => {
  const { key } = req.params;
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const updatedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO notes (key, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(key, content, updatedAt);

  res.json({ key, content, updated_at: updatedAt });
});

// ---------- Images API ----------

// 指定セクションの画像一覧（本体データは含めない）
app.get("/api/images/:section", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, section, filename, mimetype, caption, created_at FROM images WHERE section = ? ORDER BY id ASC"
    )
    .all(req.params.section);
  res.json(rows);
});

// 画像本体をバイナリで返す
app.get("/api/images/file/:id", (req, res) => {
  const row = db
    .prepare("SELECT mimetype, data FROM images WHERE id = ?")
    .get(req.params.id);
  if (!row) return res.status(404).end();
  res.set("Content-Type", row.mimetype);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(row.data);
});

// アップロード（複数可）
app.post("/api/images/:section", upload.array("images", 10), (req, res) => {
  const { section } = req.params;
  const createdAt = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO images (section, filename, mimetype, caption, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const inserted = (req.files ?? []).map((file) => {
    const caption = file.originalname.replace(/\.[^.]+$/, "");
    const info = insert.run(section, file.originalname, file.mimetype, caption, file.buffer, createdAt);
    return {
      id: info.lastInsertRowid,
      section,
      filename: file.originalname,
      mimetype: file.mimetype,
      caption,
      created_at: createdAt,
    };
  });

  res.status(201).json(inserted);
});

// 削除
app.delete("/api/images/:id", (req, res) => {
  const info = db.prepare("DELETE FROM images WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).end();
  res.status(204).end();
});

// ---------- Blocks / Items API ----------
// blocks = セクション（ファイトスタイル、コンビネーション、使える技一覧…）
// items  = セクションの中の1項目（カード1枚、コンボ1個、警告1個、技一覧の1行）

// 指定タブのブロック一覧を、それぞれのitemsを含めて返す
app.get("/api/blocks", (req, res) => {
  const { tab } = req.query;
  const blockRows = tab
    ? db.prepare("SELECT * FROM blocks WHERE tab = ? ORDER BY position ASC").all(tab)
    : db.prepare("SELECT * FROM blocks ORDER BY tab ASC, position ASC").all();

  const itemsByBlock = db.prepare("SELECT * FROM items WHERE block_id = ? ORDER BY position ASC");

  const blocks = blockRows.map((row) => {
    const block = rowToBlock(row);
    block.items = itemsByBlock.all(row.id).map(rowToItem);
    return block;
  });

  res.json(blocks);
});

// 新しいセクションを追加
app.post("/api/blocks", (req, res) => {
  const { tab, type, title } = req.body ?? {};
  if (!["strike", "grapple", "ground"].includes(tab)) {
    return res.status(400).json({ error: "tab が不正です" });
  }
  if (!BLOCK_TYPES.includes(type)) {
    return res.status(400).json({ error: "type が不正です" });
  }
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title を入力してください" });
  }

  const { maxPosition } = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM blocks WHERE tab = ?")
    .get(tab);

  const info = db
    .prepare(
      `INSERT INTO blocks (tab, type, title, color, badge_label, badge_color, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tab,
      type,
      title.trim(),
      normalizeColor(req.body?.color),
      typeof req.body?.badgeLabel === "string" ? req.body.badgeLabel : null,
      normalizeColor(req.body?.badgeColor),
      maxPosition + 1
    );

  const row = db.prepare("SELECT * FROM blocks WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...rowToBlock(row), items: [] });
});

// セクションのタイトル・色・バッジを編集
app.put("/api/blocks/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM blocks WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).end();

  const title = typeof req.body?.title === "string" && req.body.title.trim() !== ""
    ? req.body.title.trim()
    : existing.title;
  const color = "color" in (req.body ?? {}) ? normalizeColor(req.body.color) : existing.color;
  const badgeLabel = "badgeLabel" in (req.body ?? {})
    ? (typeof req.body.badgeLabel === "string" ? req.body.badgeLabel : null)
    : existing.badge_label;
  const badgeColor = "badgeColor" in (req.body ?? {}) ? normalizeColor(req.body.badgeColor) : existing.badge_color;

  db.prepare(
    "UPDATE blocks SET title = ?, color = ?, badge_label = ?, badge_color = ? WHERE id = ?"
  ).run(title, color, badgeLabel, badgeColor, req.params.id);

  const row = db.prepare("SELECT * FROM blocks WHERE id = ?").get(req.params.id);
  res.json(rowToBlock(row));
});

// セクションごと削除（中のitemsも一緒に消える）
app.delete("/api/blocks/:id", (req, res) => {
  const info = db.prepare("DELETE FROM blocks WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).end();
  res.status(204).end();
});

// セクションに項目を追加
app.post("/api/blocks/:blockId/items", (req, res) => {
  const block = db.prepare("SELECT * FROM blocks WHERE id = ?").get(req.params.blockId);
  if (!block) return res.status(404).json({ error: "セクションが見つかりません" });

  const data = normalizeItemData(block.type, req.body?.data);
  const { maxPosition } = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM items WHERE block_id = ?")
    .get(block.id);

  const info = db
    .prepare("INSERT INTO items (block_id, position, data) VALUES (?, ?, ?)")
    .run(block.id, maxPosition + 1, JSON.stringify(data));

  res.status(201).json({ id: info.lastInsertRowid, blockId: block.id, position: maxPosition + 1, data });
});

// 項目を編集
app.put("/api/items/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT items.*, blocks.type AS block_type FROM items
       JOIN blocks ON blocks.id = items.block_id
       WHERE items.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).end();

  const data = normalizeItemData(row.block_type, req.body?.data);
  db.prepare("UPDATE items SET data = ? WHERE id = ?").run(JSON.stringify(data), req.params.id);

  res.json({ id: row.id, blockId: row.block_id, position: row.position, data });
});

// 項目を削除
app.delete("/api/items/:id", (req, res) => {
  const info = db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).end();
  res.status(204).end();
});

// ---------- Quiz API ----------
// scenarios = 状況設定（「マウントを取られそうです。どうする？」）
// scenario_choices = その選択肢（正解/不正解・解説つき）

function loadScenarioWithChoices(scenarioRow) {
  const scenario = rowToScenario(scenarioRow);
  scenario.choices = db
    .prepare("SELECT * FROM scenario_choices WHERE scenario_id = ? ORDER BY position ASC")
    .all(scenarioRow.id)
    .map(rowToChoice);
  return scenario;
}

// 管理用：全シナリオ一覧（順番どおり。カテゴリで絞り込み可）
app.get("/api/quiz", (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare("SELECT * FROM scenarios WHERE category = ? ORDER BY position ASC").all(category)
    : db.prepare("SELECT * FROM scenarios ORDER BY category ASC, position ASC").all();
  res.json(rows.map(loadScenarioWithChoices));
});

// 出題用：ランダムに1問。選択肢の並び順もシャッフルする
app.get("/api/quiz/random", (req, res) => {
  const { category } = req.query;
  const row = category
    ? db.prepare("SELECT * FROM scenarios WHERE category = ? ORDER BY RANDOM() LIMIT 1").get(category)
    : db.prepare("SELECT * FROM scenarios ORDER BY RANDOM() LIMIT 1").get();
  if (!row) return res.status(404).json({ error: "問題がまだ登録されていません" });

  const scenario = loadScenarioWithChoices(row);
  scenario.choices = shuffled(scenario.choices);
  res.json(scenario);
});

// 新しいシナリオ（選択肢も一緒に）を追加
app.post("/api/quiz", (req, res) => {
  const { category, situation, choices } = req.body ?? {};
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "category が不正です" });
  }
  if (typeof situation !== "string" || situation.trim() === "") {
    return res.status(400).json({ error: "situation を入力してください" });
  }
  if (!Array.isArray(choices) || choices.length < 2) {
    return res.status(400).json({ error: "選択肢は2つ以上必要です" });
  }

  const { maxPosition } = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM scenarios WHERE category = ?")
    .get(category);

  const insertScenario = db.prepare(
    "INSERT INTO scenarios (category, situation, position) VALUES (?, ?, ?)"
  );
  const insertChoice = db.prepare(
    `INSERT INTO scenario_choices (scenario_id, label, is_correct, explanation, position)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    const info = insertScenario.run(category, situation.trim(), maxPosition + 1);
    choices.forEach((choice, position) => {
      insertChoice.run(
        info.lastInsertRowid,
        typeof choice?.label === "string" ? choice.label : "",
        choice?.correct ? 1 : 0,
        typeof choice?.explanation === "string" ? choice.explanation : "",
        position
      );
    });
    return info.lastInsertRowid;
  });

  const scenarioId = insertAll();
  const row = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(scenarioId);
  res.status(201).json(loadScenarioWithChoices(row));
});

// シナリオ本文（状況・カテゴリ）を編集
app.put("/api/quiz/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).end();

  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : existing.category;
  const situation = typeof req.body?.situation === "string" && req.body.situation.trim() !== ""
    ? req.body.situation.trim()
    : existing.situation;

  db.prepare("UPDATE scenarios SET category = ?, situation = ? WHERE id = ?").run(
    category, situation, req.params.id
  );

  const row = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(req.params.id);
  res.json(loadScenarioWithChoices(row));
});

// シナリオごと削除（選択肢も一緒に消える）
app.delete("/api/quiz/:id", (req, res) => {
  const info = db.prepare("DELETE FROM scenarios WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).end();
  res.status(204).end();
});

// シナリオに選択肢を追加
app.post("/api/quiz/:scenarioId/choices", (req, res) => {
  const scenario = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(req.params.scenarioId);
  if (!scenario) return res.status(404).json({ error: "シナリオが見つかりません" });

  const { maxPosition } = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM scenario_choices WHERE scenario_id = ?")
    .get(scenario.id);

  const info = db
    .prepare(
      `INSERT INTO scenario_choices (scenario_id, label, is_correct, explanation, position)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      scenario.id,
      typeof req.body?.label === "string" ? req.body.label : "",
      req.body?.correct ? 1 : 0,
      typeof req.body?.explanation === "string" ? req.body.explanation : "",
      maxPosition + 1
    );

  const row = db.prepare("SELECT * FROM scenario_choices WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(rowToChoice(row));
});

// 選択肢を編集
app.put("/api/quiz/choices/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM scenario_choices WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).end();

  const label = typeof req.body?.label === "string" ? req.body.label : existing.label;
  const correct = "correct" in (req.body ?? {}) ? (req.body.correct ? 1 : 0) : existing.is_correct;
  const explanation = typeof req.body?.explanation === "string" ? req.body.explanation : existing.explanation;

  db.prepare(
    "UPDATE scenario_choices SET label = ?, is_correct = ?, explanation = ? WHERE id = ?"
  ).run(label, correct, explanation, req.params.id);

  const row = db.prepare("SELECT * FROM scenario_choices WHERE id = ?").get(req.params.id);
  res.json(rowToChoice(row));
});

// 選択肢を削除
app.delete("/api/quiz/choices/:id", (req, res) => {
  const info = db.prepare("DELETE FROM scenario_choices WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).end();
  res.status(204).end();
});

// multer 等のエラーを JSON で返す
app.use((err, req, res, next) => {
  if (err) {
    res.status(400).json({ error: err.message || "リクエストエラー" });
    return;
  }
  next();
});

// ---------- 静的ファイル（public/）----------
app.use(express.static(join(root, "public")));

app.listen(PORT, () => {
  console.log(`MMA NOTEBOOK server: http://localhost:${PORT}`);
});
