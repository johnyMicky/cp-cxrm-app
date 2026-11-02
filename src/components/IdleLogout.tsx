import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

// Signs the user out after 30 minutes without any activity.
// Activity is shared between all CRM tabs/windows (including the separate
// chat window) through localStorage, so working in one tab keeps all alive.
// A running Auto Dialer also counts as activity (Leads page marks it).

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const ACTIVITY_KEY = 'crmLastActivity';

export function markCrmActivity() {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {}
}

const readLastActivity = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY) || 0);
  } catch {
    return 0;
  }
};

export default function IdleLogout({ enabled }: { enabled: boolean }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    markCrmActivity();
    lastWriteRef.current = Date.now();

    const onActivity = () => {
      const now = Date.now();
      // Write at most every 10s to keep it cheap.
      if (now - lastWriteRef.current > 10000) {
        lastWriteRef.current = now;
        markCrmActivity();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') onActivity();
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);

    const check = async () => {
      if (loggingOutRef.current) return;
      const idleFor = Date.now() - readLastActivity();
      const remaining = IDLE_LIMIT_MS - idleFor;

      if (remaining <= 0) {
        loggingOutRef.current = true;
        try {
          await firestoreService.logout();
        } catch (err) {
          console.error('Idle logout failed:', err);
        }
        ['userId', 'userRole', 'userName', 'userAvatar', 'userTeamId', 'userTeamName'].forEach((key) => {
          try { localStorage.removeItem(key); } catch {}
        });
        window.location.href = '/login?reason=idle';
        return;
      }

      setSecondsLeft(remaining <= WARNING_MS ? Math.ceil(remaining / 1000) : null);
    };

    const interval = window.setInterval(check, 1000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity, { capture: true } as any));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [enabled]);

  if (!enabled || secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0A0F1C] p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <LogOut className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Are you still there?</h3>
        <p className="text-sm text-slate-400 mt-2">
          You will be signed out in <span className="font-semibold text-white tabular-nums">{secondsLeft}s</span> because of 30 minutes of inactivity.
        </p>
        <button
          type="button"
          onClick={() => {
            markCrmActivity();
            setSecondsLeft(null);
          }}
          className="mt-5 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
