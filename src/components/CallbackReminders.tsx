import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneCall, X, Clock3, BellRing } from 'lucide-react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import { notifyBrowser, playChime } from '../utils/browserNotify';

// "My callbacks today" button + reminder popups.
// Reminds 5 minutes before a callback and again when it is due.

const REMIND_BEFORE_MS = 5 * 60 * 1000;
const DUE_WINDOW_MS = 10 * 60 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;

type CallbackLead = { id: string; name: string; phone: string; at: Date };
type Reminder = { key: string; lead: CallbackLead; stage: 'soon' | 'due' };

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function CallbackReminders({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [callbacks, setCallbacks] = useState<CallbackLead[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const storageKey = `crmCallbackReminders:${userId}`;
  const callbacksRef = useRef<CallbackLead[]>([]);

  // ---- Load today's callbacks for this user (realtime) --------------------
  useEffect(() => {
    if (!userId) return;

    const dayStart = startOfToday();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const mapDocs = (docs: any[]) =>
      docs
        .map((d) => {
          const data = d.data() || {};
          const at = toDate(data.callbackAt);
          return at ? { id: d.id, name: String(data.name || 'Lead'), phone: String(data.phone || ''), at } : null;
        })
        .filter((l): l is CallbackLead => !!l && l.at >= dayStart && l.at < dayEnd)
        .sort((a, b) => a.at.getTime() - b.at.getTime());

    let fallbackUnsub: (() => void) | null = null;

    // Fast query (needs the composite index assigned_to + callbackAt).
    const unsub = onSnapshot(
      query(
        collection(db, 'leads'),
        where('assigned_to', '==', userId),
        where('callbackAt', '>=', Timestamp.fromDate(dayStart)),
        where('callbackAt', '<', Timestamp.fromDate(dayEnd))
      ),
      (snap) => setCallbacks(mapDocs(snap.docs)),
      (error) => {
        // Index not created yet: fall back to the user's own leads (the CRM
        // already listens to this exact query, so it adds no extra reads).
        console.warn('Callback index missing, using fallback query:', error?.message || error);
        if (fallbackUnsub) return;
        fallbackUnsub = onSnapshot(
          query(collection(db, 'leads'), where('assigned_to', '==', userId)),
          (snap) => setCallbacks(mapDocs(snap.docs)),
          (err) => console.error('Callback fallback listener failed:', err)
        );
      }
    );

    // Re-subscribe after midnight so "today" stays correct.
    const msToMidnight = dayEnd.getTime() - Date.now() + 1000;
    const midnightTimer = window.setTimeout(() => setNow(Date.now()), Math.max(1000, msToMidnight));

    return () => {
      unsub();
      if (fallbackUnsub) fallbackUnsub();
      window.clearTimeout(midnightTimer);
    };
  }, [userId, new Date(now).toDateString()]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // ---- Reminder engine ------------------------------------------------------
  const readState = (): Record<string, number> => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
      Object.keys(raw).forEach((k) => {
        if (Number(raw[k]) < cutoff) delete raw[k];
      });
      return raw;
    } catch {
      return {};
    }
  };

  const writeState = (state: Record<string, number>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  };

  useEffect(() => {
    if (!userId) return;

    const tick = () => {
      const current = Date.now();
      setNow(current);
      const state = readState();
      const fresh: Reminder[] = [];

      callbacksRef.current.forEach((lead) => {
        const at = lead.at.getTime();
        const base = `${lead.id}|${at}`;
        const snoozedUntil = Number(state[`${base}|snooze`] || 0);
        if (snoozedUntil > current) return;

        let stage: 'soon' | 'due' | null = null;
        if (current >= at && current < at + DUE_WINDOW_MS) stage = 'due';
        else if (current >= at - REMIND_BEFORE_MS && current < at) stage = 'soon';
        if (!stage) return;

        const key = `${base}|${stage}`;
        const shownAt = Number(state[key] || 0);
        const snoozeExpired = snoozedUntil > 0 && snoozedUntil <= current;

        // Show once per stage; after an expired snooze, show one more time.
        if (shownAt && !(snoozeExpired && shownAt < snoozedUntil)) return;

        if (snoozeExpired) delete state[`${base}|snooze`];
        state[key] = current;
        fresh.push({ key, lead, stage });
      });

      if (fresh.length === 0) return;
      writeState(state);

      setReminders((prev) => {
        const keys = new Set(prev.map((r) => r.key));
        return [...prev, ...fresh.filter((r) => !keys.has(r.key))];
      });

      playChime();
      fresh.forEach((r) => {
        notifyBrowser({
          title: r.stage === 'due' ? '📞 Callback now' : '⏰ Callback in 5 minutes',
          body: `${r.lead.name} · ${format(r.lead.at, 'HH:mm')}${r.lead.phone ? ` · ${r.lead.phone}` : ''}`,
          tag: r.key,
          path: `/leads/${r.lead.id}`,
          force: true
        });
      });
    };

    tick();
    const interval = window.setInterval(tick, 15000);
    return () => window.clearInterval(interval);
  }, [userId, callbacks]);

  const dismiss = (key: string) => setReminders((prev) => prev.filter((r) => r.key !== key));

  const snooze = (reminder: Reminder) => {
    const state = readState();
    state[`${reminder.lead.id}|${reminder.lead.at.getTime()}|snooze`] = Date.now() + SNOOZE_MS;
    writeState(state);
    dismiss(reminder.key);
  };

  const openLead = (leadId: string, key?: string) => {
    if (key) dismiss(key);
    setOpen(false);
    navigate(`/leads/${leadId}`);
  };

  // ---- Derived list ----------------------------------------------------------
  const upcomingCount = useMemo(
    () => callbacks.filter((c) => c.at.getTime() >= now - DUE_WINDOW_MS).length,
    [callbacks, now]
  );

  const relative = (at: Date) => {
    const diffMin = Math.round((at.getTime() - now) / 60000);
    if (diffMin > 59) return `in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    if (diffMin > 0) return `in ${diffMin} min`;
    if (diffMin === 0) return 'now';
    return `${Math.abs(diffMin)} min ago`;
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-violet-300 transition-colors relative"
          title="My callbacks today"
        >
          <PhoneCall className="w-5 h-5" />
          {upcomingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-violet-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0A0F1C]">
              {upcomingCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 mt-2 w-80 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">My callbacks today</h3>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                  {callbacks.length} scheduled · reminder 5 min before
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {callbacks.length > 0 ? (
                callbacks.map((c) => {
                  const past = c.at.getTime() < now - DUE_WINDOW_MS;
                  const soon = c.at.getTime() - now <= REMIND_BEFORE_MS && c.at.getTime() >= now - DUE_WINDOW_MS;
                  return (
                    <button
                      key={`${c.id}-${c.at.getTime()}`}
                      type="button"
                      onClick={() => openLead(c.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] text-left"
                    >
                      <span className="min-w-0">
                        <span className={`block text-sm truncate ${past ? 'text-slate-500' : 'text-white'}`}>{c.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{c.phone}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className={`block text-sm font-semibold tabular-nums ${soon ? 'text-violet-300' : past ? 'text-slate-500' : 'text-slate-200'}`}>
                          {format(c.at, 'HH:mm')}
                        </span>
                        <span className={`block text-[10px] ${soon ? 'text-violet-400' : 'text-slate-500'}`}>{relative(c.at)}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center">
                  <Clock3 className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No callbacks scheduled for today</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {reminders.length > 0 && (
        <div className="fixed right-6 bottom-6 z-[230] flex flex-col gap-3 w-[min(360px,calc(100vw-3rem))]">
          {reminders.map((r) => (
            <div
              key={r.key}
              className={`rounded-2xl border shadow-2xl shadow-black/40 bg-[#0F172A] overflow-hidden ${
                r.stage === 'due' ? 'border-violet-400/50' : 'border-violet-500/25'
              }`}
            >
              <div className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                  <BellRing className={`w-5 h-5 text-violet-300 ${r.stage === 'due' ? 'animate-bounce' : ''}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-violet-300">
                    {r.stage === 'due' ? 'Callback now' : 'Callback in 5 minutes'}
                  </p>
                  <p className="text-sm font-semibold text-white mt-1 truncate">{r.lead.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {format(r.lead.at, 'HH:mm')}{r.lead.phone ? ` · ${r.lead.phone}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => openLead(r.lead.id, r.key)}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                    >
                      Open lead
                    </button>
                    <button
                      type="button"
                      onClick={() => snooze(r)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium"
                    >
                      Snooze 5 min
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(r.key)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 shrink-0"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
