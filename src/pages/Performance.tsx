import { useEffect, useMemo, useState } from 'react';
import {
  Trophy,
  PhoneCall,
  UserRoundCheck,
  Flame,
  Target,
  CalendarDays,
  Clock3,
  RefreshCw,
  ChevronDown,
  TrendingUp
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom';
type RankKey = 'called' | 'answered' | 'answerRate' | 'High Potential' | 'JOR' | 'Deposit';

const YEREVAN_OFFSET_MS = 4 * 60 * 60 * 1000;

const yerevanParts = (value = new Date()) => {
  const shifted = new Date(value.getTime() + YEREVAN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
};

const yerevanLocalToUtc = (
  year: number,
  monthIndex: number,
  day: number,
  hours = 0,
  minutes = 0
) =>
  new Date(
    Date.UTC(year, monthIndex, day, hours, minutes, 0, 0) - YEREVAN_OFFSET_MS
  );

const formatInputYerevan = (date: Date) => {
  const p = yerevanParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hours).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}`;
};

const parseYerevanInput = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return yerevanLocalToUtc(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
};

const getPeriodBounds = (period: PeriodKey, customFrom: string, customTo: string) => {
  const now = new Date();
  const p = yerevanParts(now);
  const todayStart = yerevanLocalToUtc(p.year, p.month, p.day);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  if (period === 'today') return { start: todayStart, end: tomorrowStart };
  if (period === 'yesterday') {
    return {
      start: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
      end: todayStart
    };
  }

  const mondayOffset = (p.weekday + 6) % 7;
  const thisMonday = new Date(todayStart.getTime() - mondayOffset * 24 * 60 * 60 * 1000);

  if (period === 'thisWeek') {
    return { start: thisMonday, end: tomorrowStart };
  }

  if (period === 'lastWeek') {
    return {
      start: new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: thisMonday
    };
  }

  if (period === 'thisMonth') {
    return {
      start: yerevanLocalToUtc(p.year, p.month, 1),
      end: tomorrowStart
    };
  }

  const start = parseYerevanInput(customFrom);
  const end = parseYerevanInput(customTo);
  if (!start || !end || end <= start) {
    throw new Error('Choose a valid custom From / To range.');
  }
  return { start, end };
};

const rankValue = (row: any, key: RankKey) => {
  if (key === 'called') return Number(row.called || 0);
  if (key === 'answered') return Number(row.answered || 0);
  if (key === 'answerRate') return Number(row.answerRate || 0);
  return Number(row.statusCounts?.[key] || 0);
};

export default function Performance() {
  const currentUser = {
    id: localStorage.getItem('userId') || '',
    role: localStorage.getItem('userRole') || 'Agent'
  };

  const [period, setPeriod] = useState<PeriodKey>('today');
  const [rankBy, setRankBy] = useState<RankKey>('called');
  const [customFrom, setCustomFrom] = useState(() => {
    const bounds = firestoreService.getYerevanTodayBounds();
    return formatInputYerevan(bounds.start);
  });
  const [customTo, setCustomTo] = useState(() => formatInputYerevan(new Date()));
  const [events, setEvents] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [scope, setScope] = useState<{ teamIds: string[]; all: boolean }>({ teamIds: [], all: false });
  const [expandedAgentId, setExpandedAgentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const bounds = getPeriodBounds(period, customFrom, customTo);
      const [eventRows, users, scopeResult] = await Promise.all([
        firestoreService.getPerformanceEvents(bounds.start, bounds.end),
        firestoreService.getUsers(),
        firestoreService.getLiveCallScope(currentUser.id, currentUser.role)
      ]);

      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setAgents(
        (Array.isArray(users) ? users : []).filter(
          (user: any) => String(user.role || '') === 'Agent'
        )
      );
      setScope(scopeResult || { teamIds: [], all: false });
    } catch (err: any) {
      console.error('Performance load failed:', err);
      setError(err?.message || 'Unable to load Performance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period === 'custom') return;
    loadData();
  }, [period]);

  useEffect(() => {
    if (period !== 'custom') return;
    const timer = window.setTimeout(loadData, 350);
    return () => window.clearTimeout(timer);
  }, [period, customFrom, customTo]);

  const visibleAgents = useMemo(() => {
    if (scope.all || ['Administrator', 'Manager'].includes(currentUser.role)) {
      return agents;
    }

    if (currentUser.role === 'Team Leader') {
      const allowed = new Set((scope.teamIds || []).map(String));
      return agents.filter((agent: any) => allowed.has(String(agent.teamId || '')));
    }

    return agents.filter((agent: any) => String(agent.id || '') === currentUser.id);
  }, [agents, scope, currentUser.id, currentUser.role]);

  const rows = useMemo(() => {
    const allowedIds = new Set(visibleAgents.map((agent: any) => String(agent.id)));
    const byAgent = new Map<string, any[]>();

    events.forEach((event: any) => {
      const agentId = String(event.agentId || event.user_id || '');
      if (!allowedIds.has(agentId)) return;
      const list = byAgent.get(agentId) || [];
      list.push(event);
      byAgent.set(agentId, list);
    });

    return visibleAgents
      .map((agent: any) => {
        const agentEvents = byAgent.get(String(agent.id)) || [];
        const summary = firestoreService.summarizePerformanceEvents(agentEvents);
        return { ...agent, ...summary, events: agentEvents };
      })
      .sort((a: any, b: any) => {
        const diff = rankValue(b, rankBy) - rankValue(a, rankBy);
        if (diff !== 0) return diff;
        return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
      });
  }, [events, visibleAgents, rankBy]);

  const totals = useMemo(
    () => firestoreService.summarizePerformanceEvents(
      events.filter((event: any) =>
        visibleAgents.some((agent: any) => String(agent.id) === String(event.agentId || event.user_id || ''))
      )
    ),
    [events, visibleAgents]
  );

  const hourlyBreakdown = (agentEvents: any[]) => {
    const buckets = new Map<number, any[]>();
    agentEvents.forEach((event: any) => {
      const date = event.createdAt?.toDate ? event.createdAt.toDate() : new Date(event.createdAt || 0);
      if (Number.isNaN(date.getTime())) return;
      const hour = yerevanParts(date).hours;
      const list = buckets.get(hour) || [];
      list.push(event);
      buckets.set(hour, list);
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, items]) => ({
        hour,
        ...firestoreService.summarizePerformanceEvents(items)
      }));
  };

  const periodButtons: Array<{ id: PeriodKey; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'thisWeek', label: 'This Week' },
    { id: 'lastWeek', label: 'Last Week' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'custom', label: 'Custom' }
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-semibold text-white">Performance Center</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            CRM Call Outcomes · Asia/Yerevan (UTC+4) · Atlant answered status is not used.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] p-5">
        <div className="flex flex-wrap gap-2">
          {periodButtons.map(item => (
            <button
              key={item.id}
              onClick={() => setPeriod(item.id)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                period === item.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">
              From · Yerevan Time
              <input
                type="datetime-local"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white"
              />
            </label>
            <label className="text-xs text-slate-400">
              To · Yerevan Time
              <input
                type="datetime-local"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white"
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] p-5">
          <PhoneCall className="w-5 h-5 text-blue-400" />
          <p className="mt-4 text-3xl font-bold text-white">{totals.called}</p>
          <p className="text-xs text-slate-500 mt-1">Called Leads</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] p-5">
          <UserRoundCheck className="w-5 h-5 text-emerald-400" />
          <p className="mt-4 text-3xl font-bold text-white">{totals.answered}</p>
          <p className="text-xs text-slate-500 mt-1">Answered Leads</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] p-5">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <p className="mt-4 text-3xl font-bold text-white">{totals.answerRate.toFixed(1)}%</p>
          <p className="text-xs text-slate-500 mt-1">Answer Rate</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] p-5">
          <Target className="w-5 h-5 text-violet-400" />
          <p className="mt-4 text-3xl font-bold text-white">{events.length}</p>
          <p className="text-xs text-slate-500 mt-1">Outcome Saves</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Agent Ranking</h2>
          <p className="text-xs text-slate-500 mt-1">
            Ranking is based only on CRM outcomes inside the selected Yerevan-time range.
          </p>
        </div>

        <label className="relative">
          <select
            value={rankBy}
            onChange={e => setRankBy(e.target.value as RankKey)}
            className="appearance-none rounded-xl border border-white/10 bg-[#0A0F1C] py-2.5 pl-4 pr-10 text-xs font-semibold text-white"
          >
            <option value="called">Rank by Called</option>
            <option value="answered">Rank by Answered</option>
            <option value="answerRate">Rank by Answer Rate</option>
            <option value="High Potential">Rank by High Potential</option>
            <option value="JOR">Rank by JOR</option>
            <option value="Deposit">Rank by Deposit</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 w-4 h-4 text-slate-500" />
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rows.map((row: any, index: number) => {
          const expanded = expandedAgentId === String(row.id);
          const hp = Number(row.statusCounts?.['High Potential'] || 0);
          const jor = Number(row.statusCounts?.JOR || 0);
          const callback = Number(row.statusCounts?.Callback || 0);
          const deposit = Number(row.statusCounts?.Deposit || 0);

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-white/5 bg-[#0A0F1C] overflow-hidden"
            >
              <button
                onClick={() => setExpandedAgentId(expanded ? '' : String(row.id))}
                className="w-full p-5 text-left hover:bg-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                      index === 0
                        ? 'bg-amber-500/15 text-amber-300'
                        : index === 1
                          ? 'bg-slate-300/10 text-slate-300'
                          : index === 2
                            ? 'bg-orange-500/10 text-orange-300'
                            : 'bg-blue-500/10 text-blue-300'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {row.name || row.email || 'Agent'}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">{row.teamName || 'No Team'}</p>
                    </div>
                  </div>

                  {index === 0 && <Trophy className="w-5 h-5 text-amber-400 shrink-0" />}
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xl font-bold text-white">{row.called}</p>
                    <p className="text-[10px] uppercase text-slate-600">Called</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-emerald-400">{row.answered}</p>
                    <p className="text-[10px] uppercase text-slate-600">Answered</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-cyan-400">{row.answerRate.toFixed(1)}%</p>
                    <p className="text-[10px] uppercase text-slate-600">Answer Rate</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-violet-400">{hp}</p>
                    <p className="text-[10px] uppercase text-slate-600">High Potential</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-300">JOR {jor}</span>
                  <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-amber-300">Callback {callback}</span>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300">Deposit {deposit}</span>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-white/5 px-5 py-5">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock3 className="w-4 h-4 text-blue-400" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Hourly · Yerevan Time
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {hourlyBreakdown(row.events).length === 0 ? (
                          <p className="text-xs text-slate-600">No outcomes in this period.</p>
                        ) : hourlyBreakdown(row.events).map((hour: any) => (
                          <div key={hour.hour} className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-2 text-xs">
                            <span className="text-slate-400">
                              {String(hour.hour).padStart(2, '0')}:00–{String((hour.hour + 1) % 24).padStart(2, '0')}:00
                            </span>
                            <span className="text-white">
                              {hour.called} Called · {hour.answered} Answered · {hour.answerRate.toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Flame className="w-4 h-4 text-orange-400" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Outcome Breakdown
                        </h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(row.statusCounts || {})
                          .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
                          .map(([status, count]: any) => (
                            <div key={status} className="rounded-lg bg-white/[0.025] px-3 py-2">
                              <p className="text-sm font-semibold text-white">{count}</p>
                              <p className="text-[10px] text-slate-500">{status}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#0A0F1C] py-16 text-center">
          <CalendarDays className="w-8 h-8 text-slate-700 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">No Agent outcomes in this period yet.</p>
        </div>
      )}
    </div>
  );
}
