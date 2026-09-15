import { registerSW } from 'virtual:pwa-register';

export function registerPwa(): void {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // 下次進來自動換新版,不打斷正在玩的人
    },
    onOfflineReady() {
      // 已經可以離線玩,不需要跳訊息
    }
  });
}
