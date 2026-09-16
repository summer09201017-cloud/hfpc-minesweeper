import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { type Difficulty, PRESETS } from '../game/types';

interface Props {
  onCustom: () => void;
  onRecords: () => void;
  onHelp: () => void;
  onOptions: () => void;
  onInstall: () => void;
}

const DIFF_LABELS: Record<Exclude<Difficulty, 'custom'>, string> = {
  beginner: '初級',
  intermediate: '中級',
  expert: '高級'
};

export function MenuBar({ onCustom, onRecords, onHelp, onOptions, onInstall }: Props): JSX.Element {
  const [open, setOpen] = useState<'game' | 'help' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const difficulty = useGame((s) => s.difficulty);
  const marks = useGame((s) => s.marks);
  const noGuess = useGame((s) => s.noGuess);
  const sound = useGame((s) => s.sound);
  const challenge = useGame((s) => s.challenge);
  const newGame = useGame((s) => s.newGame);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const patchSettings = useGame((s) => s.patchSettings);

  // 點到別的地方就收起來(按 Esc 也是)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(null);
    fn();
  };

  // 每日挑戰 / 題號模式下難度是固定的,換難度會讓「同一題」失去意義
  const lockedDifficulty = challenge.kind !== 'free';

  return (
    <div className="menubar" ref={ref}>
      <button
        type="button"
        aria-expanded={open === 'game'}
        onClick={() => setOpen(open === 'game' ? null : 'game')}
      >
        遊戲
      </button>
      <button
        type="button"
        aria-expanded={open === 'help'}
        onClick={() => setOpen(open === 'help' ? null : 'help')}
      >
        說明
      </button>

      {open === 'game' ? (
        <div className="menu-popup" role="menu">
          <button type="button" className="menu-item" onClick={pick(newGame)}>
            <span className="check" />
            開新遊戲 <span style={{ marginLeft: 'auto', opacity: 0.6 }}>F2</span>
          </button>
          <div className="menu-sep" />
          {(Object.keys(DIFF_LABELS) as Array<Exclude<Difficulty, 'custom'>>).map((d) => (
            <button
              key={d}
              type="button"
              className="menu-item"
              disabled={lockedDifficulty}
              style={lockedDifficulty ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              onClick={pick(() => setDifficulty(d))}
            >
              <span className="check">{difficulty === d ? '●' : ''}</span>
              {DIFF_LABELS[d]}
              <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 11 }}>
                {PRESETS[d].width}×{PRESETS[d].height} / {PRESETS[d].mines}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="menu-item"
            disabled={lockedDifficulty}
            style={lockedDifficulty ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            onClick={pick(onCustom)}
          >
            <span className="check">{difficulty === 'custom' ? '●' : ''}</span>
            自訂…
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onClick={pick(() => patchSettings({ marks: !marks }))}
          >
            <span className="check">{marks ? '✔' : ''}</span>
            標記(?)
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={pick(() => patchSettings({ noGuess: !noGuess }))}
          >
            <span className="check">{noGuess ? '✔' : ''}</span>
            無猜盤面
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={pick(() => patchSettings({ sound: !sound }))}
          >
            <span className="check">{sound ? '✔' : ''}</span>
            音效
          </button>
          <button type="button" className="menu-item" onClick={pick(onOptions)}>
            <span className="check" />
            選項…
          </button>
          <div className="menu-sep" />
          <button type="button" className="menu-item" onClick={pick(onRecords)}>
            <span className="check" />
            最佳成績…
          </button>
        </div>
      ) : null}

      {open === 'help' ? (
        <div className="menu-popup" role="menu">
          <button type="button" className="menu-item" onClick={pick(onHelp)}>
            <span className="check" />
            玩法說明…
          </button>
          {/* ★ 安裝入口要有一個「永遠找得到」的位置:橫幅按過「不用了」之後,
              使用者仍然要能裝(而且多半是隔幾天才想裝)。 */}
          <button type="button" className="menu-item" onClick={pick(onInstall)}>
            <span className="check" />
            安裝到主畫面…
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={pick(() => {
              const fn = (window as unknown as { __openVersionSheet?: () => void })
                .__openVersionSheet;
              fn?.();
            })}
          >
            <span className="check" />
            改版簡歷…
          </button>
        </div>
      ) : null}
    </div>
  );
}
