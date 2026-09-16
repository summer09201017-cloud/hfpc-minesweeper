import { describe, it, expect } from 'vitest';
import { BACKDROPS, svgUrl } from './scenery';

/**
 * 背景場景畫的測試,守的全是「壞掉也不會有人發現」的那一類:
 * CSS 裡的一層背景壞掉時,瀏覽器**不報錯、console 全乾淨**,只是那一層默默不見。
 * 太陽沒了、星星沒了,畫面還是一片漂亮的漸層 —— 沒有任何自動化訊號會亮紅燈。
 * 所以這裡是把 data URI 拆回來、當成 XML 自己驗一遍。
 */

/** 從一條 CSS background 值裡把所有 SVG data URI 解回原文。 */
function svgsOf(bg: string): string[] {
  const out: string[] = [];
  const re = /url\("data:image\/svg\+xml,([^"]*)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bg)) !== null) out.push(decodeURIComponent(m[1]));
  return out;
}

/** 極簡 XML 配對檢查:回傳錯誤訊息,沒問題回 null。 */
function xmlFault(doc: string): string | null {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^<>'"]|'[^']*'|"[^"]*")*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(doc)) !== null) {
    consumed += m[0].length;
    const [, close, tag, , selfClose] = m;
    if (close) {
      const top = stack.pop();
      if (top !== tag) return `</${tag}> 對不上 <${top ?? '(空)'}>`;
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length) return `這些標籤沒關:${stack.join(', ')}`;
  // 標籤以外只能是空白(場景畫裡沒有文字節點)
  const text = doc.replace(re, '').trim();
  if (text) return `標籤外面有殘留文字:${text.slice(0, 40)}`;
  if (consumed === 0) return '完全沒有標籤';
  return null;
}

const SCENES = BACKDROPS.filter((b) => b.bg !== null);

describe('背景 data URI 編碼', () => {
  it('# 一定要編碼成 %23(不編碼的話瀏覽器會把後面整段當網址片段切掉,整層無聲消失)', () => {
    const url = svgUrl("<svg xmlns='http://www.w3.org/2000/svg'><rect fill='#ff0000'/></svg>");
    expect(url).not.toMatch(/,[^"]*#/); // 逗號之後的 payload 裡不可以有裸的 #
    expect(url).toContain('%23ff0000');
  });

  it('< > & % 都編碼,雙引號換成單引號(url("…") 自己用雙引號包)', () => {
    const url = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>`);
    const payload = url.slice(url.indexOf(',') + 1, -2);
    expect(payload).not.toMatch(/[<>"]/);
    expect(decodeURIComponent(payload)).toContain("<rect width='1'/>");
  });

  it('解碼回來要和原文一樣(只差空白壓縮與引號)', () => {
    const src = "<svg xmlns='http://www.w3.org/2000/svg'>\n  <circle r='1' fill='#abc'/>\n</svg>";
    const payload = svgUrl(src);
    const decoded = decodeURIComponent(payload.slice(payload.indexOf(',') + 1, -2));
    expect(decoded).toBe("<svg xmlns='http://www.w3.org/2000/svg'><circle r='1' fill='#abc'/></svg>");
  });
});

describe('每一張場景畫本身是好的', () => {
  for (const b of SCENES) {
    const bg = b.bg as string;

    it(`${b.id}:每個 SVG 都是合法 XML、有 xmlns、標籤都關好`, () => {
      const svgs = svgsOf(bg);
      for (const s of svgs) {
        expect(s.startsWith('<svg '), `${b.id} 的某一層不是 <svg> 開頭`).toBe(true);
        expect(s.endsWith('</svg>'), `${b.id} 的某一層沒有 </svg> 收尾`).toBe(true);
        expect(s, `${b.id} 少了 xmlns,當背景圖用時整層不會顯示`).toContain(
          "xmlns='http://www.w3.org/2000/svg'"
        );
        expect(xmlFault(s), `${b.id} 的 SVG 壞了`).toBeNull();
      }
    });

    it(`${b.id}:每個 url(#id) 參照都找得到對應的 id(拼錯 = 漸層/遮罩靜靜失效)`, () => {
      for (const s of svgsOf(bg)) {
        const ids = new Set(Array.from(s.matchAll(/\sid='([^']+)'/g), (m) => m[1]));
        for (const m of s.matchAll(/url\(#([^)]+)\)/g)) {
          expect(ids.has(m[1]), `${b.id}:參照了不存在的 id「${m[1]}」`).toBe(true);
        }
      }
    });

    it(`${b.id}:每一層都寫明了 位置 / 大小(少寫的話會被瀏覽器拉成整個畫面)`, () => {
      // 圖層一律長成 url("…") <repeat> <pos> / <size>
      for (const m of bg.matchAll(/url\("data:image\/svg\+xml,[^"]*"\)([^,]*)/g)) {
        expect(m[1], `${b.id} 有一層沒寫 位置/大小`).toMatch(/\brepeat\b|\bno-repeat\b/);
        expect(m[1], `${b.id} 有一層沒寫 位置/大小`).toContain('/');
      }
    });

    it(`${b.id}:最後一層留了純色保底(某一層壞掉時不會露出白底)`, () => {
      const last = bg.split(/,(?![^(]*\))/).pop() as string;
      expect(last.trim(), `${b.id} 的最後一層沒有保底色`).toMatch(/#[0-9a-f]{3,8}\s*$/i);
    });

    it(`${b.id}:選單有預覽色(場景用 vmin 畫,直接塞進小按鈕會糊掉)`, () => {
      expect(b.swatch, `${b.id} 少了 swatch`).toBeTruthy();
      expect(b.note, `${b.id} 少了一句話說明`).toBeTruthy();
    });
  }
});

describe('場景內容真的有那些東西(不是一張漸層冒充)', () => {
  const find = (id: string): string => {
    const b = BACKDROPS.find((x) => x.id === id);
    if (!b || !b.bg) throw new Error(`找不到背景 ${id}`);
    return b.bg;
  };
  const art = (id: string): string => svgsOf(find(id)).join('\n');
  const layerCount = (id: string): number => svgsOf(find(id)).length;

  it('草原藍天:太陽、白雲三朵、彩虹七道、樹林、野花、飛鳥', () => {
    const bliss = art('bliss');
    expect(layerCount('bliss')).toBeGreaterThanOrEqual(8);
    // 彩虹:七道弧,每道一個 A 指令
    const arcs = bliss.match(/ A\d+ \d+ 0 0 1 /g) ?? [];
    expect(arcs.length).toBe(7);
    // 白雲三朵(每朵一個 rx='40' 那樣的主體橢圓)+ 樹冠
    expect((bliss.match(/<ellipse/g) ?? []).length).toBeGreaterThanOrEqual(12);
    // 野花:五瓣 × 四朵
    expect((bliss.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(24);
  });

  it('星空夜色:月亮(mask 挖出來的弦月)、星星一片、流星', () => {
    const night = art('night');
    expect(night).toContain('<mask');
    expect((night.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(30);
    expect(night).toContain('linearGradient'); // 流星的漸層尾巴
    expect(find('night')).toContain('rgba(190,210,255'); // 銀河那道薄霧
  });

  it('月夜森林:滿月、星星、松林、螢火蟲', () => {
    const moon = art('moonlit');
    expect((moon.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(40);
    expect((moon.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(9); // 九棵松
  });

  it('夕陽:落日、晚霞、歸鳥、山稜', () => {
    expect(layerCount('sunset')).toBeGreaterThanOrEqual(5);
    expect(art('sunset')).toContain('radialGradient');
  });

  it('素灰刻意保持乾淨 —— 只有顆粒,沒有任何景物(投影上課用)', () => {
    expect(layerCount('plain')).toBe(1);
    expect(art('plain')).toContain('<rect');
  });

  it('場景畫全部加起來不該把 bundle 撐爆(> 60KB 就該回頭看是不是塞了巨圖)', () => {
    const total = SCENES.reduce((n, b) => n + (b.bg as string).length, 0);
    expect(total).toBeLessThan(60_000);
  });
});
