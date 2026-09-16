import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type InstallState,
  dismissBanner,
  isBannerDismissed,
  isIos,
  isStandalone,
  promptInstall,
  resetInstallForTests,
  watchInstall
} from './install';

/**
 * 安裝流程的測試。這一塊特別值得測,因為它的失敗方式全都是沉默的:
 * 判斷錯平台 ⇒ iPhone 使用者看到一顆按了沒反應的「安裝」鈕,而畫面上不會有任何錯誤。
 */

/** 最小可用的 window / navigator 替身(測試跑在 node 環境,沒有 DOM)。 */
function fakeEnv(opts: {
  ua?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayModeStandalone?: boolean;
  storage?: boolean;
}): { fire: (type: string, ev?: Record<string, unknown>) => void; store: Map<string, string> } {
  const handlers = new Map<string, Array<(e: unknown) => void>>();
  const store = new Map<string, string>();

  const win = {
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      const list = handlers.get(t) ?? [];
      list.push(fn);
      handlers.set(t, list);
    },
    removeEventListener: (t: string, fn: (e: unknown) => void) => {
      handlers.set(t, (handlers.get(t) ?? []).filter((f) => f !== fn));
    },
    matchMedia: (q: string) => ({ matches: Boolean(opts.displayModeStandalone) && q.includes('standalone') }),
    localStorage: opts.storage === false
      ? {
          // Safari 無痕模式:讀寫都丟例外。程式不可以因此炸掉。
          getItem: () => { throw new Error('denied'); },
          setItem: () => { throw new Error('denied'); }
        }
      : {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v)
        }
  };

  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    userAgent: opts.ua ?? 'Mozilla/5.0 (Linux; Android 13) Chrome/126',
    maxTouchPoints: opts.maxTouchPoints ?? 0,
    standalone: opts.standalone
  });

  return {
    fire: (type, ev = {}) => {
      for (const fn of handlers.get(type) ?? []) fn({ type, preventDefault: () => {}, ...ev });
    },
    store
  };
}

afterEach(() => {
  resetInstallForTests();
  vi.unstubAllGlobals();
});

describe('平台判斷', () => {
  it('iPhone / iPad 認得出來', () => {
    fakeEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
    expect(isIos()).toBe(true);
  });

  it('iPadOS 13+ 的 UA 長得像 Mac,要靠觸控點數才分得出來', () => {
    // ★ 這是真的會漏掉的一種:只比對 iPad 字串的話,新版 iPad 會被當成桌機 Mac,
    //   然後它既收不到 beforeinstallprompt、也拿不到安裝說明 ⇒ 完全裝不了。
    fakeEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
  });

  it('真的桌機 Mac 不算 iOS', () => {
    fakeEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 0 });
    expect(isIos()).toBe(false);
  });

  it('Android Chrome 不算 iOS', () => {
    fakeEnv({});
    expect(isIos()).toBe(false);
  });
});

describe('已安裝判斷', () => {
  it('display-mode: standalone ⇒ 已安裝', () => {
    fakeEnv({ displayModeStandalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('iOS 的 navigator.standalone 也要認(舊 Safari 沒有 display-mode)', () => {
    fakeEnv({ ua: 'iPhone', standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('一般分頁 ⇒ 未安裝', () => {
    fakeEnv({});
    expect(isStandalone()).toBe(false);
  });
});

describe('安裝狀態', () => {
  it('Android:收到 beforeinstallprompt 才變成 ready', () => {
    const env = fakeEnv({});
    const seen: InstallState[] = [];
    const off = watchInstall(false, (s) => seen.push(s));
    expect(seen[0]).toBe('none'); // 還沒收到事件

    let prevented = false;
    env.fire('beforeinstallprompt', {
      preventDefault: () => {
        prevented = true;
      },
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' })
    });

    expect(prevented, '沒 preventDefault 的話 Chrome 會自己跳迷你資訊列,我們的按鈕就永遠等不到事件').toBe(true);
    expect(seen[seen.length - 1]).toBe('ready');
    off();
  });

  it('iOS:永遠等不到事件 ⇒ 直接給 ios(要教他用分享選單)', () => {
    fakeEnv({ ua: 'iPhone' });
    const seen: InstallState[] = [];
    const off = watchInstall(false, (s) => seen.push(s));
    expect(seen[0]).toBe('ios');
    off();
  });

  it('App 內建瀏覽器 ⇒ inapp(裝不了,只能請他換瀏覽器)', () => {
    fakeEnv({ ua: 'Mozilla/5.0 (Linux; Android 13) Line/14.0' });
    const seen: InstallState[] = [];
    const off = watchInstall(true, (s) => seen.push(s));
    expect(seen[0]).toBe('inapp');
    off();
  });

  it('已經裝好的視窗裡 ⇒ installed,不再叫他安裝', () => {
    fakeEnv({ displayModeStandalone: true });
    const seen: InstallState[] = [];
    const off = watchInstall(false, (s) => seen.push(s));
    expect(seen[0]).toBe('installed');
    off();
  });

  it('appinstalled 之後狀態轉成 installed', () => {
    const env = fakeEnv({});
    const seen: InstallState[] = [];
    const off = watchInstall(false, (s) => seen.push(s));
    env.fire('appinstalled');
    expect(seen[seen.length - 1]).toBe('installed');
    off();
  });

  it('沒有待處理的事件時 promptInstall 回 false,不會炸', async () => {
    fakeEnv({});
    await expect(promptInstall()).resolves.toBe(false);
  });
});

describe('橫幅關掉之後不再出現', () => {
  it('按過「不用了」會記住', () => {
    fakeEnv({});
    expect(isBannerDismissed()).toBe(false);
    dismissBanner();
    expect(isBannerDismissed()).toBe(true);
  });

  it('localStorage 不能用(無痕模式)也不可以炸,而且當成沒關過', () => {
    fakeEnv({ storage: false });
    expect(() => dismissBanner()).not.toThrow();
    expect(isBannerDismissed()).toBe(false);
  });
});
