import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, Search, Monitor, Smartphone, Tablet, MapPin } from 'lucide-react';
import { auth } from '../firebase';

type SecurityLog = {
  id: string;
  eventType: string;
  userId: string;
  userName: string;
  email: string;
  role: string;
  teamId: string;
  teamName: string;
  ipAddress: string;
  countryCode: string;
  device: string;
  os: string;
  browser: string;
  createdAt: string | null;
};

const YEREVAN_TIME_ZONE = 'Asia/Yerevan';

function countryFlag(code: string) {
  const clean = (code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '🌐';
  return String.fromCodePoint(...[...clean].map(char => 127397 + char.charCodeAt(0)));
}

function formatYerevanTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: YEREVAN_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function DeviceIcon({ device }: { device: string }) {
  if (device === 'Mobile') return <Smartphone className="w-4 h-4 text-slate-400" />;
  if (device === 'Tablet') return <Tablet className="w-4 h-4 text-slate-400" />;
  return <Monitor className="w-4 h-4 text-slate-400" />;
}

export default function SecurityLogs() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user.');

      const token = await user.getIdToken();
      const response = await fetch('/api/security/logs?limit=500', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load security logs.');
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err: any) {
      console.error('Failed to load security logs:', err);
      setError(err?.message || 'Failed to load security logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;

    return logs.filter(log =>
      [
        log.userName,
        log.email,
        log.ipAddress,
        log.countryCode,
        log.device,
        log.os,
        log.browser,
        log.role
      ].some(value => String(value || '').toLowerCase().includes(q))
    );
  }, [logs, search]);

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">Security Logs</h1>
              <p className="text-sm text-slate-400 mt-1">
                Administrator-only immutable login history. Times are shown in Yerevan time.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, IP, country, OS..."
              className="w-72 max-w-[70vw] bg-[#0A0F1C] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Login Records</p>
          <p className="text-2xl font-semibold text-white mt-2">{logs.length}</p>
        </div>
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Unique Users</p>
          <p className="text-2xl font-semibold text-white mt-2">
            {new Set(logs.map(log => log.userId).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Timezone</p>
          <p className="text-lg font-semibold text-white mt-2">Asia/Yerevan</p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">User</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Login Time (Yerevan)</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">IP Address</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Country</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Device / System</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Browser</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-white">{log.userName || 'Unknown User'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{log.email || '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">{log.role || '—'}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300 whitespace-nowrap">
                    {formatYerevanTime(log.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <span className="font-mono text-sm text-blue-300">{log.ipAddress || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none">{countryFlag(log.countryCode)}</span>
                      <span className="text-sm text-slate-300">{log.countryCode || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <DeviceIcon device={log.device} />
                      <div>
                        <p className="text-sm text-slate-300">{log.device || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{log.os || 'Unknown'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">{log.browser || 'Unknown'}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                      Login
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    No security login records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-12 text-center text-slate-500">Loading security logs...</div>
        )}
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
        <p className="text-xs text-amber-300/80 leading-relaxed">
          Security records are read-only in the CRM. This page intentionally has no edit or delete controls.
        </p>
      </div>
    </div>
  );
}
