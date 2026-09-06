import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "mma-note.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    key TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    data BLOB NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_images_section ON images(section);

  -- 「セクション」（ファイトスタイル、コンビネーション、使える技一覧…）を表す汎用テーブル
  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tab TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cards', 'combos', 'warnings', 'techniques')),
    title TEXT NOT NULL,
    color TEXT,
    badge_label TEXT,
    badge_color TEXT,
    position INTEGER NOT NULL
  );

  -- セクション内の1項目（カード1枚、コンボ1個、警告1個、技一覧の1行）を表す汎用テーブル
  -- data列には type ごとに形の違うJSONが入る
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_blocks_tab ON blocks(tab);
  CREATE INDEX IF NOT EXISTS idx_items_block ON items(block_id);
`);

// ---------- 初期データ（アプリに元々あった内容をそのまま種データとして投入）----------

function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM blocks").get();
  if (count > 0) return; // 既にデータがあれば何もしない（サーバー再起動のたびに増殖しないように）

  const insertBlock = db.prepare(
    `INSERT INTO blocks (tab, type, title, color, badge_label, badge_color, position)
     VALUES (@tab, @type, @title, @color, @badgeLabel, @badgeColor, @position)`
  );
  const insertItem = db.prepare(
    `INSERT INTO items (block_id, position, data) VALUES (?, ?, ?)`
  );

  const seedBlocks = [
    // ---------- 打撃 ----------
    {
      tab: "strike",
      type: "cards",
      title: "ファイトスタイル",
      items: [
        { header: "スタンス", bullets: [
          "オーソドックス（左構え）",
          "重心は両足均等、膝を軽く曲げる",
          "顎を引き、ガードは顔の横に密着",
          "肘は締め、脇腹をカバー",
        ] },
        { header: "距離管理", bullets: [
          "ロングレンジ：ジャブで牽制・スペース確保",
          "ミドルレンジ：コンビネーションの主戦場",
          "クロスレンジ：クリンチ移行 or ショートパンチ",
          "常にフットワークで最適距離を維持",
        ] },
        { header: "プレッシャーと動き", bullets: [
          "前に出る時は左足から、引く時は右足から",
          "サークリングで相手の右（自分の左）に動く",
          "打ったら必ず戻す・距離を取る",
        ] },
      ],
    },
    {
      tab: "strike",
      type: "combos",
      title: "コンビネーション",
      items: [
        { name: "ジャブ → ストレート", desc: "基本中の基本。ジャブで距離を測りながら相手のガードを開かせ、ストレートで仕留める。", tags: ["ベーシック", "距離確認"] },
        { name: "ジャブ → ストレート → 左フック", desc: "3連コンボ。ストレートで相手が引いたところに左フックを合わせる。リズムが重要。", tags: ["スタンダード", "KOルート"] },
        { name: "ジャブ → ボディストレート → 顔フック", desc: "ボディへの攻撃で相手のガードを下げ、顔面へのフックに繋げる。ガード崩しに効果的。", tags: ["ボディ攻め", "ガード崩し"] },
        { name: "ワンツー → テイクダウン", desc: "MMAならではの打撃からの組み移行。ストレートを打ちながらレベルチェンジしてダブルレッグ。", tags: ["MMA特有", "組み移行", "重要"] },
        { name: "ミドルキック → ストレート", desc: "キックで相手の意識を下に向けてからストレート。または逆に顔面を打ったあとミドルを蹴る。", tags: ["ミックス", "注意分散"] },
      ],
    },
    {
      tab: "strike",
      type: "cards",
      title: "ポイント & 意識",
      items: [
        { header: "打撃の基本ポイント", bullets: [
          "体重移動を必ず伴う。腕だけで打たない",
          "打った後は必ずガードを戻す",
          "呼吸は打つ瞬間に吐く（インパクト時）",
          "ヒットした後に前に出てプレッシャー",
          "視線は相手の胸〜肩あたり（全体を見る）",
        ] },
        { header: "フットワーク", bullets: [
          "常に動き続ける。止まらない",
          "クロスステップは使わない（転倒リスク）",
          "打つ時はステップインしながら",
          "距離が詰まったらすぐピボットorサークル",
        ] },
      ],
    },
    {
      tab: "strike",
      type: "warnings",
      title: "よく陥りやすいミス",
      color: "red",
      items: [
        { title: "MISTAKE 01 — ガードを下げる", text: "打った後に腕を下げたままにしてしまう。特にフック後。必ず打ち終わりに両手を顔横に戻す意識を持つ。" },
        { title: "MISTAKE 02 — 腕だけで打つ", text: "肩・腰の回転が伴っていない。パワーが出ないだけでなく、バランスも崩れる。体全体を使うこと。" },
        { title: "MISTAKE 03 — 同じコンビネーションを繰り返す", text: "相手にリズムを読まれる。バリエーションを持ち、打つ順序・タイミングをランダムにする。" },
        { title: "MISTAKE 04 — テイクダウン後の打撃を忘れる", text: "MMAでは組みの後も打撃が有効。テイクダウン時に頭が前に出て被弾するケースが多い。レベルチェンジ時の顎の位置に注意。" },
      ],
    },

    // ---------- 組み ----------
    {
      tab: "grapple",
      type: "cards",
      title: "基本的な崩し・払い・押さえ",
      items: [
        { header: "崩し", bullets: [
          "引き手で相手を引き込む（内側から）",
          "釣り手で相手の軸を崩す（上から押える）",
          "相手が踏ん張った瞬間に逆方向へ崩す",
          "膝を曲げ、自分の重心を低く保つ",
        ] },
        { header: "払い技の原則", bullets: [
          "タイミングは相手が体重を乗せた瞬間",
          "払いは足首〜膝下。膝上は危険",
          "手と足のタイミングを合わせる",
          "体ごと回転して投げに繋げる",
        ] },
        { header: "押さえ込みのポイント", bullets: [
          "重心を低く落として密着",
          "相手の腕を封じながら上体をコントロール",
          "横に逃げられないよう膝で挟む",
          "グラウンドへの移行は素早く",
        ] },
      ],
    },
    {
      // 新規追加セクション：中身は空。アプリの画面から追加していく
      tab: "grapple",
      type: "cards",
      title: "壁レスリングの攻防",
      items: [],
    },
    {
      tab: "grapple",
      type: "techniques",
      title: "使える技一覧",
      items: [
        { name: "ダブルレッグ", badgeLabel: "タックル", badgeColor: "yellow", point: "レベルチェンジ → 両膝の外に入る → ドライブ" },
        { name: "シングルレッグ", badgeLabel: "タックル", badgeColor: "yellow", point: "片足を抱えて外から回り込む or 内側へ崩す" },
        { name: "首投げ（オーバーフック）", badgeLabel: "投げ", badgeColor: "yellow", point: "クリンチから肩を差してオーバーフック。引いて回転" },
        { name: "内股", badgeLabel: "投げ", badgeColor: "yellow", point: "崩しと同時に膝を入れて相手の腿を引き上げる" },
        { name: "大外刈り", badgeLabel: "刈り", badgeColor: "yellow", point: "後ろに崩しながら後ろ足を刈る。前傾注意" },
        { name: "クリンチからのニーリフト", badgeLabel: "打撃連携", badgeColor: "red", point: "クリンチ状態で膝蹴り。MMAでは有効打として重要" },
      ],
    },
    {
      tab: "grapple",
      type: "warnings",
      title: "陥りやすいミス",
      color: "yellow",
      items: [
        { title: "MISTAKE 01 — 頭が下がりすぎる", text: "タックル時に頭が下に向きすぎると被弾リスク大。頭を相手の体の横につけ、斜め前を向く。" },
        { title: "MISTAKE 02 — 腰が引けたまま入る", text: "腰を引いたままタックルに入ると相手にギロチンを狙われる。前傾しながら腰を低く落として入る。" },
        { title: "MISTAKE 03 — 投げた後に追わない", text: "投げっぱなしでポジションを確保できない。相手をコントロールしながら投げ、すぐトップポジションを取る。" },
        { title: "MISTAKE 04 — クリンチで疲弊する", text: "クリンチで力任せに押し合うと体力を消耗する。ポジションと動きで優位を作る。引いて崩す。" },
      ],
    },

    // ---------- 寝技 ----------
    {
      tab: "ground",
      type: "cards",
      title: "各態勢からのエスケープ",
      badgeLabel: "DEFENSE",
      badgeColor: "blue",
      items: [
        { header: "マウントから", bullets: [
          "ブリッジ＆ロール：腰を大きく跳ね上げ横に倒す",
          "エルボーニーエスケープ：肘と膝を連動してスペース作り",
          "相手の体重が一方に乗った瞬間に動く",
          "慌てて腕を出さない（アームバー狙われる）",
        ] },
        { header: "バックマウントから", bullets: [
          "フックを外す：足首を絡めたフックを解除",
          "横に崩して半身になる（ハーフガード移行）",
          "首へのチョーク攻撃を防ぎながら動く",
          "腕を使いすぎない。体全体で逃げる",
        ] },
        { header: "サイドポジションから", bullets: [
          "インサイドポジションをキープ（肘を押し込む）",
          "相手の腕の下にスペースを作りガードへ",
          "ニーシールドで相手の体重を受け止める",
          "無理に起き上がらず、まず横を向く",
        ] },
        { header: "ガードポジションから", bullets: [
          "クローズドガード：脚でコントロールしながら動く",
          "相手の立ち上がりに合わせてスイープ",
          "ハイガードでチョーク・三角を狙う",
          "オープンガードへの移行タイミングを掴む",
        ] },
      ],
    },
    {
      tab: "ground",
      type: "warnings",
      title: "注意事項",
      color: "blue",
      items: [
        { title: "NOTE 01 — 体力温存", text: "グラウンドで焦って全力で動くと急激に疲弊する。深呼吸を意識し、動くタイミングを見極める。" },
        { title: "NOTE 02 — フレームを作る", text: "エスケープは腕でフレームを作り相手を押し離してから動く。密着したまま逃げようとしない。" },
        { title: "NOTE 03 — 首を守る", text: "常に顎を引き首を守る意識を持つ。チョークやギロチンは首が伸びた瞬間に決まる。" },
      ],
    },
    {
      tab: "ground",
      type: "combos",
      title: "基本的な攻め方",
      badgeLabel: "OFFENSE",
      badgeColor: "red",
      items: [
        { name: "ポジション → サブミッション", desc: "まず有利なポジションを取り、そこからサブミッションを狙う。ポジションなしで技を狙わない。", tags: ["基本原則"] },
        { name: "パウンド → 関節技", desc: "MMA特有の攻め。パウンドで相手が防御に意識を向けた隙にチョークやアームバーへ移行。", tags: ["MMA特有", "重要"] },
        { name: "スイープ → トップキープ", desc: "下からスイープしてトップポジションに逆転。トップを取ったらパスを急がず重心を安定させる。", tags: ["逆転"] },
      ],
    },
    {
      tab: "ground",
      type: "techniques",
      title: "使える技一覧",
      items: [
        { name: "リアネイキッドチョーク", badgeLabel: "絞め", badgeColor: "blue", point: "バックマウントから。腕を顎の下に深く差し込む" },
        { name: "ギロチンチョーク", badgeLabel: "絞め", badgeColor: "blue", point: "相手のタックル時に頭を抱えて絞める。腰を引かない" },
        { name: "三角絞め", badgeLabel: "絞め", badgeColor: "blue", point: "ガードから脚で三角を作る。膝を閉じて腰を浮かせる" },
        { name: "アームバー", badgeLabel: "関節", badgeColor: "red", point: "肘を伸ばして腰で押し上げる。肩を90度以上立てる" },
        { name: "キムラ", badgeLabel: "関節", badgeColor: "red", point: "サイドからorガードから肩関節を極める。素早く腕を取る" },
        { name: "アメリカーナ", badgeLabel: "関節", badgeColor: "red", point: "マウントorサイドから。手首を曲げながら肩を極める" },
        { name: "ヒールフック", badgeLabel: "関節", badgeColor: "red", point: "足首を抱えてかかとを捻る。膝への負荷大・注意" },
      ],
    },
  ];

  const insertAll = db.transaction((blocks) => {
    blocks.forEach((block, blockPosition) => {
      const info = insertBlock.run({
        tab: block.tab,
        type: block.type,
        title: block.title,
        color: block.color ?? null,
        badgeLabel: block.badgeLabel ?? null,
        badgeColor: block.badgeColor ?? null,
        position: blockPosition,
      });
      block.items.forEach((item, itemPosition) => {
        insertItem.run(info.lastInsertRowid, itemPosition, JSON.stringify(item));
      });
    });
  });

  insertAll(seedBlocks);
}

seedIfEmpty();
