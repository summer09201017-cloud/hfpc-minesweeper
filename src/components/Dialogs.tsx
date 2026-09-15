import { type ReactNode, useState } from 'react';
import { useGame } from '../store';
import { CUSTOM_LIMITS, type Difficulty, PRESETS } from '../game/types';
import { clampSpec } from '../game/board';
import { clearRecords, getStat, recordKey } from '../game/records';
import { BACKDROPS, THEMES } from '../theme';
import { TRACKS } from '../audio/bgm';

export function Dialog({
  title,
  onClose,
  children,
  actions
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="titlebar">
          <span className="titlebar-text">{title}</span>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          {actions}
          <button type="button" className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── 自訂盤

export function CustomDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const custom = useGame((s) => s.custom);
  const setCustom = useGame((s) => s.setCustom);
  const [w, setW] = useState(custom.width);
  const [h, setH] = useState(custom.height);
  const [m, setM] = useState(custom.mines);

  const preview = clampSpec({ width: w, height: h, mines: m });
  const changed =
    preview.width !== w || preview.height !== h || preview.mines !== m;

  return (
    <Dialog
      title="自訂盤面"
      onClose={onClose}
      actions={
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCustom({ width: w, height: h, mines: m });
            onClose();
          }}
        >
          開始
        </button>
      }
    >
      <div className="row">
        <label>
          寬
          <input
            type="number"
            value={w}
            min={CUSTOM_LIMITS.minWidth}
            max={CUSTOM_LIMITS.maxWidth}
            onChange={(e) => setW(Number(e.target.value))}
          />
        </label>
        <label>
          高
          <input
            type="number"
            value={h}
            min={CUSTOM_LIMITS.minHeight}
            max={CUSTOM_LIMITS.maxHeight}
            onChange={(e) => setH(Number(e.target.value))}
          />
        </label>
        <label>
          雷數
          <input
            type="number"
            value={m}
            min={1}
            onChange={(e) => setM(Number(e.target.value))}
          />
        </label>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-dim)' }}>
        範圍:寬 {CUSTOM_LIMITS.minWidth}–{CUSTOM_LIMITS.maxWidth}、高{' '}
        {CUSTOM_LIMITS.minHeight}–{CUSTOM_LIMITS.maxHeight};雷數最多留 9 格空位給首點保護。
      </p>
      {changed ? (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>
          ⚠ 超出範圍,實際會用 {preview.width}×{preview.height} / {preview.mines} 雷。
        </p>
      ) : null}
    </Dialog>
  );
}

// ───────────────────────────── 選項

export function OptionsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const firstClickRule = useGame((s) => s.firstClickRule);
  const noGuess = useGame((s) => s.noGuess);
  const marks = useGame((s) => s.marks);
  const sound = useGame((s) => s.sound);
  const flagMode = useGame((s) => s.flagMode);
  const cellSize = useGame((s) => s.cellSize);
  const theme = useGame((s) => s.theme);
  const backdrop = useGame((s) => s.backdrop);
  const music = useGame((s) => s.music);
  const musicTrack = useGame((s) => s.musicTrack);
  const patch = useGame((s) => s.patchSettings);

  return (
    <Dialog title="選項" onClose={onClose}>
      <h3>第一次點擊</h3>
      <label>
        <input
          type="radio"
          name="firstclick"
          checked={firstClickRule === 'opening'}
          onChange={() => patch({ firstClickRule: 'opening' })}
        />
        現代友善:保證開出一片
      </label>
      <div className="hint">一點就展開一大片,不會開局三下就死。手機與新手建議這個。</div>
      <label>
        <input
          type="radio"
          name="firstclick"
          checked={firstClickRule === 'safe'}
          onChange={() => patch({ firstClickRule: 'safe' })}
        />
        XP 原味:只保證不是雷
      </label>
      <div className="hint">
        完全照 winmine.exe:首點不會炸,但可能只開出一個「5」,還是要慢慢磨。
      </div>

      <h3 style={{ marginTop: 14 }}>盤面</h3>
      <label>
        <input type="checkbox" checked={noGuess} onChange={(e) => patch({ noGuess: e.target.checked })} />
        無猜盤面(保證整局不用賭)
      </label>
      <div className="hint">
        每一步都推得出來,不會遇到 50/50。關掉就是經典規則 —— 有時候真的只能猜。
        <br />
        ⚠ 搭配「XP 原味」首點時比較難生成,偶爾會來不及、退回一般盤面(畫面下方會註明)。
      </div>
      <label>
        <input type="checkbox" checked={marks} onChange={(e) => patch({ marks: e.target.checked })} />
        標記(?):右鍵循環 旗 → ? → 空白
      </label>

      <h3 style={{ marginTop: 14 }}>換皮(主題)</h3>
      <div className="swatches">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="swatch-btn"
            aria-pressed={theme === t.id}
            onClick={() => patch({ theme: t.id })}
            title={t.name}
          >
            <span className="swatch-chips" aria-hidden="true">
              {t.swatch.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            {t.name}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginLeft: 0 }}>
        每個主題都會整組換掉數字八色 —— 只換底色的話,深色皮上的「1」會直接看不見。
        投影上課建議用「高對比」。
      </div>

      <h3 style={{ marginTop: 14 }}>換背景</h3>
      <div className="swatches">
        {BACKDROPS.map((b) => (
          <button
            key={b.id}
            type="button"
            className="backdrop-btn"
            aria-pressed={backdrop === b.id}
            onClick={() => patch({ backdrop: b.id })}
            title={b.name}
            style={{ background: b.bg ?? 'var(--desk-bg)' }}
          >
            {b.name}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginLeft: 0 }}>
        背景和主題各選各的 —— 想要經典灰棋盤配夜空,或高對比棋盤配素色底,都行。
      </div>

      <h3 style={{ marginTop: 14 }}>背景音樂</h3>
      <label>
        <input
          type="checkbox"
          checked={music}
          onChange={(e) => patch({ music: e.target.checked })}
        />
        播放背景音樂
      </label>
      <div className="hint">
        和音效分開,可以只要音效不要音樂。三首都是原創、即時合成,沒有音檔也能離線播。
      </div>
      {music ? (
        <div className="row">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn"
              aria-pressed={musicTrack === t.id}
              style={
                musicTrack === t.id
                  ? { borderColor: 'var(--shadow) var(--light) var(--light) var(--shadow)', fontWeight: 700 }
                  : undefined
              }
              onClick={() => patch({ musicTrack: t.id })}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      <h3 style={{ marginTop: 14 }}>操作與顯示</h3>
      <label>
        <input
          type="checkbox"
          checked={flagMode}
          onChange={(e) => patch({ flagMode: e.target.checked })}
        />
        旗子模式(手機:點一下就插旗)
      </label>
      <div className="hint">關著的時候:點一下開格子、長按插旗。開著的時候剛好相反。</div>
      <label>
        <input type="checkbox" checked={sound} onChange={(e) => patch({ sound: e.target.checked })} />
        音效
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <span>格子大小</span>
        <button type="button" className="btn" onClick={() => patch({ cellSize: 0 })}>
          自動
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => patch({ cellSize: Math.max(16, (cellSize || 26) - 4) })}
        >
          − 縮小
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => patch({ cellSize: Math.min(56, (cellSize || 26) + 4) })}
        >
          ＋ 放大
        </button>
        <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
          {cellSize > 0 ? `${cellSize}px` : '自動'}
        </span>
      </div>
    </Dialog>
  );
}

// ───────────────────────────── 最佳成績

function fmtTime(sec: number | null): string {
  if (sec == null) return '—';
  return `${sec} 秒`;
}

export function RecordsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const records = useGame((s) => s.records);
  const custom = useGame((s) => s.custom);
  const refresh = useGame((s) => s.refreshRecords);

  const rows: Array<{ label: string; key: string }> = [];
  const names: Record<Exclude<Difficulty, 'custom'>, string> = {
    beginner: '初級',
    intermediate: '中級',
    expert: '高級'
  };
  for (const d of ['beginner', 'intermediate', 'expert'] as const) {
    rows.push({ label: `${names[d]}(無猜)`, key: recordKey(d, PRESETS[d], true) });
    rows.push({ label: `${names[d]}(一般)`, key: recordKey(d, PRESETS[d], false) });
  }
  rows.push({
    label: `自訂 ${custom.width}×${custom.height}/${custom.mines}(無猜)`,
    key: recordKey('custom', custom, true)
  });
  rows.push({
    label: `自訂 ${custom.width}×${custom.height}/${custom.mines}(一般)`,
    key: recordKey('custom', custom, false)
  });

  return (
    <Dialog
      title="最佳成績"
      onClose={onClose}
      actions={
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!window.confirm('清空所有個人紀錄?這個動作沒辦法復原。')) return;
            clearRecords();
            refresh();
          }}
        >
          清空紀錄
        </button>
      }
    >
      <table className="records-table">
        <thead>
          <tr>
            <th>難度</th>
            <th>最佳時間</th>
            <th>勝 / 場</th>
            <th>3BV/秒</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = getStat(records, r.key);
            return (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{fmtTime(st.best?.seconds ?? null)}</td>
                <td>
                  {st.wins} / {st.games}
                </td>
                <td>{st.bestBps > 0 ? st.bestBps.toFixed(2) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-dim)' }}>
        無猜盤明顯比一般盤好過,所以兩種分開記 —— 混在一起的話,一般盤的紀錄永遠破不了。
        <br />
        3BV = 這一盤「最少要點幾下」;3BV/秒 是速度,和最短時間不一定是同一局。
      </p>
    </Dialog>
  );
}

// ───────────────────────────── 玩法說明

export function HelpDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Dialog title="玩法說明" onClose={onClose}>
      <h3>目標</h3>
      <p style={{ margin: '0 0 10px' }}>
        把所有<b>沒有地雷</b>的格子翻開。數字代表它周圍八格裡有幾顆雷。
      </p>

      <h3>桌機</h3>
      <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
        <li>左鍵:翻開</li>
        <li>右鍵:插旗(開啟「標記(?)」後會循環 旗 → ? → 空白)</li>
        <li>
          <b>左右鍵同時按</b>(或中鍵):和弦展開 —— 數字周圍的旗數剛好等於數字時,
          一次翻開其餘鄰格。旗插錯了會炸,這是它的代價。
        </li>
        <li>F2:開新遊戲</li>
      </ul>

      <h3>手機</h3>
      <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
        <li>點一下:翻開</li>
        <li>長按:插旗(會震一下)</li>
        <li>在數字上點一下:和弦展開</li>
        <li>按 🚩 切成旗子模式,點與長按的作用對調</li>
      </ul>

      <h3>無猜盤面</h3>
      <p style={{ margin: '0 0 10px' }}>
        經典踩地雷會出現只能賭運氣的 50/50。打開「無猜盤面」之後,盤面是在你按下第一格之後
        才生成的,而且會一直重抽到抽出一盤<b>每一步都推得出來</b>的為止。
        偶爾來不及生成時,畫面下方會誠實標成「一般盤面」。
      </p>

      <h3>每日挑戰</h3>
      <p style={{ margin: 0 }}>
        網址加上 <code>?daily</code> 就是今天的題,全世界同一天拿到同一盤、同一個開場。
        <code>?seed=123456</code> 可以指定題號,老師報號給全班玩同一盤。
      </p>
    </Dialog>
  );
}
