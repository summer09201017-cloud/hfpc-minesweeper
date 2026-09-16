/**
 * 📲 安裝到主畫面。
 *
 * ★ 為什麼要自己做一顆按鈕:瀏覽器的安裝入口藏在「⋮ → 安裝應用程式」裡,
 *   教會的長輩與家長**不會去翻那個選單**。沒有按鈕 = 這個 App 事實上裝不了。
 *
 * ★ 三種平台走三條路,而且**只有 Android 那條是自動的**:
 *   · Android/桌機 Chrome:會發 `beforeinstallprompt` ⇒ 攔下來,按鈕按下去才 prompt()
 *   · iOS Safari:**永遠不發這個事件**(Apple 沒實作)⇒ 只能教他「分享 → 加入主畫面」
 *   · LINE/FB 內建瀏覽器:兩條都走不了 ⇒ 只能請他用外部瀏覽器開
 *   把三條混成一句「請安裝」的話,有兩種人會照著做卻什麼都沒發生。
 *
 * ★ 已經裝好的人不該再看到安裝提示 ⇒ 用 display-mode: standalone 判斷。
 *   ⚠ iOS 不支援那個 media query 的舊版本要看 `navigator.standalone`,兩個都查。
 */

export type InstallState =
  /** 瀏覽器已經說「可以裝」,按鈕按下去就會跳安裝視窗 */
  | 'ready'
  /** iOS:要教他自己從分享選單加 */
  | 'ios'
  /** App 內建瀏覽器:裝不了,要換瀏覽器 */
  | 'inapp'
  /** 已經裝好了(或正在已安裝的視窗裡跑) */
  | 'installed'
  /** 這個瀏覽器不支援,或還沒判定出來 */
  | 'none';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(s: InstallState) => void>();

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // 舊瀏覽器沒有 matchMedia
  }
  // iOS Safari 專屬旗標(標準的 display-mode 它較晚才支援)
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ 的 UA 長得像 Mac ⇒ 再看有沒有觸控點
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

function compute(inApp: boolean): InstallState {
  if (isStandalone()) return 'installed';
  if (deferred) return 'ready';
  if (inApp) return 'inapp';
  if (isIos()) return 'ios';
  return 'none';
}

let inAppFlag = false;

/** 開場呼叫一次。回傳解除監聽的函式。 */
export function watchInstall(
  inApp: boolean,
  onChange: (s: InstallState) => void
): () => void {
  inAppFlag = inApp;
  listeners.add(onChange);
  onChange(compute(inApp));

  const onPrompt = (e: Event): void => {
    // ★ 一定要 preventDefault:不擋的話 Chrome 自己跳它的迷你資訊列,
    //   我們的按鈕就永遠等不到這個事件(而且兩個入口同時出現很吵)。
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    for (const l of listeners) l(compute(inAppFlag));
  };
  const onInstalled = (): void => {
    deferred = null;
    for (const l of listeners) l('installed');
  };

  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/**
 * 按下安裝。回傳 true = 使用者答應了。
 * ⚠ `prompt()` 只能用一次;被拒絕之後這一次的事件就作廢,要等瀏覽器下次再發。
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    for (const l of listeners) l(compute(inAppFlag));
    return outcome === 'accepted';
  } catch {
    for (const l of listeners) l(compute(inAppFlag));
    return false;
  }
}

/**
 * 測試用:把模組層的暫存狀態清乾淨。正式程式不要呼叫。
 * ★ 存在的理由:`deferred` 與 `listeners` 是模組層的(一個分頁只有一組),
 *   測試連續跑好幾種平台時,上一個案例留下的事件會讓下一個案例誤判成 'ready' ——
 *   第一版測試就是這樣紅的,而且錯的是測試、不是程式。
 */
export function resetInstallForTests(): void {
  deferred = null;
  listeners.clear();
}

/** 使用者按過「不用了」就不再自動跳橫幅(選單裡仍然找得到)。 */
const DISMISS_KEY = 'ms.install.dismissed.v1';

export function isBannerDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false; // 無痕模式讀不到就當沒關過,頂多多看一次
  }
}

export function dismissBanner(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // 寫不進去不影響任何事
  }
}
