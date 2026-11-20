import { useEffect, useState } from 'react';
import { X, Send, Loader2, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { auth } from '../firebase';

// Telegram notifications for Team Chat — Administrators & Managers only.
// The server (server.ts → /api/telegram/*) checks the role again.

type TelegramStatus = {
  configured: boolean;
  botUsername: string;
  webhookActive: boolean;
  isAdministrator: boolean;
  chats: Array<{ chatId: string; name: string; linkedAtMs?: number }>;
  onlyWhenOffline: boolean;
  enabled: boolean;
};

async function api(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.error || 'Request failed');
  return data;
}

export default function TelegramConnect({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waitingForStart, setWaitingForStart] = useState(false);

  const load = async () => {
    try {
      setError('');
      const data = await api('/api/telegram/status');
      setStatus(data);
      return data as TelegramStatus;
    } catch (err: any) {
      setError(err?.message || 'Could not load Telegram status');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // After "Connect", check every 3 s (up to 2 min) until the Telegram appears.
  useEffect(() => {
    if (!waitingForStart) return;
    const before = status?.chats.length || 0;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const data = await load();
      if ((data && data.chats.length > before) || Date.now() - started > 120000) {
        setWaitingForStart(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waitingForStart]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const data = await api('/api/telegram/link', 'POST', {});
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setWaitingForStart(true);
    });

  const ready = !!status?.configured && !!status?.webhookActive;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0F1C] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <Send className="w-4.5 h-4.5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Telegram notifications</h3>
              <p className="text-[11px] text-slate-400">Get Team Chat messages in Telegram</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : !status ? null : !status.configured ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100 space-y-1">
              <p className="font-semibold text-amber-300">The bot is not set up yet</p>
              <p>
                Administrator: create a bot with @BotFather in Telegram, add its token in Vercel → Settings →
                Environment Variables as <span className="font-mono">TELEGRAM_BOT_TOKEN</span>, redeploy, then open this window again.
              </p>
            </div>
          ) : !status.webhookActive ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100 space-y-2">
              <p className="font-semibold text-amber-300">
                Bot @{status.botUsername || '…'} found — it needs to be activated once.
              </p>
              {status.isAdministrator ? (
                <button
                  disabled={busy}
                  onClick={() => run(() => api('/api/telegram/setup', 'POST', {}))}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold disabled:opacity-50"
                >
                  {busy ? 'Activating…' : 'Activate bot'}
                </button>
              ) : (
                <p>Ask the Administrator to open this window and press “Activate bot”.</p>
              )}
            </div>
          ) : null}

          {status && ready && (
            <>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Connected Telegram accounts</p>
                {status.chats.length === 0 ? (
                  <p className="text-xs text-slate-400">None yet.</p>
                ) : (
                  status.chats.map((c) => (
                    <div key={c.chatId} className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-sm text-white flex-1 truncate">{c.name || 'Telegram'}</span>
                      <button
                        disabled={busy}
                        onClick={() => run(() => api('/api/telegram/unlink', 'POST', { chatId: c.chatId }))}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/5"
                        title="Disconnect"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={busy || waitingForStart}
                onClick={connect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold disabled:opacity-60"
              >
                {waitingForStart ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Press “Start” in Telegram…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {status.chats.length ? 'Connect another Telegram' : 'Connect Telegram'}
                  </>
                )}
              </button>

              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300 cursor-pointer">
                  <span>Send messages to Telegram</span>
                  <input
                    type="checkbox"
                    checked={status.enabled}
                    disabled={busy}
                    onChange={(e) => run(() => api('/api/telegram/settings', 'POST', { enabled: e.target.checked }))}
                    className="accent-sky-500 w-4 h-4"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300 cursor-pointer">
                  <span>
                    Only when I'm not in the CRM
                    <span className="block text-[11px] text-slate-500">No double notifications while you are online</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={status.onlyWhenOffline}
                    disabled={busy}
                    onChange={(e) => run(() => api('/api/telegram/settings', 'POST', { onlyWhenOffline: e.target.checked }))}
                    className="accent-sky-500 w-4 h-4"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Muted chats are not sent. In Telegram, send /stop to the bot to disconnect.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
