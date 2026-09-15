import { memo } from 'react';

/**
 * 全部用 SVG 畫,零圖檔。
 * ★ 不用 emoji:emoji 在 Windows / Android / iOS 上長得完全不一樣,
 *   而「地雷長什麼樣、旗子長什麼樣」正是這款遊戲的招牌 —— 不能交給平台字型決定。
 */

export const MineIcon = memo(function MineIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g stroke="#000" strokeWidth="2.6" strokeLinecap="round">
        <line x1="16" y1="4" x2="16" y2="28" />
        <line x1="4" y1="16" x2="28" y2="16" />
        <line x1="7.5" y1="7.5" x2="24.5" y2="24.5" />
        <line x1="24.5" y1="7.5" x2="7.5" y2="24.5" />
      </g>
      <circle cx="16" cy="16" r="8" fill="#000" />
      <rect x="11.5" y="11.5" width="3.4" height="3.4" fill="#fff" />
    </svg>
  );
});

export const FlagIcon = memo(function FlagIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="15,5 15,15 6,10" fill="#ff0000" />
      <rect x="14.3" y="5" width="2" height="18" fill="#000" />
      <rect x="10" y="23" width="11" height="2.6" fill="#000" />
      <rect x="7.5" y="25.6" width="16" height="3" fill="#000" />
    </svg>
  );
});

/** 插錯的旗:XP 在失敗畫面上把它畫成「被劃掉的地雷」。 */
export const WrongFlagIcon = memo(function WrongFlagIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g stroke="#000" strokeWidth="2.6" strokeLinecap="round">
        <line x1="16" y1="4" x2="16" y2="28" />
        <line x1="4" y1="16" x2="28" y2="16" />
        <line x1="7.5" y1="7.5" x2="24.5" y2="24.5" />
        <line x1="24.5" y1="7.5" x2="7.5" y2="24.5" />
      </g>
      <circle cx="16" cy="16" r="8" fill="#000" />
      <rect x="11.5" y="11.5" width="3.4" height="3.4" fill="#fff" />
      <g stroke="#ff0000" strokeWidth="3.4" strokeLinecap="round">
        <line x1="5" y1="5" x2="27" y2="27" />
        <line x1="27" y1="5" x2="5" y2="27" />
      </g>
    </svg>
  );
});

export type FaceKind = 'smile' | 'oh' | 'cool' | 'dead';

export const FaceIcon = memo(function FaceIcon({ kind }: { kind: FaceKind }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#ffff00" stroke="#000" strokeWidth="1.6" />
      {kind === 'cool' ? (
        <>
          {/* 墨鏡 */}
          <path d="M5 12h22v2.4H5z" fill="#000" />
          <path d="M7 13.5h8.2v5.2c0 1-.9 1.6-2.2 1.6H9.6c-1.6 0-2.6-1-2.6-2.4z" fill="#000" />
          <path d="M16.8 13.5H25v4.4c0 1.4-1 2.4-2.6 2.4h-3.4c-1.3 0-2.2-.6-2.2-1.6z" fill="#000" />
          <path d="M10 23.5c1.6 1.6 4.4 1.6 6 0" stroke="#000" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : kind === 'dead' ? (
        <>
          <g stroke="#000" strokeWidth="1.9" strokeLinecap="round">
            <line x1="8" y1="10" x2="13" y2="15" />
            <line x1="13" y1="10" x2="8" y2="15" />
            <line x1="19" y1="10" x2="24" y2="15" />
            <line x1="24" y1="10" x2="19" y2="15" />
          </g>
          <ellipse cx="16" cy="23" rx="4" ry="3.2" fill="#000" />
        </>
      ) : (
        <>
          <circle cx="11.5" cy="13" r="1.9" fill="#000" />
          <circle cx="20.5" cy="13" r="1.9" fill="#000" />
          {kind === 'oh' ? (
            <circle cx="16" cy="22" r="3.4" fill="none" stroke="#000" strokeWidth="1.9" />
          ) : (
            <path
              d="M9.5 20.5c1.8 3.4 11.2 3.4 13 0"
              stroke="#000"
              strokeWidth="1.9"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
});

// ───────────────────────────── 七段顯示器

/** 七段:a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中。 */
const SEGMENTS: Record<string, string> = {
  a: '5,2 19,2 15.5,5.6 8.5,5.6',
  b: '21,3.6 17.4,7.2 17.4,18.4 21,21.4',
  c: '21,22.6 17.4,25.6 17.4,36.8 21,40.4',
  d: '5,42 19,42 15.5,38.4 8.5,38.4',
  e: '3,22.6 6.6,25.6 6.6,36.8 3,40.4',
  f: '3,3.6 6.6,7.2 6.6,18.4 3,21.4',
  g: '4,22 7.6,18.6 16.4,18.6 20,22 16.4,25.4 7.6,25.4'
};

const DIGIT_SEGS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': ''
};

export const SegDigit = memo(function SegDigit({ char }: { char: string }) {
  const on = DIGIT_SEGS[char] ?? '';
  return (
    <svg viewBox="0 0 24 44" aria-hidden="true">
      {Object.keys(SEGMENTS).map((k) => (
        <polygon
          key={k}
          points={SEGMENTS[k]}
          fill={on.includes(k) ? 'var(--seg-on)' : 'var(--seg-off)'}
        />
      ))}
    </svg>
  );
});

/**
 * 三位數的顯示器。
 * ★ XP 的剩餘雷數可以是負數(旗插超過雷數),這時左邊那位顯示 `-`。
 *   直接 padStart 會變成 `0-5` 這種怪東西 —— 負數要自己處理。
 */
export function segChars(value: number, width = 3): string[] {
  const clamped = Math.max(-(10 ** (width - 1) - 1), Math.min(10 ** width - 1, Math.trunc(value)));
  if (clamped < 0) {
    const body = String(-clamped).padStart(width - 1, '0');
    return ['-', ...body.split('')];
  }
  return String(clamped).padStart(width, '0').split('');
}

export const SevenSeg = memo(function SevenSeg({
  value,
  label
}: {
  value: number;
  label: string;
}) {
  const chars = segChars(value);
  return (
    <div className="seg" role="img" aria-label={`${label} ${value}`}>
      {chars.map((c, i) => (
        <SegDigit key={i} char={c} />
      ))}
    </div>
  );
});
