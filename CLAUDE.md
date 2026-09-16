# CLAUDE.md — 踩地雷 Minesweeper(給接手的 AI 的規矩)

WinXP 原味踩地雷 PWA。**這份是規矩,不是說明書** —— 玩法看 `README.md`,待做看 `roadmap.md`,
接手步驟看 `讀我-HANDOFF.txt`。

## 現況(2026-09-16 晚,agape250 機・Opus 5・0916-hfpc-minesweeper 場)

- **線上**:https://hfpc-minesweeper.summer09201017.workers.dev(Cloudflare **Workers**,
  `npm run deploy` = build + `wrangler deploy`;repo 有 `wrangler.toml`,不必記參數)
- **版本 v6**(一天做到 v1 → v6;改版簡歷在 `index.html` 的 `APP_VERSIONS`,徽章文字由它帶出來)
  - v1 WinXP 原味復刻 + 無猜盤面 solver
  - v2 換皮 7 種 / 換背景 7 種 / 三首原創零音檔背景音樂
  - v3 背景升級成零美術檔的**向量場景畫**(草原太陽白雲彩虹樹花 / 星空弦月銀河流星 / 月夜森林 / 夕陽…)
  - v4 **教練層**:💡提示 / ↩悔一步 / ⌨全鍵盤 / 💥死因分析 / 🤖教學回放 + 放棄率統計
  - v5 **裝到手機主畫面**:PNG 圖示四張 + 站內安裝入口(三種平台三種說法)
  - v6 **⛶ 沉浸模式** + 手機版面用算的
- **驗收**:單元 **146**(9 個測試檔)、真瀏覽器 **119**(本機與線上各跑過)、離線 **7/7**
- **統計**:`minesweeper` 開頁 / `-start` 真的開局 / `-done` 通關 / `-lost-done` 踩雷 / `-quit-done` 中途放棄
  (+ `-dwell` 真實停留)⇒ **放棄率 = quit ÷ start**。play-stats worker 的 NAMES 已登記三個 id。
- **帳本**:大廳卡片、sites.json、作品集、play-stats NAMES 在 v1 上線時就登記過(v2~v6 是同一站改版,不必重登)

## 鐵則(踩過才寫的,不要繞過)

1. **經典優先,但誠實** —— 這款的賣點是 winmine.exe 原味(高級盤是 **30 寬×16 高**、和弦插錯旗會炸、
   數字八色一個都沒換)。**已知原版八色有四色對灰底不到 WCAG 3:1** —— 原味保留,
   另出「高對比(投影用)」主題,並用測試釘死「放行清單只給復刻主題」。
2. **推理引擎只能少推,絕不能推錯**(`src/game/solver.ts` 與 `src/game/coach.ts`)。
   提示、死因分析、教學回放三個功能共用同一支 solver ⇒ 教的跟做的永遠是同一件事。
   ★ 教練層**刻意不讀玩家插的旗**:旗子可能插錯,把錯的「已知雷」餵進去,推出來的「一定安全」就是假的。
3. **用過提示或悔一步的那一局不進紀錄**,而且記帳只做一次(踩雷記過帳之後復活,不可以再記第二次)。
4. **格子大小同時看寬度與高度**(`src/game/fit.ts` + CSS `--cell-fit`)。只看寬度的話,
   手機橫向會把棋盤放到比螢幕還高。**這條規則推論錯過兩次,兩次都是量了才知道** —— 測試釘死了。
5. **不要用 JS 量容器**:`.window` / `.game-outer` 的寬度是被棋盤撐出來的,量它等於自己追自己。
   量**視窗**可以(`index.html` 的 `--app-w` / `--app-h`),量容器不行。
6. **沉浸模式的工具列留在版面裡,不要浮動覆蓋層** —— 浮層會蓋住棋盤偷走觸控
   (量法:12×12 點陣逐點 `elementFromPoint`;本站四種狀態量到 0%)。
7. **任何「看起來對」的版面結論都要量**:`scripts/screen-budget.mjs` 會吐四個數字
   (主畫面面積 % / 殼佔高 % / 整頁幾個螢幕 / 觸控被接走 %)。

## 本機地雷(這台機才有,但很致命)

- ⚠⚠ **Node 24 的 `fs.rm*` 只要「要刪的那條路徑含非 ASCII」就會硬殺整個 node 進程**
  (Windows `0xC0000409`,零訊息、`try/catch` 接不到)。這個 repo 住在 `…\Downloads\0916早\…`
  ⇒ `vite build` 的 `emptyOutDir` 會被打死,畫面停在「✓ modules transformed.」像卡住。
  **已用 `scripts/clean-dist.mjs` 當 prebuild 繞開**(readdir + unlink + rmdir 自己遞迴)。
  根治是把 repo 搬到不含中文的路徑。細節見該檔檔頭與 skill `nonascii-path-trap`。
- ⚠ 同一個雷:**`npm run deploy` 部署成功但退出碼是 `0xC0000409`**(wrangler 收尾刪暫存目錄)。
  **判斷成敗看輸出有沒有 `Deployed … triggers` 與網址,不要看退出碼。**
- ⚠ 主控台是 cp950,python 腳本 `print` 中文會炸 ⇒ 加 `PYTHONIOENCODING=utf-8`。

## 一檔一責

| 檔 | 負責什麼 |
|---|---|
| `src/game/board.ts` | 盤面規則(開格/和弦/標記/勝負),純函式 |
| `src/game/generator.ts` | 佈雷 + 無猜盤面生成(第一格按下去之後才生) |
| `src/game/solver.ts` | 三層推理引擎(單格/子集/窮舉+全域雷數) |
| `src/game/coach.ts` | 教練層:提示 / 死因分析 / 教學回放(共用 solver) |
| `src/game/fit.ts` | 版面計算:格子大小、放不放得下、該給什麼建議 |
| `src/game/daily.ts` | 每日挑戰(日期→FNV→種子;**第一格也由種子決定**) |
| `src/game/records.ts` | 個人紀錄(無猜盤與一般盤分開記) |
| `src/store.ts` | 唯一的狀態來源(zustand);所有動作都經 `applyBoard` 收尾 |
| `src/install.ts` | 安裝到主畫面的平台判斷與 beforeinstallprompt |
| `src/theme.ts` / `src/scenery.ts` | 換皮八色 / 向量場景背景 |
| `scripts/verify-browser.mjs` | 真瀏覽器驗收(119 項;`BASE=` 可打線上) |
| `scripts/screen-budget.mjs` | 螢幕預算量尺(可對任何網址跑) |
| `scripts/clean-dist.mjs` | build 前清 dist(繞開上面那個 Node 雷) |

## 改動流程

```bash
npm test          # 單元 146
npm run build     # prebuild 會先清 dist
npm run preview   # port 4173
npm run verify    # 真瀏覽器 119(預設打 localhost:4173)
BASE=https://hfpc-minesweeper.summer09201017.workers.dev npm run verify   # 打線上
npm run check:offline
npm run deploy    # build + wrangler deploy(退出碼不可信,看輸出)
```

改了畫面 ⇒ **一定要真的開瀏覽器看**。這個 repo 一天之內被「測試全綠但畫面錯」咬過五次:
夕陽的太陽被視窗遮住、圖示變透明底、底部列排成兩列、驗收腳本點到雷、提示把游標帶到最右欄。
