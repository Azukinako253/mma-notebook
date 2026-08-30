# MMA NOTEBOOK

個人的な MMA（総合格闘技）トレーニングノートをまとめた Web アプリです。
打撃・組み・寝技の3カテゴリをタブで切り替えながら、技術メモや写真を記録できます。
Express + SQLite の簡易バックエンドを備え、画像・フリーノートはリロードしても消えません。

## 特徴

- **タブ切り替え**：打撃 / 組み / 寝技の3タブで内容を整理
- **技術カード・コンビネーション一覧・使える技一覧（テーブル）** で情報を構造化
- **画像アップロード**：各タブに写真参照エリアがあり、選択した画像をサーバ（SQLite）にアップロード・保存
- **フリーノート**：`contenteditable` の自由記述メモ欄。入力すると自動でサーバに保存
- **API**：`app.get` / `app.post` / `app.delete` によるシンプルな REST API（下記参照）

## ディレクトリ構成

```
mma-note/
├── public/
│   ├── index.html         # 本体（タブ・カード・テーブルなどのUI）
│   ├── style.css          # スタイル（CSS変数でテーマカラーを管理）
│   └── script.js          # タブ切り替え・画像アップロード・API通信のロジック
├── server/
│   ├── index.js           # Express サーバ（静的配信 + API）
│   └── db.js              # SQLite（better-sqlite3）の初期化・スキーマ定義
├── data/                   # SQLite DB ファイル（.gitignore 対象、自動生成）
├── tests/
│   └── smoke.test.mjs     # ビルド成果物の簡易チェック
├── package.json
└── .gitignore
```

## セットアップ・使い方

Node.js 18 以上が必要です。

```bash
npm install
```

### 開発サーバーを起動

```bash
npm run dev
```

Express サーバが `http://localhost:5173` で起動し、`public/` の静的配信と API 通信の両方を行います（`data/mma-note.db` が自動作成されます）。

### 静的配信のみでプレビュー（API・永続化なし）

```bash
npm run static
```

### ビルド

```bash
npm run build
```

`public/` の内容を `dist/` にそのままコピーします（バンドラ等は使用していません。API は含まれないため、`dist` 単体では画像・メモの保存はできません）。

### ビルド結果をプレビュー

```bash
npm run preview
```

`dist/` を `http://localhost:4173` で配信します。

### テスト

```bash
npm test
```

### ビルド＋テストをまとめて実行

```bash
npm run verify
```

## API

すべて `npm run dev` で起動した Express サーバ（`http://localhost:5173`）に対して呼び出します。

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/notes` | 全フリーノートを `{ key: content }` 形式で取得 |
| GET | `/api/notes/:key` | 指定キー（`strike` / `grapple` / `ground`）のノートを取得 |
| POST | `/api/notes/:key` | `{ "content": "..." }` を保存（新規作成 or 上書き） |
| GET | `/api/images/:section` | 指定セクションの画像一覧（メタデータのみ）を取得 |
| GET | `/api/images/file/:id` | 画像本体（バイナリ）を取得 |
| POST | `/api/images/:section` | `multipart/form-data` で画像をアップロード（フィールド名 `images`、複数可） |
| DELETE | `/api/images/:id` | 画像を削除 |

画像は SQLite の BLOB カラムに、ノートはテキストカラムに保存されます（`data/mma-note.db`）。

## 注意事項

- `data/` フォルダの SQLite DB がデータの実体です。バックアップしたい場合はこのフォルダをコピーしてください。
- `npm run static` や `npm run preview`（純粋な静的配信）で開いた場合は API に接続できないため、画像・メモの保存は機能しません。
