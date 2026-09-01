import { useEffect, useMemo, useState } from 'react';
import {
  Radio,
  PhoneCall,
  PhoneOff,
  Clock3,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  Circle,
  LogOut,
  UserRoundCheck,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  Eye,
  EyeOff
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

const toDate = (value: any) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatLastSeen = (value: any, now: number) => {
  const date = toDate(value);
  if (!date) return 'Never';

  const diffSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (diffSeconds < 10) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const mins = Math.floor(diffSeconds / 60);
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const FILTER_STORAGE_PREFIX = 'cpcrm_live_calls_filters_v3';

const getSavedDashboardFilters = (userId: string) => {
  try {
    const raw = localStorage.getItem(`${FILTER_STORAGE_PREFIX}:${userId || 'unknown'}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function LiveCalls() {
  const [calls, setCalls] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [scope, setScope] = useState<{ teamIds: string[]; all: boolean }>({ teamIds: [], all: false });
  const currentUser = {
    id: localStorage.getItem('userId') || '',
    role: localStorage.getItem('userRole') || 'Agent'
  };

  const savedFilters = getSavedDashboardFilters(currentUser.id);

  const [search, setSearch] = useState(() => String(savedFilters?.search || ''));
  const [presenceFilter, setPresenceFilter] = useState(() => String(savedFilters?.presenceFilter || 'all'));
  const [roleFilter, setRoleFilter] = useState(() => String(savedFilters?.roleFilter || 'all'));
  const [teamFilter, setTeamFilter] = useState(() => String(savedFilters?.teamFilter || 'all'));
  const [modeFilter, setModeFilter] = useState(() => String(savedFilters?.modeFilter || 'all'));
  const [resultFilter, setResultFilter] = useState(() => String(savedFilters?.resultFilter || 'all'));
  const [periodFilter, setPeriodFilter] = useState(() => String(savedFilters?.periodFilter || 'today'));
  const [showFilterPanel, setShowFilterPanel] = useState(() => Boolean(savedFilters?.showFilterPanel ?? true));
  const [showCards, setShowCards] = useState(() => Boolean(savedFilters?.showCards ?? true));
  const [showPresence, setShowPresence] = useState(() => Boolean(savedFilters?.showPresence ?? true));
  const [showActiveCalls, setShowActiveCalls] = useState(() => Boolean(savedFilters?.showActiveCalls ?? true));
  const [showRecentCalls, setShowRecentCalls] = useState(() => Boolean(savedFilters?.showRecentCalls ?? true));
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    firestoreService.getLiveCallScope(currentUser.id, currentUser.role)
      .then(result => {
        if (!cancelled) setScope(result);
      })
      .catch(err => {
        console.error('Failed to load Live Calls scope:', err);
        if (!cancelled) setError('Unable to load team scope.');
      });

    const unsubscribeCalls = firestoreService.subscribeAtlantLiveCalls(
      items => {
        if (!cancelled) {
          setCalls(items);
          setLoading(false);
        }
      },
      err => {
        console.error('Live Calls subscription failed:', err);
        if (!cancelled) {
          setError('Unable to load live calls.');
          setLoading(false);
        }
      }
    );

    const unsubscribeUsers = firestoreService.subscribeUsers(
      items => {
        if (!cancelled) {
          setUsers(items);
          setUsersLoading(false);
        }
      },
      err => {
        console.error('Live users subscription failed:', err);
        if (!cancelled) {
          setError('Unable to load live user presence.');
          setUsersLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribeCalls();
      unsubscribeUsers();
    };
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        `${FILTER_STORAGE_PREFIX}:${currentUser.id || 'unknown'}`,
        JSON.stringify({
          search,
          presenceFilter,
          roleFilter,
          teamFilter,
          modeFilter,
          resultFilter,
          periodFilter,
          showFilterPanel,
          showCards,
          showPresence,
          showActiveCalls,
          showRecentCalls
        })
      );
    } catch {
      // Dashboard preferences are optional; ignore storage failures.
    }
  }, [
    currentUser.id,
    search,
    presenceFilter,
    roleFilter,
    teamFilter,
    modeFilter,
    resultFilter,
    periodFilter,
    showFilterPanel,
    showCards,
    showPresence,
    showActiveCalls,
    showRecentCalls
  ]);

  const scopedCalls = useMemo(() => {
    let items = calls;

    if (!scope.all && currentUser.role === 'Team Leader') {
      const allowed = new Set(scope.teamIds.map(String));
      items = items.filter(call => allowed.has(String(call.teamId || '')));
    }

    return items;
  }, [calls, scope, currentUser.role]);

  const roleOptions = useMemo(() => {
    return Array.from(new Set(users.map(user => String(user.role || 'Agent')).filter(Boolean))).sort();
  }, [users]);

  const teamOptions = useMemo(() => {
    const items = users
      .map(user => ({ id: String(user.teamId || ''), name: String(user.teamName || '').trim() }))
      .filter(item => item.id || item.name);

    const byKey = new Map<string, { id: string; name: string }>();
    items.forEach(item => {
      const key = item.id || item.name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, item);
    });

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const getUserPresenceKey = (user: any) => {
    const call = scopedCalls.find(
      item => item.active === true && String(item.agentId || '') === String(user.id || '')
    );

    if (call?.state === 'in_call') return 'in_call';
    if (call?.state === 'dialing') return 'dialing';

    const lastSeen = toDate(user.lastSeen)?.getTime() || 0;
    const fresh = user.isOnline === true && lastSeen > 0 && now - lastSeen <= 120000;
    return fresh ? 'idle' : 'offline';
  };

  const scopedUsers = useMemo(() => {
    let items = users;

    if (!scope.all && currentUser.role === 'Team Leader') {
      const allowed = new Set(scope.teamIds.map(String));
      items = items.filter(user => {
        if (String(user.id || '') === String(currentUser.id || '')) return true;
        return allowed.has(String(user.teamId || ''));
      });
    }

    if (roleFilter !== 'all') {
      items = items.filter(user => String(user.role || 'Agent') === roleFilter);
    }

    if (teamFilter !== 'all') {
      items = items.filter(user => String(user.teamId || user.teamName || '') === teamFilter);
    }

    if (presenceFilter !== 'all') {
      items = items.filter(user => {
        const key = getUserPresenceKey(user);
        if (presenceFilter === 'online') return ['idle', 'dialing', 'in_call'].includes(key);
        return key === presenceFilter;
      });
    }

    if (modeFilter !== 'all') {
      items = items.filter(user => {
        const call = scopedCalls.find(
          item => item.active === true && String(item.agentId || '') === String(user.id || '')
        );
        return String(call?.mode || '') === modeFilter;
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(user => [
        user.name,
        user.email,
        user.role,
        user.teamName,
        user.atlantExtension
      ].some(value => String(value || '').toLowerCase().includes(q)));
    }

    return [...items].sort((a, b) => {
      const roleOrder: Record<string, number> = {
        'Agent': 1,
        'Team Leader': 2,
        'Manager': 3,
        'Financial Manager': 4,
        'Administrator': 5
      };

      const aCall = scopedCalls.find(call => call.active === true && String(call.agentId || '') === String(a.id || ''));
      const bCall = scopedCalls.find(call => call.active === true && String(call.agentId || '') === String(b.id || ''));

      if (aCall && !bCall) return -1;
      if (!aCall && bCall) return 1;

      const aSeen = toDate(a.lastSeen)?.getTime() || 0;
      const bSeen = toDate(b.lastSeen)?.getTime() || 0;
      const aFresh = a.isOnline === true && now - aSeen <= 120000;
      const bFresh = b.isOnline === true && now - bSeen <= 120000;

      if (aFresh !== bFresh) return aFresh ? -1 : 1;

      const roleDiff = (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
      if (roleDiff !== 0) return roleDiff;

      return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
    });
  }, [
    users,
    scope,
    search,
    currentUser.id,
    currentUser.role,
    scopedCalls,
    now,
    presenceFilter,
    roleFilter,
    teamFilter,
    modeFilter
  ]);

  const filteredCalls = useMemo(() => {
    let items = scopedCalls;

    if (teamFilter !== 'all') {
      items = items.filter(call => String(call.teamId || call.teamName || '') === teamFilter);
    }

    if (modeFilter !== 'all') {
      items = items.filter(call => String(call.mode || '') === modeFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(call => [
        call.agentName,
        call.agentEmail,
        call.leadName,
        call.phone,
        call.teamName,
        call.disposition,
        call.mode
      ].some(value => String(value || '').toLowerCase().includes(q)));
    }

    return items;
  }, [scopedCalls, teamFilter, modeFilter, search]);

  const activeCalls = filteredCalls.filter(call =>
    call.active === true &&
    ['dialing', 'in_call'].includes(String(call.state || ''))
  ).filter(call => {
    if (presenceFilter === 'all' || presenceFilter === 'online') return true;
    if (presenceFilter === 'dialing') return call.state === 'dialing';
    if (presenceFilter === 'in_call') return call.state === 'in_call';
    return false;
  });
  const dialing = activeCalls.filter(call => call.state === 'dialing');
  const inCall = activeCalls.filter(call => call.state === 'in_call');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCalls = filteredCalls.filter(call => {
    const date = toDate(call.startedAt);
    return !!date && date >= todayStart;
  });

  const answeredToday = todayCalls.filter(
    call => String(call.disposition || '').toLowerCase() === 'answered'
  ).length;
  const failedToday = todayCalls.filter(
    call => ['no answer', 'rejected', 'failed'].includes(String(call.disposition || '').toLowerCase())
  ).length;
  const totalTalkToday = todayCalls.reduce(
    (sum, call) => sum + Number(call.duration?.talk_time || 0),
    0
  );

  const onlineUsersCount = scopedUsers.filter(user => {
    const lastSeen = toDate(user.lastSeen)?.getTime() || 0;
    return user.isOnline === true && now - lastSeen <= 120000;
  }).length;

  const cards = [
    { label: 'Users Online', value: onlineUsersCount, icon: UserRoundCheck, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Active Calls', value: activeCalls.length, icon: Radio, tone: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { label: 'Dialing', value: dialing.length, icon: PhoneCall, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { label: 'In Call', value: inCall.length, icon: Users, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Answered Today', value: answeredToday, icon: CheckCircle2, tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    { label: 'No Answer / Failed', value: failedToday, icon: XCircle, tone: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    { label: 'Talk Time Today', value: formatDuration(totalTalkToday), icon: Clock3, tone: 'text-violet-400 bg-violet-500/10 border-violet-500/20' }
  ];

  const liveElapsed = (call: any) => {
    const start = toDate(call.answeredAt) || toDate(call.startedAt);
    if (!start) return '00:00';
    return formatDuration((now - start.getTime()) / 1000);
  };

  const getUserLiveState = (user: any) => {
    const call = activeCalls.find(
      item => String(item.agentId || '') === String(user.id || '')
    );

    if (call?.state === 'in_call') {
      return {
        key: 'in_call',
        label: 'In Call',
        call,
        className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
        dot: 'bg-emerald-400'
      };
    }

    if (call?.state === 'dialing') {
      return {
        key: 'dialing',
        label: 'Dialing',
        call,
        className: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
        dot: 'bg-amber-400'
      };
    }

    const lastSeen = toDate(user.lastSeen)?.getTime() || 0;
    const fresh = user.isOnline === true && lastSeen > 0 && now - lastSeen <= 120000;

    if (fresh) {
      return {
        key: 'online',
        label: 'Online / Idle',
        call: null,
        className: 'text-blue-300 bg-blue-500/10 border-blue-500/25',
        dot: 'bg-blue-400'
      };
    }

    return {
      key: 'offline',
      label: 'Logged Out',
      call: null,
      className: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      dot: 'bg-slate-600'
    };
  };

  const recentCalls = useMemo(() => {
    const nowDate = new Date(now);
    const todayStart = new Date(nowDate);
    todayStart.setHours(0, 0, 0, 0);

    const rangeStart = (() => {
      if (periodFilter === 'all') return null;
      if (periodFilter === 'today') return todayStart;
      const date = new Date(nowDate);
      if (periodFilter === '7d') date.setDate(date.getDate() - 7);
      if (periodFilter === '30d') date.setDate(date.getDate() - 30);
      return date;
    })();

    return filteredCalls
      .filter(call => {
        if (resultFilter !== 'all') {
          const result = String(call.disposition || '').toLowerCase();
          if (resultFilter === 'failed') {
            if (!['no answer', 'rejected', 'failed'].includes(result)) return false;
          } else if (result !== resultFilter) {
            return false;
          }
        }

        if (rangeStart) {
          const started = toDate(call.startedAt);
          if (!started || started < rangeStart) return false;
        }

        return true;
      })
      .slice(0, 100);
  }, [filteredCalls, resultFilter, periodFilter, now]);

  const resetDashboardFilters = () => {
    setSearch('');
    setPresenceFilter('all');
    setRoleFilter('all');
    setTeamFilter('all');
    setModeFilter('all');
    setResultFilter('all');
    setPeriodFilter('today');
  };


  return (
    <div className="p-8 max-w-[1700px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">Live Operations</h1>
              <p className="text-sm text-slate-400 mt-1">
                Real-time user presence and Atlant call activity.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user, role, team, lead, phone..."
              className="w-full bg-[#0A0F1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilterPanel(value => !value)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              showFilterPanel
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-[#0A0F1C] border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilterPanel ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {showFilterPanel && (
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Dashboard Filters</h2>
              <p className="text-xs text-slate-500 mt-1">Your choices are saved for this manager account.</p>
            </div>
            <button
              type="button"
              onClick={resetDashboardFilters}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/[0.03]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Presence</span>
              <select value={presenceFilter} onChange={e => setPresenceFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">All users</option>
                <option value="online">Online only</option>
                <option value="idle">Online / Idle</option>
                <option value="dialing">Dialing</option>
                <option value="in_call">In Call</option>
                <option value="offline">Logged Out</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Role</span>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">All roles</option>
                {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team</span>
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">All teams</option>
                {teamOptions.map(team => (
                  <option key={team.id || team.name} value={team.id || team.name}>{team.name || team.id}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Call Mode</span>
              <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">Auto + Manual</option>
                <option value="auto">Auto only</option>
                <option value="manual">Manual only</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Result</span>
              <select value={resultFilter} onChange={e => setResultFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">All results</option>
                <option value="answered">Answered</option>
                <option value="no answer">No Answer</option>
                <option value="rejected">Rejected</option>
                <option value="failed">No Answer / Rejected / Failed</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">History</span>
              <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All available</option>
              </select>
            </label>
          </div>

          <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Visible Sections</span>
            {[
              ['Summary Cards', showCards, setShowCards],
              ['Team Presence', showPresence, setShowPresence],
              ['Active Calls', showActiveCalls, setShowActiveCalls],
              ['Recent Calls', showRecentCalls, setShowRecentCalls]
            ].map(([label, visible, setter]: any) => (
              <button
                key={label}
                type="button"
                onClick={() => setter((value: boolean) => !value)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  visible
                    ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
                    : 'text-slate-500 bg-white/[0.02] border-white/10'
                }`}
              >
                {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCards && (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${card.tone}`}>
              <card.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-semibold text-white mt-3">{card.value}</p>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-1">
              {card.label}
            </p>
          </div>
        ))}
      </div>
      )}

      {showPresence && (
      <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Team Presence</h2>
            <p className="text-xs text-slate-500 mt-1">
              Everyone in scope — live call state, online/idle or logged out.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        {usersLoading ? (
          <div className="p-12 text-center text-slate-500">Loading users...</div>
        ) : error ? (
          <div className="p-12 text-center text-rose-400">{error}</div>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-[#0A0F1C] sticky top-0 z-10 border-b border-white/5">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Team</th>
                  <th className="px-5 py-3">Presence</th>
                  <th className="px-5 py-3">Current Lead</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3">Live Time</th>
                  <th className="px-5 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scopedUsers.map(user => {
                  const liveState = getUserLiveState(user);
                  const call = liveState.call;

                  return (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <img
                              src={user.avatar || `https://i.pravatar.cc/150?u=${user.id}`}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                            <span
                              className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0A0F1C] ${liveState.dot}`}
                            />
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">
                              {user.name || user.email || 'User'}
                            </p>
                            <p className="text-[10px] text-slate-500">{user.email || ''}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3 text-xs text-slate-300">{user.role || 'Agent'}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">{user.teamName || '—'}</td>

                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${liveState.className}`}>
                          {liveState.key === 'offline' ? (
                            <LogOut className="w-3 h-3" />
                          ) : (
                            <Circle className="w-2.5 h-2.5 fill-current" />
                          )}
                          {liveState.label}
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        {call ? (
                          <div>
                            <p className="text-xs text-slate-200">{call.leadName || 'Unknown Lead'}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{call.phone || ''}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3">
                        {call ? (
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                            call.mode === 'auto'
                              ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
                              : 'text-violet-300 bg-violet-500/10 border-violet-500/20'
                          }`}>
                            {call.mode || 'manual'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3 text-xs font-mono text-slate-200">
                        {call ? liveElapsed(call) : '—'}
                      </td>

                      <td className="px-5 py-3 text-xs text-slate-500">
                        {formatLastSeen(user.lastSeen, now)}
                      </td>
                    </tr>
                  );
                })}

                {scopedUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showActiveCalls && (
      <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Active Calls</h2>
            <p className="text-xs text-slate-500 mt-1">
              Manual and Auto calls currently dialing or connected.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading live calls...</div>
        ) : activeCalls.length === 0 ? (
          <div className="p-12 text-center">
            <PhoneOff className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No active calls right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">Lead</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Live Time</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeCalls.map(call => (
                  <tr key={call.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <p className="text-sm text-white font-medium">{call.agentName || 'Agent'}</p>
                      <p className="text-[10px] text-slate-500">{call.agentEmail || ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-200">{call.leadName || 'Unknown Lead'}</p>
                      <p className="text-[10px] text-slate-500">{call.leadStatus || ''}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-mono text-slate-300">{call.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                        call.state === 'in_call'
                          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                          : 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                      }`}>
                        {call.state === 'in_call' ? 'In Call' : 'Dialing'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-mono text-white">{liveElapsed(call)}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                        call.mode === 'auto'
                          ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
                          : 'text-violet-300 bg-violet-500/10 border-violet-500/20'
                      }`}>
                        {call.mode || 'manual'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">{call.teamName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showRecentCalls && (
      <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Recent Calls</h2>
          <p className="text-xs text-slate-500 mt-1">Latest tracked Manual and Auto calls.</p>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-[#0A0F1C] sticky top-0 border-b border-white/5">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Lead</th>
                <th className="px-5 py-3">Result</th>
                <th className="px-5 py-3">Talk</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {recentCalls.map(call => (
                <tr key={call.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-sm text-white">{call.agentName || 'Agent'}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{call.leadName || call.phone || 'Unknown'}</td>
                  <td className="px-5 py-3 text-xs text-slate-300">
                    {call.active
                      ? (call.state === 'in_call' ? 'In Call' : 'Dialing')
                      : (call.disposition || 'Ended')}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-300">
                    {formatDuration(Number(call.duration?.talk_time || 0))}
                  </td>
                  <td className="px-5 py-3 text-[10px] uppercase font-bold text-slate-400">
                    {call.mode || 'manual'}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{call.teamName || '—'}</td>
                </tr>
              ))}

              {recentCalls.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                    No tracked calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
