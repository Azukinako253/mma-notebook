import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("メインの HTML が public にある", () => {
  const path = join(root, "public", "mma-notebook.html");
  const html = readFileSync(path, "utf8");
  assert.match(html, /MMA NOTEBOOK/);
});

test("ビルド後は dist に index がある", (t) => {
  const path = join(root, "dist", "index.html");
  if (!existsSync(path)) {
    t.skip("dist がまだ無いときはスキップ（`npm run build` 後は本番チェックとして実行される）");
    return;
  }
  const html = readFileSync(path, "utf8");
  assert.match(html, /mma-notebook\.html/);
});
