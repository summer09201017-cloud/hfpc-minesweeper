import { useCallback, useEffect, useRef, useState } from 'react';
import { UNDO_LIMIT, useGame, selectFace, selectMinesLeft } from './store';
import { BoardView } from './components/BoardView';
import { MenuBar } from './components/MenuBar';
import {
  CustomDialog,
  HelpDialog,
  OptionsDialog,
  RecordsDialog,
  ReplayDialog
} from './components/Dialogs';
import { FaceIcon, MineIcon, SevenSeg } from './components/Glyphs';
import { challengeLabel } from './game/daily';
import { unlockAudio } from './audio/sfx';
import { bgm } from './audio/bgm';
import { efficiency, formatPercent } from './game/metrics';

const LOBBY_URL = 'https://hfpc-bible-games.summer09201017.workers.dev/';

type DialogKind = 'custom' | 'records' | 'help' | 'options' | 'replay' | null;

/**
 * App 內建瀏覽器偵測(skill in-app-browser-guard)。
 *
 * ★ 為什麼非做不可:**教會的連結都走 LINE 發**。從 LINE 訊息點進來就是 LINE 自己的
 *   WebView,全螢幕在上面常常直接被拒絕 —— 而使用者在手機設定裡怎麼調都沒用。
 *   所以:①只提醒不擋(有時候拿得到)②只講「換瀏覽器」這一條 ③開場就講,
 *   不要等他按下去才發現沒反應。
 * ⚠ 不可以用 /line/i 比對 —— offline / Baseline / inline 都會誤中。
 */
function detectInApp(): { name: string; how: string } | null {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/\bLine\//i.test(ua) || /\bLIFF\b/i.test(ua))
    return { name: 'LINE', how: '右上角「⋯」→「用其他瀏覽器開啟」' };
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua))
    return { name: 'Facebook', how: '右上角「⋯」→「在外部瀏覽器中開啟」' };
  if (/Instagram/i.test(ua))
    return { name: 'Instagram', how: '右上角「⋯」→「在瀏覽器中開啟」' };
  if (/MicroMessenger/i.test(ua))
    return { name: '微信', how: '右上角「⋯」→「在瀏覽器中開啟」' };
  return null;
}

const IN_APP = detectInApp();

export default function App(): JSX.Element {
  const board = useGame((s) => s.board);
  const seconds = useGame((s) => s.seconds);
  const minesLeft = useGame(selectMinesLeft);
  const face = useGame(selectFace);
  const pressing = useGame((s) => s.pressing);
  const challenge = useGame((s) => s.challenge);
  const difficulty = useGame((s) => s.difficulty);
  const flagMode = useGame((s) => s.flagMode);
  const noGuessActual = useGame((s) => s.noGuessActual);
  const bbbv = useGame((s) => s.bbbv);
  const clicks = useGame((s) => s.clicks);
  const lastResult = useGame((s) => s.lastResult);
  const newGame = useGame((s) => s.newGame);
  const tick = useGame((s) => s.tick);
  const patchSettings = useGame((s) => s.patchSettings);
  const hint = useGame((s) => s.hint);
  const hintsUsed = useGame((s) => s.hintsUsed);
  const undosLeft = useGame((s) => s.undosLeft);
  const deathLesson = useGame((s) => s.deathLesson);
  const requestHint = useGame((s) => s.requestHint);
  const undo = useGame((s) => s.undo);

  const [dialog, setDialog] = useState<DialogKind>(null);
  // 鍵盤監聽器要知道「現在有沒有對話框開著」,但它不該因此每次重掛 ⇒ 用 ref 傳
  const dialogOpenRef = useRef(false);
  useEffect(() => {
    dialogOpenRef.current = dialog !== null;
  }, [dialog]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [fsNote, setFsNote] = useState<string | null>(null);
  const [inAppDismissed, setInAppDismissed] = useState(false);

  // 每日挑戰 / 題號:一進來就把種子指定的第一格點掉,全世界同一天同一個開場。
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (challenge.kind !== 'free') newGame();
  }, [challenge.kind, newGame]);

  // 計時器:XP 上限 999 秒
  useEffect(() => {
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [tick]);

  /**
   * ⌨ 鍵盤操作(整個遊戲只有這一個監聽器)。
   *
   * ★ 為什麼是全域一個、而不是掛在棋盤上:掛在棋盤上的話,使用者一進來要先想辦法
   *   「把焦點移到棋盤」才按得動 —— 純鍵盤使用者根本不知道要 Tab 幾次。
   * ★ 焦點在按鈕上時**不吃 Space / Enter**:那兩顆鍵本來就是「按下這顆按鈕」,
   *   搶走的話使用者會發現按鈕按不動(而且完全看不出原因)。
   * ★ 對話框開著時整組讓路,只留 Esc 給對話框自己處理。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      if (e.key === 'F2') {
        e.preventDefault();
        newGame();
        return;
      }
      if (dialogOpenRef.current) return;

      const g = useGame.getState();
      const onButton = document.activeElement?.tagName === 'BUTTON';
      const k = e.key;

      const move = (dx: number, dy: number): void => {
        e.preventDefault();
        g.moveCursor(dx, dy);
      };
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') return move(-1, 0);
      if (k === 'ArrowRight' || k === 'd' || k === 'D') return move(1, 0);
      if (k === 'ArrowUp' || k === 'w' || k === 'W') return move(0, -1);
      if (k === 'ArrowDown' || k === 's' || k === 'S') return move(0, 1);

      if (k === 'f' || k === 'F') {
        e.preventDefault();
        g.markCell(g.cursor);
        return;
      }
      if (k === 'h' || k === 'H' || k === '?') {
        e.preventDefault();
        g.requestHint();
        return;
      }
      if (k === 'u' || k === 'U') {
        e.preventDefault();
        g.undo();
        return;
      }
      if (k === 'Escape') {
        g.clearHint();
        return;
      }
      if (k === ' ' || k === 'Enter') {
        if (onButton) return; // 讓按鈕自己被按
        e.preventDefault();
        const c = g.board.cells[g.cursor];
        // 站在數字上按 Enter/Space = 和弦展開(等同滑鼠左右鍵同按)
        if (c && c.state === 'revealed' && c.adj > 0) g.chordCell(g.cursor);
        else g.openCell(g.cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newGame]);

  useEffect(() => {
    const onFs = (): void => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const check = (): void => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // ⛶ 全螢幕(game-must-haves)。iOS Safari 沒有 Element.requestFullscreen ⇒ 藏起來,
  //    不要放一顆按了沒反應的鈕。
  const fullscreenSupported =
    typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);

  // ★ 失敗一定要講出來,不可以靜默:LINE/FB 的 WebView 常直接拒絕,
  //   使用者會以為是按鈕壞了,然後跑去手機設定裡亂調(那裡根本沒有這個開關)。
  const toggleFullscreen = useCallback(() => {
    const fail = (): void =>
      setFsNote(
        IN_APP
          ? `${IN_APP.name} 的內建瀏覽器不給全螢幕 —— ${IN_APP.how}`
          : '這個瀏覽器不給全螢幕,可以用「選項」把格子調大。'
      );
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }
      const p = document.documentElement.requestFullscreen();
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch {
      fail();
    }
  }, []);

  // ← 返回大廳:玩到一半先問一次,不然誤觸就整局沒了
  const backToLobby = useCallback(() => {
    const playing = useGame.getState().board.status === 'playing';
    if (playing && !window.confirm('離開回大廳?這一局不會保留。')) return;
    // 走之前把「這局放棄了」記進統計 —— 不記的話,分母永遠只算得到玩完的人
    useGame.getState().abandonGame();
    window.location.href = LOBBY_URL;
  }, []);

  const canUndo = useGame((s) => s.history.length > 0);
  const label = challengeLabel(challenge);
  const wideBoard = board.width >= 24;
  const eff = lastResult ? lastResult.efficiency : efficiency(bbbv, clicks);

  // 音訊要等第一個使用者手勢才解得開(瀏覽器自動播放政策)。
  // ★ 音樂不能在這裡無條件 play():使用者關掉音樂之後,每點一下畫面都會把它打開。
  const startAudio = useCallback(() => {
    unlockAudio();
    const { music, musicTrack } = useGame.getState();
    if (music && !bgm.isPlaying()) bgm.play(musicTrack);
  }, []);

  return (
    <div onPointerDownCapture={startAudio} onKeyDownCapture={startAudio}>
      <div className="topbar">
        <button type="button" className="topbar-btn" onClick={backToLobby} title="返回大廳">
          ← 大廳
        </button>
        <span className="topbar-title">{label ?? '踩地雷 Minesweeper'}</span>
        {fullscreenSupported ? (
          <button
            type="button"
            className="topbar-btn"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? '離開全螢幕' : '全螢幕'}
          >
            {isFullscreen ? '⛶ 離開' : '⛶'}
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {IN_APP && !inAppDismissed ? (
        <div className="rotate-hint">
          ℹ️ 你正在 <b>{IN_APP.name}</b> 的內建瀏覽器裡玩。全螢幕與「安裝到主畫面」在這裡
          常常沒反應 —— {IN_APP.how}。
          <button
            type="button"
            className="topbar-btn"
            style={{ marginLeft: 8, minHeight: 32 }}
            onClick={() => setInAppDismissed(true)}
          >
            知道了
          </button>
        </div>
      ) : null}

      {fsNote ? (
        <div className="rotate-hint">
          ⛶ {fsNote}
          <button
            type="button"
            className="topbar-btn"
            style={{ marginLeft: 8, minHeight: 32 }}
            onClick={() => setFsNote(null)}
          >
            知道了
          </button>
        </div>
      ) : null}

      {portrait && wideBoard ? (
        <div className="rotate-hint">
          📱 高級盤有 30 欄,直向會需要左右捲動 —— <b>把手機轉成橫向</b>比較好玩,
          或在「選項」裡把格子調小。
        </div>
      ) : null}

      <div className="window">
        <div className="titlebar">
          <span style={{ width: 16, height: 16, display: 'grid', placeItems: 'center' }}>
            <MineIcon />
          </span>
          <span className="titlebar-text">踩地雷</span>
        </div>

        <MenuBar
          onCustom={() => setDialog('custom')}
          onRecords={() => setDialog('records')}
          onHelp={() => setDialog('help')}
          onOptions={() => setDialog('options')}
        />

        <div className="game-outer">
          <div className="panel">
            <SevenSeg value={minesLeft} label="剩餘雷數" />
            <button
              type="button"
              className="face-btn"
              data-pressed={pressing || undefined}
              onClick={newGame}
              title="開新遊戲(F2)"
              aria-label="開新遊戲"
            >
              <FaceIcon kind={face} />
            </button>
            <SevenSeg value={seconds} label="經過秒數" />
          </div>
          <BoardView />
        </div>

        <div className="statusbar">
          <span>
            <b>{difficultyLabel(difficulty)}</b> {board.width}×{board.height} / {board.mines} 雷
          </span>
          {noGuessActual === true ? (
            <span className="badge-noguess">✅ 無猜盤面:整局都推得出來</span>
          ) : noGuessActual === false ? (
            <span className="badge-guess">⚠ 一般盤面:可能需要猜</span>
          ) : null}
          {bbbv > 0 ? (
            <span>
              3BV <b>{bbbv}</b>
              {/* 效率只在結算時才有意義:開局一下開出一大片會印出「效率 1400%」,
                  數字沒錯,但玩到一半看到會以為程式壞了。 */}
              {lastResult ? <> ・效率 {formatPercent(eff)}</> : null}
            </span>
          ) : null}
          {hintsUsed > 0 || undosLeft < UNDO_LIMIT ? (
            <span className="badge-guess" title="用過輔助的局不計入最佳成績,不然紀錄表會被灌水">
              🧑‍🏫 輔助 {hintsUsed > 0 ? `提示×${hintsUsed}` : ''}
              {hintsUsed > 0 && undosLeft < UNDO_LIMIT ? '・' : ''}
              {undosLeft < UNDO_LIMIT ? `悔${UNDO_LIMIT - undosLeft}步` : ''}・不計紀錄
            </span>
          ) : null}
          {lastResult ? (
            <span style={{ marginLeft: 'auto' }}>
              {lastResult.won
                ? `🎉 通關 ${lastResult.seconds} 秒${lastResult.beatenTime ? '(新紀錄!)' : ''}`
                : '💥 踩到雷了'}
            </span>
          ) : null}
        </div>
      </div>

      {/* 💡 提示 / 💥 死因分析:同一條訊息列,一次只會有一個 */}
      {hint && hint.text ? (
        <div className={`coach coach-${hint.kind}`} role="status">
          {hint.kind === 'safe' ? '💡 ' : hint.kind === 'mine' ? '🚩 ' : 'ℹ️ '}
          {hint.text}
        </div>
      ) : null}
      {deathLesson ? (
        <div className={`coach coach-${deathLesson.kind}`} role="status">
          {deathLesson.kind === 'pure-guess' ? '🍀 ' : '📘 '}
          {deathLesson.text}
          {board.status === 'lost' && undosLeft > 0 ? (
            <button
              type="button"
              className="topbar-btn"
              style={{ marginLeft: 8, minHeight: 34 }}
              onClick={undo}
            >
              ↩ 復活(還有 {undosLeft} 次)
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mobile-bar">
        <button
          type="button"
          aria-pressed={flagMode}
          onClick={() => patchSettings({ flagMode: !flagMode })}
          title={flagMode ? '目前:點一下插旗(長按開格)' : '目前:點一下開格(長按插旗)'}
        >
          {flagMode ? '🚩 插旗模式' : '⛏ 挖掘模式'}
        </button>
        <button
          type="button"
          onClick={requestHint}
          disabled={board.status !== 'playing'}
          title="提示(H):推理引擎會指一格確定的給你"
        >
          💡 提示
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={undosLeft <= 0 || !canUndo}
          title="悔一步(U):一局三次,用過這局不進紀錄"
        >
          ↩ 悔一步 {undosLeft}
        </button>
        {board.placed && board.status !== 'ready' ? (
          <button
            type="button"
            onClick={() => setDialog('replay')}
            title="教學回放:這盤本來可以怎麼一步一步推出來"
          >
            🤖 教學回放
          </button>
        ) : null}
        <button type="button" onClick={newGame} title="開新遊戲">
          🙂 新局
        </button>
        <button type="button" onClick={() => setDialog('help')} title="玩法說明">
          ？說明
        </button>
      </div>

      {dialog === 'custom' ? <CustomDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'records' ? <RecordsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'help' ? <HelpDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'options' ? <OptionsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'replay' ? <ReplayDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function difficultyLabel(d: string): string {
  if (d === 'beginner') return '初級';
  if (d === 'intermediate') return '中級';
  if (d === 'expert') return '高級';
  return '自訂';
}
