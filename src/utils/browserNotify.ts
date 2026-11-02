// Desktop (browser) notifications for the CRM.
// Shown only when the CRM tab is hidden / not focused, so people are not
// notified twice while they are already looking at the in-app toast.

const DISMISS_KEY = 'crmNotifyPromptDismissed';

export const browserNotificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

export const browserNotificationPermission = (): NotificationPermission | 'unsupported' =>
  browserNotificationsSupported() ? Notification.permission : 'unsupported';

export const requestBrowserNotificationPermission = async () => {
  if (!browserNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

export const isNotifyPromptDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

export const dismissNotifyPrompt = () => {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {}
};

export function notifyBrowser(options: {
  title: string;
  body?: string;
  tag?: string;
  // In-app path to open when the notification is clicked, e.g. /leads/abc
  path?: string;
  // Show even if the tab is visible (used for callback reminders).
  force?: boolean;
}) {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return;

  const tabActive = document.visibilityState === 'visible' && document.hasFocus();
  if (tabActive && !options.force) return;

  try {
    const notification = new Notification(options.title, {
      body: options.body || '',
      tag: options.tag,
      icon: '/chat-icon-192.png'
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {}
      if (options.path) {
        window.dispatchEvent(new CustomEvent('crm:navigate', { detail: { path: options.path } }));
      }
      notification.close();
    };
  } catch (err) {
    console.warn('Browser notification failed:', err);
  }
}

// Short two-tone chime made with Web Audio (no external sound file needed).
export function playChime() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    setTimeout(() => ctx.close?.().catch?.(() => {}), 1200);
  } catch {}
}
