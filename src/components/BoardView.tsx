import { memo, useCallback, useEffect, useRef } from 'react';
import { useGame } from '../store';
import { type Cell } from '../game/types';
import { FlagIcon, MineIcon, WrongFlagIcon } from './Glyphs';

const LONG_PRESS_MS = 400;
/** 手指按著微動一下不該取消長按;超過這個距離才算是在捲動 */
const MOVE_TOLERANCE = 12;

interface CellProps {
  cell: Cell;
  index: number;
  lost: boolean;
  hit: boolean;
}

const CellView = memo(function CellView({ cell, index, lost, hit }: CellProps) {
  const wrongFlag = lost && cell.state === 'flag' && !cell.mine;
  const showMine = cell.state === 'revealed' && cell.mine;
  const number = cell.state === 'revealed' && !cell.mine && cell.adj > 0 ? cell.adj : 0;

  return (
    <div
      className="cell"
      data-i={index}
      data-state={wrongFlag ? 'revealed' : cell.state}
      data-n={number || undefined}
      data-hit={hit || undefined}
      data-wrong={wrongFlag || undefined}
      role="gridcell"
      aria-label={cellLabel(cell, wrongFlag, showMine, number)}
    >
      {wrongFlag ? (
        <WrongFlagIcon />
      ) : showMine ? (
        <MineIcon />
      ) : cell.state === 'flag' ? (
        <FlagIcon />
      ) : cell.state === 'question' ? (
        '?'
      ) : number ? (
        number
      ) : null}
    </div>
  );
});

function cellLabel(cell: Cell, wrongFlag: boolean, showMine: boolean, number: number): string {
  if (wrongFlag) return '插錯的旗';
  if (showMine) return '地雷';
  if (cell.state === 'flag') return '旗子';
  if (cell.state === 'question') return '問號';
  if (cell.state === 'hidden') return '未開';
  return number ? `${number}` : '空格';
}

export function BoardView(): JSX.Element {
  const board = useGame((s) => s.board);
  const generating = useGame((s) => s.generating);
  const flagMode = useGame((s) => s.flagMode);
  const cellSizeSetting = useGame((s) => s.cellSize);
  const openCell = useGame((s) => s.openCell);
  const markCell = useGame((s) => s.markCell);
  const chordCell = useGame((s) => s.chordCell);
  const setPressing = useGame((s) => s.setPressing);

  // 格子大小交給 CSS 從 --app-w 與 --cols 算(見 xp.css 的 .board)。
  // ★ 這裡刻意**不用 JS 量容器**:.window / .game-outer 的寬度是被棋盤撐出來的,
  //   量它們等於量棋盤自己 —— 每量一次縮一點、自己追自己,而且第一幀會先寬出畫面
  //   再縮回來(橫向高級盤實測整頁溢出 57px)。只有玩家在「選項」裡指定大小時才寫死。

  // ── 輸入:滑鼠(左/右/雙鍵和弦)與觸控(點、長按、旗子模式)
  const state = useRef({
    left: false,
    right: false,
    chord: false,
    downIndex: -1,
    longFired: false,
    startX: 0,
    startY: 0,
    timer: 0 as number | ReturnType<typeof setTimeout>
  });

  const clearTimer = useCallback(() => {
    if (state.current.timer) {
      clearTimeout(state.current.timer as ReturnType<typeof setTimeout>);
      state.current.timer = 0;
    }
  }, []);

  const indexFrom = (e: React.PointerEvent): number => {
    const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
    if (!el) return -1;
    const n = Number(el.dataset.i);
    return Number.isFinite(n) ? n : -1;
  };

  const reset = useCallback(() => {
    const s = state.current;
    s.left = false;
    s.right = false;
    s.chord = false;
    s.downIndex = -1;
    s.longFired = false;
    clearTimer();
    setPressing(false);
  }, [clearTimer, setPressing]);

  const onPointerDown = (e: React.PointerEvent): void => {
    const i = indexFrom(e);
    if (i < 0) return;
    const s = state.current;
    s.downIndex = i;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.longFired = false;
    setPressing(true);

    if (e.pointerType === 'mouse') {
      if (e.button === 1) {
        // 中鍵 = 和弦(很多玩家的習慣)
        e.preventDefault();
        s.chord = true;
        return;
      }
      if (e.button === 0) s.left = true;
      if (e.button === 2) {
        s.right = true;
        // XP 是「右鍵按下」就插旗,不等放開
        if (!s.left) markCell(i);
      }
      if (s.left && s.right) s.chord = true;
      return;
    }

    // 觸控 / 手寫筆:長按 = 另一個動作(旗子模式下長按變成開格子)
    clearTimer();
    s.timer = setTimeout(() => {
      s.longFired = true;
      if (flagMode) openCell(i);
      else markCell(i);
      try {
        navigator.vibrate?.(25);
      } catch {
        // 不支援震動就算了
      }
      setPressing(false);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const s = state.current;
    if (!s.timer) return;
    if (
      Math.abs(e.clientX - s.startX) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - s.startY) > MOVE_TOLERANCE
    ) {
      // 在捲動棋盤,不是要長按
      clearTimer();
      s.downIndex = -1;
      setPressing(false);
    }
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    const s = state.current;
    const i = indexFrom(e);
    const same = i >= 0 && i === s.downIndex;

    if (e.pointerType === 'mouse') {
      const wasChord = s.chord;
      if (e.button === 0) s.left = false;
      if (e.button === 2) s.right = false;

      if (same) {
        if (wasChord) chordCell(i);
        else if (e.button === 0) openCell(i);
      }
      // 雙鍵和弦時,另一顆鍵放開不該再觸發一次
      if (wasChord) s.chord = s.left || s.right;
      setPressing(false);
      if (!s.left && !s.right) s.downIndex = -1;
      return;
    }

    clearTimer();
    setPressing(false);
    if (!same || s.longFired) {
      s.downIndex = -1;
      s.longFired = false;
      return;
    }
    s.downIndex = -1;

    const c = board.cells[i];
    if (flagMode) markCell(i);
    else if (c.state === 'revealed' && c.adj > 0) chordCell(i);
    else openCell(i);
  };

  useEffect(() => reset, [reset]);

  return (
    <div className="board-wrap">
      <div className="board-scroll">
        <div
          className="board"
          role="grid"
          aria-label="踩地雷棋盤"
          style={
            {
              '--cols': board.width,
              ...(cellSizeSetting > 0 ? { '--cell': `${cellSizeSetting}px` } : {})
            } as React.CSSProperties
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={reset}
          onPointerLeave={reset}
          onContextMenu={(e) => e.preventDefault()}
        >
          {board.cells.map((c, i) => (
            <CellView
              key={i}
              cell={c}
              index={i}
              lost={board.status === 'lost'}
              hit={board.hitIndex === i}
            />
          ))}
        </div>
      </div>
      {generating ? <div className="generating">🧠 正在生成無猜盤面…</div> : null}
    </div>
  );
}
