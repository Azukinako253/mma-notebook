import express from "express";
import multer from "multer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
