import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, CheckCircle, XCircle, Activity, BarChart3, PieChart, ShieldCheck,
  Coffee, PlayCircle, Square, Clock3, AlertTriangle, PhoneCall, UserX, Flame, Timer,
  FolderOpen, ChevronRight, TrendingUp, Target, CalendarDays, X, Crown, RefreshCw,
  Building2, User as UserIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie } from 'recharts';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';
import { chatService } from '../services/chatService';
import AgentFinancePanel from '../components/AgentFinancePanel';

// ---------------------------------------------------------------------------
// Small layout helpers so every card on the Dashboard looks the same.
// ---------------------------------------------------------------------------
function Panel({
  icon: Icon,
  iconClass = 'text-blue-400',
  title,
  subtitle,
  right,
  children,
  className = ''
}: {
  icon: any;
  iconClass?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-[#0A0F1C] border border-white/5 rounded-2xl p-5 shadow-sm flex flex-col min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/5 flex items-center justify-center shrink-0">
            <Icon className={`w-4 h-4 ${iconClass}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white leading-8 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 -mt-1 truncate">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 px-1">
      {children}
    </h2>
  );
}

const qualityClass = (score: number) =>
  score >= 60 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-rose-400';

const qualityBarClass = (score: number) =>
  score >= 60 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';

export default function Dashboard() {
  const navigate = useNavigate();
  const [alertDetail, setAlertDetail] = useState<any>(null);

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'1d' | '1w' | '1m' | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  const openLeadDrilldown = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);
    navigate(`/leads?${query.toString()}`);
  };

  const openStatusDrilldown = (status: string) => openLeadDrilldown({ status, range: timeRange });

  const handleCriticalAlertClick = (alert: any) => {
    if (alert.type === 'unassigned') return openLeadDrilldown({ view: 'unassigned' });
    if (alert.type === 'overdue-callbacks') return openLeadDrilldown({ view: 'overdue-callbacks' });
    if (alert.type === 'untouched') return openLeadDrilldown({ view: 'untouched24h' });
    if (alert.type === 'stale') return openLeadDrilldown({ view: 'stale7d' });

    if (alert.type === 'shift-not-started') {
      setAlertDetail({ title: 'Shift Not Started', subtitle: 'Agents without a shift record for today.', rows: data?.attendance?.notStartedAgents || [] });
      return;
    }

    if (alert.type === 'user-config') {
      setAlertDetail({ title: 'User Configuration', subtitle: 'Users with undefined or missing CRM roles.', rows: data?.misconfiguredUserDetails || [] });
    }
  };

  const loadData = async (fresh = false) => {
    setIsLoading(true);
    try {
      const sessionUser = {
        id: localStorage.getItem('userId'),
        role: localStorage.getItem('userRole')
      };

      // Statistics are calculated on the server; the service falls back to the
      // original in-browser calculation if the server is unavailable.
      const body = await firestoreService.getDashboardStats(sessionUser, timeRange, { fresh });
      setData(body);
      setError(null);
    } catch (err: any) {
      console.error('Dashboard Load Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      const sessionUser = {
        id: localStorage.getItem('userId'),
        role: localStorage.getItem('userRole')
      };
      const freshUser = sessionUser.id
        ? await firestoreService.getUser(sessionUser.id)
        : null;
      const user = freshUser || sessionUser;

      // Export only the leads this user is allowed to see.
      const leads = await firestoreService.getLeadsForUser(user);

      // Filter by timeRange (same logic as in dashboard)
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let startDate = new Date(0);
      if (timeRange === '1d') startDate = today;
      else if (timeRange === '1w') { startDate = new Date(now); startDate.setDate(startDate.getDate() - 7); }
      else if (timeRange === '1m') { startDate = new Date(now); startDate.setMonth(startDate.getMonth() - 1); }

      const filteredLeads = (leads as any[]).filter((l: any) => {
        const created = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt || 0);
        return created >= startDate;
      });

      // Convert to CSV
      const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Source', 'Status', 'Created At'];
      const csvRows = [
        headers.join(','),
        ...filteredLeads.map((l: any) => [
          `"${l.first_name || ''}"`,
          `"${l.last_name || ''}"`,
          `"${l.phone || ''}"`,
          `"${l.email || ''}"`,
          `"${l.source || ''}"`,
          `"${l.status || ''}"`,
          `"${l.createdAt?.toDate ? format(l.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : ''}"`
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `CRM_Report_${timeRange}_${format(new Date(), 'yyyyMMdd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Report Generation Error:', err);
      alert('Failed to generate report');
    }
  };

  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserRole = localStorage.getItem('userRole') || 'Agent';
  const [openingChatUserId, setOpeningChatUserId] = useState<string | null>(null);
  const [myShift, setMyShift] = useState<any>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState('');
  const [myPerformance, setMyPerformance] = useState<any>(null);
  const [myPerformanceLoading, setMyPerformanceLoading] = useState(false);

  const loadMyShift = async () => {
    if (currentUserRole !== 'Agent' || !currentUserId) return;
    try {
      const shift = await firestoreService.getTodayShift(currentUserId);
      setMyShift(shift);
    } catch (err) {
      console.error('Failed to load shift:', err);
    }
  };


  const loadMyPerformance = async () => {
    if (currentUserRole !== 'Agent' || !currentUserId) return;

    try {
      setMyPerformanceLoading(true);

      const todayBounds = firestoreService.getYerevanTodayBounds();
      const lookbackStart = new Date(
        todayBounds.start.getTime() - 7 * 24 * 60 * 60 * 1000
      );

      const events = await firestoreService.getPerformanceEvents(
        lookbackStart,
        todayBounds.end
      );

      const mine = (events as any[]).filter(
        (event: any) =>
          String(event.agentId || event.user_id || '') === String(currentUserId)
      );

      const todayKey = firestoreService.getYerevanDateKey(new Date());
      const todayEvents = mine.filter(
        (event: any) => String(event.yerevanDateKey || '') === todayKey
      );

      const summary = firestoreService.summarizePerformanceEvents(todayEvents);

      const activeDays = new Set(
        mine
          .map((event: any) => String(event.yerevanDateKey || ''))
          .filter(Boolean)
      );

      let streak = 0;
      for (let offset = 0; offset < 8; offset++) {
        const day = new Date(
          todayBounds.start.getTime() - offset * 24 * 60 * 60 * 1000
        );
        const key = firestoreService.getYerevanDateKey(day);
        if (!activeDays.has(key)) break;
        streak++;
      }

      setMyPerformance({
        ...summary,
        streak,
        dailyGoal: 50
      });
    } catch (err) {
      console.error('Failed to load My Performance:', err);
    } finally {
      setMyPerformanceLoading(false);
    }
  };

  const handleShiftAction = async (status: 'ready' | 'break' | 'ended') => {
    if (!currentUserId) return;

    try {
      setShiftLoading(true);
      setShiftError('');
      const shift = await firestoreService.setWorkStatus(currentUserId, status);
      setMyShift(shift);
      loadData(true);
    } catch (err: any) {
      console.error('Shift action failed:', err);
      setShiftError(err?.message || 'Failed to update shift status.');
    } finally {
      setShiftLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const calculateBreakMs = (shift: any) => {
    if (!shift) return 0;

    let total = Number(shift.totalBreakMs || 0);

    if (shift.status === 'break' && shift.currentBreakStart) {
      const start = shift.currentBreakStart?.toDate
        ? shift.currentBreakStart.toDate()
        : new Date(shift.currentBreakStart);
      total += Math.max(0, Date.now() - start.getTime());
    }

    return total;
  };

  const calculateWorkedMs = (shift: any) => {
    if (!shift?.shiftStart) return 0;

    const start = shift.shiftStart?.toDate
      ? shift.shiftStart.toDate()
      : new Date(shift.shiftStart);
    const end = shift.shiftEnd
      ? (shift.shiftEnd?.toDate ? shift.shiftEnd.toDate() : new Date(shift.shiftEnd))
      : new Date();

    return Math.max(0, end.getTime() - start.getTime() - calculateBreakMs(shift));
  };

  // Kept for the existing "Message" flow (opens the direct chat).
  const handleMessageAgent = async (agent: any) => {
    if (!currentUserId || !agent?.id) return;

    try {
      setOpeningChatUserId(agent.id);

      const directChat = await chatService.getOrCreateDirectChat(
        currentUserId,
        agent.id,
        agent.name || agent.email || 'Agent'
      );

      // App.tsx listens for this event and opens the existing ChatPanel.
      window.dispatchEvent(new CustomEvent('crm:open-chat', {
        detail: {
          chatId: directChat?.id || '',
          userId: agent.id,
          userName: agent.name || ''
        }
      }));
    } catch (err: any) {
      console.error('Failed to open direct chat:', err);
      alert(err?.message || 'Failed to open chat');
    } finally {
      setOpeningChatUserId(null);
    }
  };
  void handleMessageAgent;
  void openingChatUserId;

  useEffect(() => {
    loadData();
  }, [timeRange]);

  useEffect(() => {
    loadMyShift();

    if (currentUserRole !== 'Agent') return;

    const interval = setInterval(loadMyShift, 30000);
    return () => clearInterval(interval);
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    loadMyPerformance();
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    const handlePerformanceUpdated = () => loadMyPerformance();
    window.addEventListener('crm:performance-updated', handlePerformanceUpdated);
    return () => window.removeEventListener('crm:performance-updated', handlePerformanceUpdated);
  }, [currentUserId, currentUserRole]);

  if (error && !data) {
    return (
      <div className="p-8 text-center">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-8 max-w-2xl mx-auto text-left">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="w-8 h-8 text-rose-500" />
            <h2 className="text-xl font-semibold text-white">Dashboard Error</h2>
          </div>
          <p className="text-slate-300 font-medium mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  // First load only: show a skeleton. Later range changes keep the current
  // numbers on screen and show a small spinner instead of blanking the page.
  if (!data) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-64 rounded-lg bg-white/5" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-white/[0.04]" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 h-72 rounded-2xl bg-white/[0.04]" />
          <div className="h-72 rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  const rangeLabel =
    timeRange === '1d' ? 'Today' : timeRange === '1w' ? 'Last 7 days' : timeRange === '1m' ? 'Last month' : 'All time';

  const scopeLabel =
    data.scope?.type === 'team'
      ? `Team · ${data.scope?.teamName || 'My team'}`
      : data.scope?.type === 'agent'
        ? 'My leads'
        : 'Whole organization';

  const ScopeIcon = data.scope?.type === 'agent' ? UserIcon : data.scope?.type === 'team' ? Users : Building2;

  const primaryStats = [
    { name: 'Total Leads', value: data.total, change: data.totalChange, icon: Users, accent: 'bg-blue-500', color: 'text-blue-400', onClick: () => openLeadDrilldown({ view: 'all', range: timeRange }) },
    { name: 'Active Leads', value: data.active, change: data.activeChange, icon: Activity, accent: 'bg-amber-500', color: 'text-amber-400', onClick: () => openLeadDrilldown({ view: 'active', range: timeRange }) },
    { name: 'Deposits', value: data.converted, change: data.convertedChange, icon: CheckCircle, accent: 'bg-emerald-500', color: 'text-emerald-400', onClick: () => openStatusDrilldown('Deposit') },
    { name: 'New Today', value: data.newToday, icon: UserPlus, accent: 'bg-cyan-500', color: 'text-cyan-400', onClick: () => openLeadDrilldown({ view: 'new-today' }) },
  ];

  const secondaryStats = [
    { name: 'High Potential', value: data.highPotential || 0, icon: Flame, color: 'text-emerald-400', onClick: () => openStatusDrilldown('High Potential') },
    { name: 'JOR', value: data.jor || 0, icon: Target, color: 'text-cyan-400', onClick: () => openStatusDrilldown('JOR') },
    { name: 'Callbacks Today', value: data.callbacksToday || 0, icon: PhoneCall, color: 'text-violet-400', onClick: () => openLeadDrilldown({ view: 'callbacks-today' }) },
    { name: 'Unassigned', value: data.unassigned || 0, icon: UserX, color: 'text-rose-400', onClick: () => openLeadDrilldown({ view: 'unassigned' }) },
  ];

  // One "Needs attention" list instead of separate Alerts + Lead Health cards.
  const attentionItems = [
    { type: 'unassigned', severity: 'high', label: 'Unassigned leads', detail: 'No user assigned', count: data.unassigned || 0, icon: UserX },
    { type: 'overdue-callbacks', severity: 'high', label: 'Overdue callbacks', detail: 'Callback time has passed', count: data.overdueCallbacks || 0, icon: PhoneCall },
    { type: 'untouched', severity: 'medium', label: 'Untouched 24h+', detail: 'Active, not updated for a day', count: data.untouched24h || 0, icon: Timer },
    { type: 'stale', severity: 'medium', label: 'Stale 7d+', detail: 'Active, not updated for a week', count: data.stale7d || 0, icon: Clock3 },
    { type: 'shift-not-started', severity: 'medium', label: 'Shift not started', detail: 'Agents without a shift today', count: data.attendance?.notStarted || 0, icon: Coffee },
    { type: 'user-config', severity: 'medium', label: 'Undefined roles', detail: 'Users to review', count: data.misconfiguredUsers || 0, icon: AlertTriangle },
  ].filter(item => item.count > 0);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];
  const statusTotal = Math.max(1, (data.leadsByStatus || []).reduce((sum: number, s: any) => sum + Number(s.count || 0), 0));
  const maxStatusCount = Math.max(1, ...(data.leadsByStatus || []).map((s: any) => Number(s.count || 0)));

  const attendance = data.attendance || {};
  const attendanceTotal = Math.max(1, Number(attendance.totalAgents || 0));
  const attendanceSegments = [
    { label: 'Ready', value: Number(attendance.ready || 0), bar: 'bg-emerald-500', text: 'text-emerald-400' },
    { label: 'On Break', value: Number(attendance.break || 0), bar: 'bg-amber-500', text: 'text-amber-400' },
    { label: 'Ended', value: Number(attendance.ended || 0), bar: 'bg-slate-500', text: 'text-slate-300' },
    { label: 'Not Started', value: Number(attendance.notStarted || 0), bar: 'bg-rose-500/70', text: 'text-rose-400' },
  ];

  const isManagerView = ['Administrator', 'Manager', 'Team Leader'].includes(currentUserRole);
  const updatedAt = data.generatedAt ? format(new Date(data.generatedAt), 'HH:mm:ss') : '';

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/5 px-2.5 py-1 text-slate-300">
              <ScopeIcon className="w-3.5 h-3.5 text-blue-400" />
              {scopeLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/5 px-2.5 py-1 text-slate-400">
              <CalendarDays className="w-3.5 h-3.5" />
              {rangeLabel}
            </span>
            {updatedAt && <span className="text-slate-600">Updated {updatedAt}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-lg p-1">
            {[
              { id: '1d', label: '1D' },
              { id: '1w', label: '1W' },
              { id: '1m', label: '1M' },
              { id: 'all', label: 'All' },
            ].map((range) => (
              <button
                key={range.id}
                onClick={() => setTimeRange(range.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === range.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading}
            title="Refresh"
            className="p-2.5 rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleGenerateReport}
            className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
          Could not refresh: {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Agent: My day (shift + today's performance) and finance            */}
      {/* ------------------------------------------------------------------ */}
      {currentUserRole === 'Agent' && (
        <div className="space-y-3">
          <SectionLabel>My day</SectionLabel>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel
              icon={myShift?.status === 'break' ? Coffee : myShift?.status === 'ended' ? Square : PlayCircle}
              iconClass={myShift?.status === 'ready' ? 'text-emerald-400' : myShift?.status === 'break' ? 'text-amber-400' : myShift?.status === 'ended' ? 'text-slate-400' : 'text-blue-400'}
              title={
                !myShift
                  ? 'Shift not started'
                  : myShift.status === 'ready'
                    ? 'Ready to work'
                    : myShift.status === 'break'
                      ? 'On break'
                      : 'Shift ended'
              }
              subtitle="My shift today"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Started', myShift?.shiftStart?.toDate ? format(myShift.shiftStart.toDate(), 'HH:mm') : '—', 'text-white'],
                  ['Break', formatDuration(calculateBreakMs(myShift)), 'text-amber-400'],
                  ['Worked', formatDuration(calculateWorkedMs(myShift)), 'text-emerald-400'],
                  ['Ended', myShift?.shiftEnd?.toDate ? format(myShift.shiftEnd.toDate(), 'HH:mm') : '—', 'text-white'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-xl bg-white/[0.025] border border-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className={`text-sm font-semibold mt-1 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {shiftError && <p className="text-xs text-rose-400 mt-3">{shiftError}</p>}

              <div className="flex items-center gap-2 flex-wrap mt-4">
                {(!myShift || myShift.status === 'break') && (
                  <button
                    onClick={() => handleShiftAction('ready')}
                    disabled={shiftLoading || myShift?.status === 'ended'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Ready to Work</span>
                  </button>
                )}

                {myShift?.status === 'ready' && (
                  <button
                    onClick={() => handleShiftAction('break')}
                    disabled={shiftLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-sm font-medium transition-colors"
                  >
                    <Coffee className="w-4 h-4" />
                    <span>On Break</span>
                  </button>
                )}

                {myShift && myShift.status !== 'ended' && (
                  <button
                    onClick={() => handleShiftAction('ended')}
                    disabled={shiftLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    <span>End Shift</span>
                  </button>
                )}
              </div>
            </Panel>

            <Panel
              icon={TrendingUp}
              iconClass="text-cyan-400"
              title="Today · My performance"
              subtitle="Yerevan time · based on saved CRM outcomes"
              right={<span className="text-xs text-orange-300">🔥 {Number(myPerformance?.streak || 0)} day streak</span>}
            >
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  ['Called', Number(myPerformance?.called || 0), 'text-white'],
                  ['Answered', Number(myPerformance?.answered || 0), 'text-emerald-400'],
                  ['HP', Number(myPerformance?.statusCounts?.['High Potential'] || 0), 'text-violet-400'],
                  ['JOR', Number(myPerformance?.statusCounts?.JOR || 0), 'text-cyan-400'],
                  ['Answer %', `${Number(myPerformance?.answerRate || 0).toFixed(0)}%`, 'text-blue-400'],
                ].map(([label, value, color]: any) => (
                  <div key={label} className="rounded-xl bg-white/[0.025] border border-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className={`mt-1 text-lg font-bold ${color}`}>{myPerformanceLoading ? '…' : value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Daily goal</span>
                  <span>{Number(myPerformance?.called || 0)} / {Number(myPerformance?.dailyGoal || 50)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (Number(myPerformance?.called || 0) /
                          Math.max(1, Number(myPerformance?.dailyGoal || 50))) *
                          100
                      )}%`
                    }}
                  />
                </div>
              </div>
            </Panel>
          </div>

          <AgentFinancePanel />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Key numbers                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <SectionLabel>Overview</SectionLabel>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {primaryStats.map((stat) => (
            <button
              key={stat.name}
              type="button"
              onClick={stat.onClick}
              className="group relative overflow-hidden bg-[#0A0F1C] border border-white/5 rounded-2xl p-5 text-left hover:border-white/15 hover:bg-white/[0.02] transition-all"
            >
              <span className={`absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full ${stat.accent}`} />
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400">{stat.name}</p>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <span className="text-3xl font-semibold text-white tabular-nums tracking-tight">
                  {Number(stat.value || 0).toLocaleString()}
                </span>
                {stat.change !== undefined && timeRange !== 'all' && (
                  <span className={`text-[11px] font-semibold rounded-md px-1.5 py-0.5 ${
                    stat.change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                  }`}>
                    {stat.change >= 0 ? '+' : ''}{stat.change}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {secondaryStats.map((stat) => (
            <button
              key={stat.name}
              type="button"
              onClick={stat.onClick}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#0A0F1C] px-4 py-3 text-left hover:border-white/15 hover:bg-white/[0.02] transition-all"
            >
              <span className="flex items-center gap-2 min-w-0">
                <stat.icon className={`w-4 h-4 shrink-0 ${stat.color}`} />
                <span className="text-xs text-slate-400 truncate">{stat.name}</span>
              </span>
              <span className="text-base font-semibold text-white tabular-nums">{Number(stat.value).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Lead flow + what needs attention                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <SectionLabel>Leads</SectionLabel>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Panel
            className="xl:col-span-2"
            icon={CalendarDays}
            title="Daily Lead Flow"
            subtitle="Incoming leads per day"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={data.dailyFlow || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="label" stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff1a', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="count" name="Leads" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            icon={AlertTriangle}
            iconClass="text-amber-400"
            title="Needs Attention"
            subtitle="Click an item to open it"
          >
            {attentionItems.length > 0 ? (
              <div className="space-y-2">
                {attentionItems.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleCriticalAlertClick(item)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`w-1.5 h-8 rounded-full shrink-0 ${item.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white truncate">{item.label}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{item.detail}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`text-lg font-bold tabular-nums ${item.severity === 'high' ? 'text-rose-400' : 'text-amber-400'}`}>
                        {Number(item.count).toLocaleString()}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-48 flex flex-col items-center justify-center text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500/60 mb-3" />
                <p className="text-sm text-slate-400">All clear</p>
                <p className="text-xs text-slate-600 mt-1">Nothing needs attention right now.</p>
              </div>
            )}
          </Panel>
        </div>

        {/* Status distribution + attendance */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Panel
            className="xl:col-span-2"
            icon={PieChart}
            title="Leads by Status"
            subtitle={`${rangeLabel} · click a status to open those leads`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-center">
              <div className="relative h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <RePieChart>
                    <Pie
                      data={data.leadsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={88}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="status"
                      stroke="none"
                      onClick={(entry: any) => {
                        const status = entry?.status || entry?.payload?.status;
                        if (status) openStatusDrilldown(status);
                      }}
                      className="cursor-pointer"
                    >
                      {(data.leadsByStatus || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff1a', borderRadius: '8px', color: '#fff' }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-white tabular-nums">{Number(data.total || 0).toLocaleString()}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Leads</span>
                </div>
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {(data.leadsByStatus || []).map((status: any, index: number) => (
                  <button
                    key={status.status}
                    type="button"
                    onClick={() => openStatusDrilldown(status.status)}
                    className="w-full grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs text-slate-300 truncate">{status.status}</span>
                    </span>
                    <span className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(Number(status.count) / maxStatusCount) * 100}%`,
                          backgroundColor: COLORS[index % COLORS.length]
                        }}
                      />
                    </span>
                    <span className="text-right w-20">
                      <span className="text-xs font-semibold text-white tabular-nums">{Number(status.count).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500 ml-1.5">{Math.round((status.count / statusTotal) * 100)}%</span>
                    </span>
                  </button>
                ))}
                {(!data.leadsByStatus || data.leadsByStatus.length === 0) && (
                  <p className="py-8 text-center text-sm text-slate-500">No leads in this period.</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            icon={Clock3}
            iconClass="text-emerald-400"
            title="Attendance Today"
            subtitle={`${Number(attendance.totalAgents || 0)} visible agents`}
          >
            <div className="flex items-end gap-2">
              <span className="text-3xl font-semibold text-white tabular-nums">{Number(attendance.ready || 0)}</span>
              <span className="text-sm text-slate-500 mb-1">/ {Number(attendance.totalAgents || 0)} working now</span>
            </div>

            <div className="mt-4 h-2.5 w-full rounded-full bg-white/5 overflow-hidden flex">
              {attendanceSegments.map(seg => (
                <span
                  key={seg.label}
                  className={`h-full ${seg.bar}`}
                  style={{ width: `${(seg.value / attendanceTotal) * 100}%` }}
                />
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {attendanceSegments.map(seg => {
                const clickable = seg.label === 'Not Started' && seg.value > 0;
                return (
                  <button
                    key={seg.label}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && handleCriticalAlertClick({ type: 'shift-not-started' })}
                    className={`rounded-xl bg-white/[0.02] border border-white/5 p-3 text-left ${clickable ? 'hover:bg-white/[0.05] cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`text-xl font-bold tabular-nums ${seg.text}`}>{seg.value}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{seg.label}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* People: leaderboard + teams                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <SectionLabel>Performance</SectionLabel>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {isManagerView ? (
            <Panel
              className="xl:col-span-2"
              icon={Crown}
              iconClass="text-amber-400"
              title="Approved Revenue Leaderboard"
              subtitle="Approved Finance amounts only · split deposits count each agent's share"
              right={<span className="text-[10px] uppercase tracking-wider text-slate-500">{rangeLabel}</span>}
            >
              {(data.agentPerformance || []).length > 0 ? (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0A0F1C] z-10">
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                        <th className="pb-2.5 font-medium w-14">Rank</th>
                        <th className="pb-2.5 font-medium">Agent</th>
                        <th className="pb-2.5 font-medium hidden md:table-cell">Team</th>
                        <th className="pb-2.5 font-medium text-right">Approved</th>
                        <th className="pb-2.5 font-medium text-right">Deposits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(data.agentPerformance || []).map((agent: any, index: number) => {
                        const rank = index + 1;
                        const medal =
                          rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-500' : '';
                        return (
                          <tr key={agent.id} className={rank <= 3 ? 'bg-white/[0.015]' : ''}>
                            <td className="py-2.5">
                              {rank <= 3 ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-bold ${medal}`}>
                                  <Crown className="w-4 h-4" fill="currentColor" />#{rank}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-slate-500 pl-1">#{rank}</span>
                              )}
                            </td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={agent.avatar}
                                  alt=""
                                  className={`w-8 h-8 rounded-full object-cover shrink-0 ${rank === 1 ? 'ring-2 ring-amber-400/60' : ''}`}
                                />
                                <span className="text-sm text-white font-medium truncate">{agent.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-xs text-slate-400 hidden md:table-cell">{agent.teamName || '—'}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-sm font-bold tabular-nums ${rank === 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                ${Number(agent.approvedRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-sm text-slate-300 font-semibold tabular-nums">
                              {agent.approvedDepositCount || 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Crown className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No Agents available for this leaderboard.</p>
                </div>
              )}
            </Panel>
          ) : (
            <Panel
              className="xl:col-span-2"
              icon={TrendingUp}
              iconClass="text-emerald-400"
              title="Agent Operational Performance"
              subtitle={rangeLabel}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                      <th className="pb-2.5 font-medium">Agent</th>
                      <th className="pb-2.5 font-medium text-right">Leads</th>
                      <th className="pb-2.5 font-medium text-right">Deposit</th>
                      <th className="pb-2.5 font-medium text-right">High Pot.</th>
                      <th className="pb-2.5 font-medium text-right">Conv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(data.agentPerformance || []).slice(0, 8).map((agent: any) => (
                      <tr key={agent.id}>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <img src={agent.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                            <span className="text-sm text-white font-medium">{agent.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-sm text-slate-300 tabular-nums">{agent.total}</td>
                        <td className="py-2.5 text-right text-sm text-emerald-400 font-semibold tabular-nums">{agent.deposits}</td>
                        <td className="py-2.5 text-right text-sm text-cyan-400 tabular-nums">{agent.highPotential}</td>
                        <td className="py-2.5 text-right text-sm text-white font-semibold tabular-nums">{agent.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel
            icon={ShieldCheck}
            title="Team Performance"
            subtitle="Sorted by deposits"
          >
            <div className="space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
              {(data.teamPerformance || []).map((team: any) => (
                <div key={team.teamId} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{team.teamName}</p>
                      <p className="text-[11px] text-slate-500">{team.agents} agents · {Number(team.leads).toLocaleString()} leads</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-emerald-400 tabular-nums">{team.conversionRate}%</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">Conversion</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="text-slate-500">Deposits <b className="text-emerald-400 font-semibold">{team.deposits}</b></span>
                    <span className="text-slate-500">High Pot. <b className="text-cyan-400 font-semibold">{team.highPotential}</b></span>
                    <span className="text-slate-500">Lost <b className="text-rose-400 font-semibold">{team.lost}</b></span>
                  </div>
                </div>
              ))}

              {(!data.teamPerformance || data.teamPerformance.length === 0) && (
                <div className="py-10 text-center text-sm text-slate-500">No team performance data.</div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sources + recent activity                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <SectionLabel>Sources & Activity</SectionLabel>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Panel
            className="xl:col-span-2"
            icon={FolderOpen}
            iconClass="text-violet-400"
            title="Lead Source & File Analytics"
            subtitle="Click a source for file-level details"
          >
            <div className="space-y-1.5">
              {(data.sourceAnalytics || []).slice(0, 10).map((source: any, index: number) => (
                <button
                  key={source.source}
                  type="button"
                  onClick={() => {
                    setSelectedSource(source);
                    setSelectedFile(null);
                  }}
                  className="w-full grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span className="w-7 h-7 rounded-full bg-violet-500/10 text-violet-300 flex items-center justify-center text-[11px] font-bold">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white truncate">{source.source}</span>
                      <span className="text-[11px] text-slate-500 shrink-0">{source.files?.length || 0} files</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <span className={`block h-full rounded-full ${qualityBarClass(source.qualityScore)}`} style={{ width: `${source.qualityScore}%` }} />
                    </span>
                  </span>
                  <span className="flex items-center gap-4 pl-2">
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-white tabular-nums">{Number(source.count).toLocaleString()}</span>
                      <span className="block text-[9px] text-slate-500 uppercase">Leads</span>
                    </span>
                    <span className="text-right w-10">
                      <span className={`block text-sm font-semibold tabular-nums ${qualityClass(source.qualityScore)}`}>{source.qualityScore}</span>
                      <span className="block text-[9px] text-slate-500 uppercase">Quality</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </span>
                </button>
              ))}
              {(!data.sourceAnalytics || data.sourceAnalytics.length === 0) && (
                <p className="py-8 text-center text-sm text-slate-500">No source data in this period.</p>
              )}
            </div>
          </Panel>

          <Panel
            icon={Activity}
            title="Recent CRM Activity"
            subtitle="Latest 10 actions"
          >
            <div className="relative max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
              {(data.recentActivity || []).length > 0 ? (
                <ol className="relative border-l border-white/10 ml-2 space-y-4">
                  {data.recentActivity.map((activity: any) => (
                    <li key={activity.id} className="pl-4 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500/80 ring-4 ring-[#0A0F1C]" />
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-white min-w-0">
                          <span className="font-semibold text-blue-400">{activity.userName}</span>
                          <span className="ml-1 text-slate-400">{activity.action}</span>
                        </p>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0 mt-0.5">
                          {activity.createdAt?.toDate ? format(activity.createdAt.toDate(), 'HH:mm') : 'Just now'}
                        </span>
                      </div>
                      {activity.details && <p className="text-xs text-slate-500 mt-0.5 break-words">{activity.details}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-center py-10 text-slate-500 text-sm">No recent activity recorded.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modals (unchanged behaviour)                                       */}
      {/* ------------------------------------------------------------------ */}
      {alertDetail && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden bg-[#0A0F1C] border border-white/10 rounded-2xl shadow-2xl flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold text-white">{alertDetail.title}</h2><p className="text-xs text-slate-500 mt-1">{alertDetail.subtitle}</p></div>
              <button onClick={() => setAlertDetail(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-4 space-y-2">
              {(alertDetail.rows || []).length > 0 ? alertDetail.rows.map((row: any) => (
                <div key={row.id || row.email || row.name} className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                  <div className="min-w-0"><p className="text-sm font-semibold text-white truncate">{row.name || row.email || 'User'}</p><p className="text-xs text-slate-500 truncate">{row.email || 'No email'}</p></div>
                  <div className="text-right shrink-0"><p className="text-xs text-slate-300">{row.teamName || 'No Team'}</p>{row.role && <p className="text-[10px] text-violet-400 mt-1">{row.role}</p>}</div>
                </div>
              )) : <div className="py-12 text-center text-sm text-slate-500">No matching records.</div>}
            </div>
          </div>
        </div>
      )}

      {selectedSource && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-2xl bg-[#0A0F1C] border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">Lead Analytics</p>
                <h3 className="text-xl font-semibold text-white mt-1">
                  {selectedFile ? selectedFile.fileName : selectedSource.source}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedFile
                    ? `${selectedFile.count} leads in this file`
                    : `${selectedSource.count} leads • ${selectedSource.files?.length || 0} files`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedSource(null);
                  setSelectedFile(null);
                }}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(88vh-90px)] custom-scrollbar">
              {selectedFile ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-blue-400 hover:text-blue-300 mb-5"
                  >
                    ← Back to files
                  </button>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-2xl font-bold text-white">{selectedFile.count}</div>
                      <div className="text-xs text-slate-500 mt-1">Total Leads</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className={`text-2xl font-bold ${qualityClass(selectedFile.qualityScore)}`}>
                        {selectedFile.qualityScore}/100
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Quality Score</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(selectedFile.statuses || []).map((status: any) => (
                      <div key={status.status} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-300">{status.status}</span>
                          <span className="text-lg font-bold text-white">{status.count}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {Math.round((status.count / Math.max(1, selectedFile.count)) * 100)}% of file
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-2xl font-bold text-white">{selectedSource.count}</div>
                      <div className="text-xs text-slate-500 mt-1">Total Leads</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className={`text-2xl font-bold ${qualityClass(selectedSource.qualityScore)}`}>
                        {selectedSource.qualityScore}/100
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Source Quality</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(selectedSource.files || []).map((file: any) => (
                      <button
                        key={file.fileName}
                        type="button"
                        onClick={() => setSelectedFile(file)}
                        className="w-full rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] p-4 flex items-center justify-between text-left transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{file.fileName}</p>
                          <p className="text-xs text-slate-500 mt-1">{file.count} leads</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-sm font-bold ${qualityClass(file.qualityScore)}`}>
                              {file.qualityScore}/100
                            </div>
                            <div className="text-[9px] text-slate-500">Quality</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
