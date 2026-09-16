/**
 * 建置前把 dist/ 清乾淨。
 *
 * ⚠⚠ 為什麼不是一行 `fs.rmSync('dist', { recursive: true })` ——
 *   2026-09-16 在這台機器實測出來的雷:**Node 24 的 `fs.rm*` 只要「要刪的那條路徑含非 ASCII 字元」
 *   就會讓整個 node 進程硬當掉**(Windows 退出碼 0xC0000409 / -1073740791,
 *   沒有例外、沒有堆疊、沒有任何訊息)。這個 repo 現在住在 `…\Downloads\0916早\0916早\…`,
 *   路徑裡有「早」⇒ 每次 `vite build` 走到 `emptyOutDir`(它內部就是 fs.rm)就被打死,
 *   畫面只停在「✓ 67 modules transformed.」,看起來像卡住、不像壞掉。
 *
 *   實測對照(同一台機、同一個 node v24.13.0;判準是**解出來的目標路徑**,不是工作目錄):
 *     · 目標純 ASCII                              → 正常
 *     · 目標是含中文的**絕對路徑**(工作目錄純 ASCII)→ **當掉**
 *     · 工作目錄含中文 + 相對目標(解出來含中文)   → **當掉**;連刪單一檔案都當,不必遞迴
 *     · 同樣的路徑改用 `unlinkSync` + `rmdirSync`  → **都正常**
 *
 *   ⇒ 所以這裡改用 readdir + unlink + rmdir 自己遞迴。跨平台、零相依、不碰壞掉的那支 API。
 *   ⇒ 只要 build 前 dist 不存在,vite 的 emptyOutDir 就沒東西可刪,也就不會踩到。
 *
 * 🩹 真正的根治是**把 repo 搬到不含中文的路徑**;在那之前這支腳本讓建置活著。
 */

import { readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

function wipe(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return false; // 本來就沒有,正常
    throw e;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    // Dirent.isDirectory() 對 symlink 會回 false,這裡的 dist 不會有 symlink,夠用
    if (e.isDirectory()) wipe(p);
    else unlinkSync(p);
  }
  rmdirSync(dir);
  return true;
}

const target = process.argv[2] ?? 'dist';
const existed = wipe(target);
if (existed) {
  // 印出來,才不會有人以為 build 是從一個髒目錄開始的
  console.log(`🧹 清掉舊的 ${target}/`);
}

// 保險絲:確定真的沒了(留著半個 dist 比沒清還危險 —— 舊資產會被當成新版部署出去)
try {
  statSync(target);
  console.error(`✗ ${target}/ 沒清乾淨,停在這裡不要繼續建置`);
  process.exit(1);
} catch {
  /* 不存在 = 正常 */
}
