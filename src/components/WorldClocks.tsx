import { useEffect, useMemo, useState } from 'react';
import { Clock, Settings2, Check, X, Plus } from 'lucide-react';

// Up to 3 world clocks in the sidebar. Each user picks their own countries;
// the choice is remembered per user in this browser.
// The dot shows if it's a good time to call there:
//   green 09:00–20:00 · amber 08:00–09:00 / 20:00–21:00 · grey night.

type Zone = { tz: string; label: string; code: string; group: string };

const ZONES: Zone[] = [
  // Europe
  { tz: 'Europe/Berlin', label: 'Germany', code: 'DE', group: 'Europe' },
  { tz: 'Europe/London', label: 'United Kingdom', code: 'UK', group: 'Europe' },
  { tz: 'Europe/Zurich', label: 'Switzerland', code: 'CH', group: 'Europe' },
  { tz: 'Europe/Vienna', label: 'Austria', code: 'AT', group: 'Europe' },
  { tz: 'Europe/Paris', label: 'France', code: 'FR', group: 'Europe' },
  { tz: 'Europe/Rome', label: 'Italy', code: 'IT', group: 'Europe' },
  { tz: 'Europe/Madrid', label: 'Spain', code: 'ES', group: 'Europe' },
  { tz: 'Europe/Lisbon', label: 'Portugal', code: 'PT', group: 'Europe' },
  { tz: 'Europe/Amsterdam', label: 'Netherlands', code: 'NL', group: 'Europe' },
  { tz: 'Europe/Brussels', label: 'Belgium', code: 'BE', group: 'Europe' },
  { tz: 'Europe/Luxembourg', label: 'Luxembourg', code: 'LU', group: 'Europe' },
  { tz: 'Europe/Dublin', label: 'Ireland', code: 'IE', group: 'Europe' },
  { tz: 'Europe/Copenhagen', label: 'Denmark', code: 'DK', group: 'Europe' },
  { tz: 'Europe/Stockholm', label: 'Sweden', code: 'SE', group: 'Europe' },
  { tz: 'Europe/Oslo', label: 'Norway', code: 'NO', group: 'Europe' },
  { tz: 'Europe/Helsinki', label: 'Finland', code: 'FI', group: 'Europe' },
  { tz: 'Europe/Warsaw', label: 'Poland', code: 'PL', group: 'Europe' },
  { tz: 'Europe/Prague', label: 'Czech Republic', code: 'CZ', group: 'Europe' },
  { tz: 'Europe/Bratislava', label: 'Slovakia', code: 'SK', group: 'Europe' },
  { tz: 'Europe/Budapest', label: 'Hungary', code: 'HU', group: 'Europe' },
  { tz: 'Europe/Ljubljana', label: 'Slovenia', code: 'SI', group: 'Europe' },
  { tz: 'Europe/Zagreb', label: 'Croatia', code: 'HR', group: 'Europe' },
  { tz: 'Europe/Belgrade', label: 'Serbia', code: 'RS', group: 'Europe' },
  { tz: 'Europe/Bucharest', label: 'Romania', code: 'RO', group: 'Europe' },
  { tz: 'Europe/Sofia', label: 'Bulgaria', code: 'BG', group: 'Europe' },
  { tz: 'Europe/Athens', label: 'Greece', code: 'GR', group: 'Europe' },
  { tz: 'Asia/Nicosia', label: 'Cyprus', code: 'CY', group: 'Europe' },
  { tz: 'Europe/Malta', label: 'Malta', code: 'MT', group: 'Europe' },
  { tz: 'Europe/Tallinn', label: 'Estonia', code: 'EE', group: 'Europe' },
  { tz: 'Europe/Riga', label: 'Latvia', code: 'LV', group: 'Europe' },
  { tz: 'Europe/Vilnius', label: 'Lithuania', code: 'LT', group: 'Europe' },
  { tz: 'Europe/Kyiv', label: 'Ukraine', code: 'UA', group: 'Europe' },
  { tz: 'Europe/Chisinau', label: 'Moldova', code: 'MD', group: 'Europe' },
  { tz: 'Europe/Moscow', label: 'Russia (Moscow)', code: 'RU', group: 'Europe' },
  { tz: 'Europe/Istanbul', label: 'Turkey', code: 'TR', group: 'Europe' },
  // Caucasus / Middle East
  { tz: 'Asia/Tbilisi', label: 'Georgia', code: 'GE', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Yerevan', label: 'Armenia', code: 'AM', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Baku', label: 'Azerbaijan', code: 'AZ', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Jerusalem', label: 'Israel', code: 'IL', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Dubai', label: 'United Arab Emirates', code: 'AE', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Riyadh', label: 'Saudi Arabia', code: 'SA', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Qatar', label: 'Qatar', code: 'QA', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Kuwait', label: 'Kuwait', code: 'KW', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Almaty', label: 'Kazakhstan', code: 'KZ', group: 'Caucasus & Middle East' },
  { tz: 'Asia/Tashkent', label: 'Uzbekistan', code: 'UZ', group: 'Caucasus & Middle East' },
  // Americas
  { tz: 'America/New_York', label: 'USA (New York)', code: 'US', group: 'Americas' },
  { tz: 'America/Chicago', label: 'USA (Chicago)', code: 'US', group: 'Americas' },
  { tz: 'America/Denver', label: 'USA (Denver)', code: 'US', group: 'Americas' },
  { tz: 'America/Los_Angeles', label: 'USA (Los Angeles)', code: 'US', group: 'Americas' },
  { tz: 'America/Toronto', label: 'Canada (Toronto)', code: 'CA', group: 'Americas' },
  { tz: 'America/Vancouver', label: 'Canada (Vancouver)', code: 'CA', group: 'Americas' },
  { tz: 'America/Mexico_City', label: 'Mexico', code: 'MX', group: 'Americas' },
  { tz: 'America/Sao_Paulo', label: 'Brazil', code: 'BR', group: 'Americas' },
  { tz: 'America/Argentina/Buenos_Aires', label: 'Argentina', code: 'AR', group: 'Americas' },
  { tz: 'America/Santiago', label: 'Chile', code: 'CL', group: 'Americas' },
  { tz: 'America/Bogota', label: 'Colombia', code: 'CO', group: 'Americas' },
  { tz: 'America/Lima', label: 'Peru', code: 'PE', group: 'Americas' },
  // Asia / Pacific
  { tz: 'Asia/Kolkata', label: 'India', code: 'IN', group: 'Asia & Pacific' },
  { tz: 'Asia/Bangkok', label: 'Thailand', code: 'TH', group: 'Asia & Pacific' },
  { tz: 'Asia/Ho_Chi_Minh', label: 'Vietnam', code: 'VN', group: 'Asia & Pacific' },
  { tz: 'Asia/Jakarta', label: 'Indonesia', code: 'ID', group: 'Asia & Pacific' },
  { tz: 'Asia/Kuala_Lumpur', label: 'Malaysia', code: 'MY', group: 'Asia & Pacific' },
  { tz: 'Asia/Singapore', label: 'Singapore', code: 'SG', group: 'Asia & Pacific' },
  { tz: 'Asia/Manila', label: 'Philippines', code: 'PH', group: 'Asia & Pacific' },
  { tz: 'Asia/Hong_Kong', label: 'Hong Kong', code: 'HK', group: 'Asia & Pacific' },
  { tz: 'Asia/Shanghai', label: 'China', code: 'CN', group: 'Asia & Pacific' },
  { tz: 'Asia/Seoul', label: 'South Korea', code: 'KR', group: 'Asia & Pacific' },
  { tz: 'Asia/Tokyo', label: 'Japan', code: 'JP', group: 'Asia & Pacific' },
  { tz: 'Australia/Perth', label: 'Australia (Perth)', code: 'AU', group: 'Asia & Pacific' },
  { tz: 'Australia/Sydney', label: 'Australia (Sydney)', code: 'AU', group: 'Asia & Pacific' },
  { tz: 'Pacific/Auckland', label: 'New Zealand', code: 'NZ', group: 'Asia & Pacific' },
  // Africa
  { tz: 'Africa/Johannesburg', label: 'South Africa', code: 'ZA', group: 'Africa' },
  { tz: 'Africa/Cairo', label: 'Egypt', code: 'EG', group: 'Africa' },
  { tz: 'Africa/Lagos', label: 'Nigeria', code: 'NG', group: 'Africa' },
  { tz: 'Africa/Nairobi', label: 'Kenya', code: 'KE', group: 'Africa' },
  { tz: 'Africa/Casablanca', label: 'Morocco', code: 'MA', group: 'Africa' }
];

const ZONE_BY_TZ = new Map(ZONES.map(z => [z.tz, z]));
const GROUPS = Array.from(new Set(ZONES.map(z => z.group)));
const DEFAULT_ZONES = ['Europe/Berlin', 'Europe/London'];
const MAX_CLOCKS = 3;

const storageKey = (userId: string) => `crmWorldClocks:${userId || 'anon'}`;

const loadZones = (userId: string): string[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === null) return DEFAULT_ZONES;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((tz: any) => ZONE_BY_TZ.has(tz)).slice(0, MAX_CLOCKS) : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
};

const saveZones = (userId: string, zones: string[]) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(zones));
  } catch {}
};

// Hour/minute/weekday of `date` in a time zone, and its UTC offset in minutes.
const partsIn = (date: Date, tz: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    const asUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), hour, minute);
    const offset = Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
    return { hour, minute, weekday: get('weekday'), offset };
  } catch {
    return null;
  }
};

const formatDiff = (minutes: number) => {
  if (minutes === 0) return 'same time';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}h`;
};

const callTone = (hour: number) => {
  if (hour >= 9 && hour < 20) return { dot: 'bg-emerald-400', title: 'Good time to call' };
  if (hour === 8 || hour === 20) return { dot: 'bg-amber-400', title: 'Early / late — call carefully' };
  return { dot: 'bg-slate-600', title: 'Night time there' };
};

export default function WorldClocks({ userId }: { userId: string }) {
  const [zones, setZones] = useState<string[]>(() => loadZones(userId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setZones(loadZones(userId));
  }, [userId]);

  useEffect(() => {
    // Refresh every 15 s (local clock only, no network).
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const localOffset = useMemo(() => -now.getTimezoneOffset(), [now]);

  const startEdit = () => {
    const filled = [...zones];
    while (filled.length < MAX_CLOCKS) filled.push('');
    setDraft(filled);
    setEditing(true);
  };

  const saveEdit = () => {
    const clean = draft.filter(Boolean).filter((tz, i, arr) => arr.indexOf(tz) === i).slice(0, MAX_CLOCKS);
    setZones(clean);
    saveZones(userId, clean);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">World clocks</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-white/5"
              title="Save"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {draft.map((tz, index) => (
          <select
            key={index}
            value={tz}
            onChange={(e) => {
              const next = [...draft];
              next[index] = e.target.value;
              setDraft(next);
            }}
            className="w-full bg-[#111827] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">— Clock {index + 1}: none —</option>
            {GROUPS.map(group => (
              <optgroup key={group} label={group}>
                {ZONES.filter(z => z.group === group).map(z => (
                  <option key={z.tz} value={z.tz}>{z.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        ))}
        <button
          type="button"
          onClick={saveEdit}
          className="w-full mt-1 px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          World clocks
        </p>
        <button
          type="button"
          onClick={startEdit}
          className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/5"
          title="Choose countries (up to 3)"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {zones.length === 0 ? (
        <button
          type="button"
          onClick={startEdit}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/20"
        >
          <Plus className="w-3.5 h-3.5" />
          Add up to 3 clocks
        </button>
      ) : (
        <div className="space-y-1.5">
          {zones.map(tz => {
            const zone = ZONE_BY_TZ.get(tz);
            const p = partsIn(now, tz);
            if (!zone || !p) return null;
            const tone = callTone(p.hour);
            return (
              <div key={tz} className="flex items-center gap-2.5">
                <span className="w-7 shrink-0 text-center text-[10px] font-bold text-slate-300 bg-white/5 rounded py-0.5">
                  {zone.code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-400 truncate" title={zone.label}>{zone.label}</p>
                  <p className="text-[10px] text-slate-600">
                    {p.weekday} · {formatDiff(p.offset - localOffset)}
                  </p>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} title={tone.title} />
                <span className="text-base font-semibold text-white tabular-nums tracking-tight">
                  {String(p.hour).padStart(2, '0')}:{String(p.minute).padStart(2, '0')}
                </span>
              </div>
            );
          })}
          {zones.length < MAX_CLOCKS && (
            <button
              type="button"
              onClick={startEdit}
              className="w-full flex items-center justify-center gap-1 pt-1 text-[10px] text-slate-500 hover:text-slate-300"
            >
              <Plus className="w-3 h-3" />
              Add clock
            </button>
          )}
        </div>
      )}
    </div>
  );
}
