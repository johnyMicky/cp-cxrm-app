import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, CheckCircle, XCircle, Activity, BarChart3, PieChart, ShieldCheck, ShieldAlert, MessageSquare, Coffee, PlayCircle, Square, Clock3, AlertTriangle, PhoneCall, UserX, Flame, Timer, FolderOpen, ChevronRight, TrendingUp, Target, CalendarDays, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie } from 'recharts';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';
import { chatService } from '../services/chatService';
import AgentFinancePanel from '../components/AgentFinancePanel';

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

    if (alert.type === 'shift-not-started') {
      setAlertDetail({ title: 'Shift Not Started', subtitle: 'Agents without a shift record for today.', rows: data?.attendance?.notStartedAgents || [] });
      return;
    }

    if (alert.type === 'user-config') {
      setAlertDetail({ title: 'User Configuration', subtitle: 'Users with undefined or missing CRM roles.', rows: data?.misconfiguredUserDetails || [] });
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const sessionUser = {
        id: localStorage.getItem('userId'),
        role: localStorage.getItem('userRole')
      };

      // getDashboardStats already resolves the fresh Firestore user record.
      // Avoid a duplicate user read on every Dashboard/time-range load.
      const body = await firestoreService.getDashboardStats(sessionUser, timeRange);
      setData(body);
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

  const loadMyShift = async () => {
    if (currentUserRole !== 'Agent' || !currentUserId) return;
    try {
      const shift = await firestoreService.getTodayShift(currentUserId);
      setMyShift(shift);
    } catch (err) {
      console.error('Failed to load shift:', err);
    }
  };

  const handleShiftAction = async (status: 'ready' | 'break' | 'ended') => {
    if (!currentUserId) return;

    try {
      setShiftLoading(true);
      setShiftError('');
      const shift = await firestoreService.setWorkStatus(currentUserId, status);
      setMyShift(shift);
      loadData();
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
      // The chat is created/touched first, so it appears at the top of the chat list.
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

  useEffect(() => {
    loadData();
  }, [timeRange]);

  useEffect(() => {
    loadMyShift();

    if (currentUserRole !== 'Agent') return;

    const interval = setInterval(loadMyShift, 30000);
    return () => clearInterval(interval);
  }, [currentUserId, currentUserRole]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-8 max-w-2xl mx-auto text-left">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="w-8 h-8 text-rose-500" />
            <h2 className="text-xl font-semibold text-white">Dashboard Error</h2>
          </div>
          <p className="text-slate-300 font-medium mb-2">{error}</p>
          {data?.details && (
            <div className="bg-black/40 rounded-lg p-4 mb-6 font-mono text-xs text-rose-300 overflow-auto max-h-48 border border-rose-500/10">
              {data.details}
            </div>
          )}
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

  if (!data || isLoading) return <div className="p-8 text-slate-400 animate-pulse">Loading dashboard...</div>;

  const stats = [
    { name: 'Total Leads', value: data.total, change: data.totalChange, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', onClick: () => openLeadDrilldown({ view: 'all', range: timeRange }) },
    { name: 'New Today', value: data.newToday, icon: UserPlus, color: 'text-emerald-500', bg: 'bg-emerald-500/10', onClick: () => openLeadDrilldown({ view: 'new-today' }) },
    { name: 'Active Leads', value: data.active, change: data.activeChange, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10', onClick: () => openLeadDrilldown({ view: 'active', range: timeRange }) },
    { name: 'Deposits', value: data.converted, change: data.convertedChange, icon: CheckCircle, color: 'text-cyan-500', bg: 'bg-cyan-500/10', onClick: () => openStatusDrilldown('Deposit') },
    { name: 'High Potential', value: data.highPotential || 0, icon: Flame, color: 'text-emerald-400', bg: 'bg-emerald-500/10', onClick: () => openStatusDrilldown('High Potential') },
    { name: 'JOR', value: data.jor || 0, icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-500/10', onClick: () => openStatusDrilldown('JOR') },
    { name: 'Callbacks Today', value: data.callbacksToday || 0, icon: PhoneCall, color: 'text-violet-400', bg: 'bg-violet-500/10', onClick: () => openLeadDrilldown({ view: 'callbacks-today' }) },
    { name: 'Unassigned', value: data.unassigned || 0, icon: UserX, color: 'text-rose-400', bg: 'bg-rose-500/10', onClick: () => openLeadDrilldown({ view: 'unassigned' }) },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time operational metrics and team performance.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
            {[
              { id: '1d', label: '1D' },
              { id: '1w', label: '1W' },
              { id: '1m', label: '1M' },
              { id: 'all', label: 'All' },
            ].map((range) => (
              <button
                key={range.id}
                onClick={() => setTimeRange(range.id as any)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
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
            onClick={handleGenerateReport}
            className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-blue-500/20"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {currentUserRole === 'Agent' && <AgentFinancePanel />}

      {currentUserRole === 'Agent' && (
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center space-x-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                myShift?.status === 'ready'
                  ? 'bg-emerald-500/10'
                  : myShift?.status === 'break'
                    ? 'bg-amber-500/10'
                    : myShift?.status === 'ended'
                      ? 'bg-slate-500/10'
                      : 'bg-blue-500/10'
              }`}>
                {myShift?.status === 'break' ? (
                  <Coffee className="w-6 h-6 text-amber-400" />
                ) : myShift?.status === 'ended' ? (
                  <Square className="w-6 h-6 text-slate-400" />
                ) : (
                  <PlayCircle className={`w-6 h-6 ${myShift?.status === 'ready' ? 'text-emerald-400' : 'text-blue-400'}`} />
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">My Shift</p>
                <h3 className="text-lg font-semibold text-white mt-1">
                  {!myShift
                    ? 'Not Started'
                    : myShift.status === 'ready'
                      ? 'Ready to Work'
                      : myShift.status === 'break'
                        ? 'On Break'
                        : 'Shift Ended'}
                </h3>
                {shiftError && <p className="text-xs text-rose-400 mt-1">{shiftError}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 lg:max-w-2xl">
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Started</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {myShift?.shiftStart?.toDate ? format(myShift.shiftStart.toDate(), 'HH:mm') : '—'}
                </p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Break Total</p>
                <p className="text-sm font-semibold text-amber-400 mt-1">{formatDuration(calculateBreakMs(myShift))}</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Work Time</p>
                <p className="text-sm font-semibold text-emerald-400 mt-1">{formatDuration(calculateWorkedMs(myShift))}</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Ended</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {myShift?.shiftEnd?.toDate ? format(myShift.shiftEnd.toDate(), 'HH:mm') : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {(!myShift || myShift.status === 'break') && (
                <button
                  onClick={() => handleShiftAction('ready')}
                  disabled={shiftLoading || myShift?.status === 'ended'}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>Ready to Work</span>
                </button>
              )}

              {myShift?.status === 'ready' && (
                <button
                  onClick={() => handleShiftAction('break')}
                  disabled={shiftLoading}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-sm font-medium transition-colors"
                >
                  <Coffee className="w-4 h-4" />
                  <span>On Break</span>
                </button>
              )}

              {myShift && myShift.status !== 'ended' && (
                <button
                  onClick={() => handleShiftAction('ended')}
                  disabled={shiftLoading}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-colors"
                >
                  <Square className="w-4 h-4" />
                  <span>End Shift</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        {stats.map((stat) => (
          <button key={stat.name} type="button" onClick={stat.onClick} className="bg-[#0A0F1C] border border-white/5 rounded-xl p-4 shadow-sm text-left hover:border-blue-500/25 hover:bg-white/[0.02] transition-all">
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} />
              </div>
              {stat.change !== undefined && timeRange !== 'all' && (
                <div className={`text-[10px] font-bold ${stat.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {stat.change >= 0 ? '+' : ''}{stat.change}%
                </div>
              )}
            </div>
            <h3 className="text-2xl font-semibold text-white mt-4">{stat.value}</h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">{stat.name}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-500" />
              Leads by Status
            </h3>
            <span className="text-xs text-slate-500">Normalized status names</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <RePieChart>
                  <Pie
                    data={data.leadsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="status"
                    onClick={(entry: any) => {
                      const status = entry?.status || entry?.payload?.status;
                      if (status) openStatusDrilldown(status);
                    }}
                    className="cursor-pointer"
                  >
                    {data.leadsByStatus.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff10', borderRadius: '8px', color: '#fff' }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {data.leadsByStatus.map((status: any, index: number) => (
                <button key={status.status} type="button" onClick={() => openStatusDrilldown(status.status)} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-blue-500/20 transition-colors text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[11px] text-slate-300 font-medium truncate">{status.status}</span>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-xs font-bold text-white">{status.count}</div>
                    <div className="text-[9px] text-slate-500">{Math.round((status.count / Math.max(1, data.total)) * 100)}%</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-5 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Critical Alerts
          </h3>

          <div className="space-y-3">
            {(data.criticalAlerts || []).map((alert: any) => (
              <button key={alert.type} type="button" onClick={() => handleCriticalAlertClick(alert)} className={`w-full rounded-xl border p-3 text-left hover:brightness-110 transition-all ${
                  alert.severity === 'high'
                    ? 'bg-rose-500/5 border-rose-500/20'
                    : 'bg-amber-500/5 border-amber-500/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{alert.label}</span>
                  <span className={`text-lg font-bold ${alert.severity === 'high' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {alert.count}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{alert.detail}</p>
              </button>
            ))}

            {(!data.criticalAlerts || data.criticalAlerts.length === 0) && (
              <div className="py-10 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No critical operational alerts.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-400" />
              Daily Lead Flow
            </h3>
            <span className="text-xs text-slate-500">Recent incoming leads</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={data.dailyFlow || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="label" stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff10', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="count" name="Leads" fill="#3b82f6" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-5 flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-emerald-400" />
            Attendance Today
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['Ready', data.attendance?.ready || 0, 'text-emerald-400'],
              ['On Break', data.attendance?.break || 0, 'text-amber-400'],
              ['Ended', data.attendance?.ended || 0, 'text-slate-300'],
              ['Not Started', data.attendance?.notStarted || 0, 'text-rose-400'],
            ].map(([label, value, color]: any) => (
              <div key={label} className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Visible Agents</span>
            <span className="text-sm font-bold text-white">{data.attendance?.totalAgents || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Agent Operational Performance
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Revenue ranking comes with Finance</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium text-right">Leads</th>
                  <th className="pb-3 font-medium text-right">Deposit</th>
                  <th className="pb-3 font-medium text-right">High Pot.</th>
                  <th className="pb-3 font-medium text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data.agentPerformance || []).slice(0, 8).map((agent: any) => (
                  <tr key={agent.id}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <img src={agent.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                        <span className="text-sm text-white font-medium">{agent.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-sm text-slate-300">{agent.total}</td>
                    <td className="py-3 text-right text-sm text-emerald-400 font-semibold">{agent.deposits}</td>
                    <td className="py-3 text-right text-sm text-cyan-400">{agent.highPotential}</td>
                    <td className="py-3 text-right text-sm text-white font-semibold">{agent.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2 text-[11px] text-blue-300">
            Finance module will replace this ranking with revenue, average deposit, commission and net contribution.
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-5 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            Team Performance
          </h3>

          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
            {(data.teamPerformance || []).map((team: any) => (
              <div key={team.teamId} className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{team.teamName}</p>
                    <p className="text-[11px] text-slate-500">{team.agents} Agents • {team.leads} Leads</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-400">{team.conversionRate}%</div>
                    <div className="text-[9px] text-slate-500 uppercase">Conversion</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg bg-white/[0.02] p-2">
                    <div className="text-sm font-bold text-emerald-400">{team.deposits}</div>
                    <div className="text-[9px] text-slate-500">Deposits</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] p-2">
                    <div className="text-sm font-bold text-cyan-400">{team.highPotential}</div>
                    <div className="text-[9px] text-slate-500">High Pot.</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] p-2">
                    <div className="text-sm font-bold text-rose-400">{team.lost}</div>
                    <div className="text-[9px] text-slate-500">Lost</div>
                  </div>
                </div>
              </div>
            ))}

            {(!data.teamPerformance || data.teamPerformance.length === 0) && (
              <div className="py-10 text-center text-sm text-slate-500">No team performance data.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-violet-400" />
              Lead Source & File Analytics
            </h3>
            <span className="text-xs text-slate-500">Click a source for drill-down</span>
          </div>

          <div className="space-y-2">
            {(data.sourceAnalytics || []).slice(0, 10).map((source: any, index: number) => (
              <button
                key={source.source}
                type="button"
                onClick={() => {
                  setSelectedSource(source);
                  setSelectedFile(null);
                }}
                className="w-full flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] p-3 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-violet-500/10 text-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{source.source}</p>
                    <p className="text-[11px] text-slate-500">{source.files?.length || 0} files</p>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{source.count}</div>
                    <div className="text-[9px] text-slate-500">Leads</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${
                      source.qualityScore >= 60 ? 'text-emerald-400' :
                      source.qualityScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {source.qualityScore}
                    </div>
                    <div className="text-[9px] text-slate-500">Quality</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-5 flex items-center gap-2">
            <Timer className="w-5 h-5 text-amber-400" />
            Lead Health
          </h3>

          <div className="space-y-3">
            <button type="button" onClick={() => openLeadDrilldown({ view: 'untouched24h' })} className="w-full flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 p-4 hover:bg-white/[0.05] transition-colors">
              <span className="text-sm text-slate-400">Untouched 24h+</span>
              <span className="text-xl font-bold text-amber-400">{data.untouched24h || 0}</span>
            </button>
            <button type="button" onClick={() => openLeadDrilldown({ view: 'stale7d' })} className="w-full flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 p-4 hover:bg-white/[0.05] transition-colors">
              <span className="text-sm text-slate-400">Stale 7d+</span>
              <span className="text-xl font-bold text-rose-400">{data.stale7d || 0}</span>
            </button>
            <button type="button" onClick={() => openLeadDrilldown({ view: 'overdue-callbacks' })} className="w-full flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 p-4 hover:bg-white/[0.05] transition-colors">
              <span className="text-sm text-slate-400">Overdue Callbacks</span>
              <span className="text-xl font-bold text-rose-400">{data.overdueCallbacks || 0}</span>
            </button>
            <button type="button" onClick={() => setAlertDetail({ title: 'Undefined Roles', subtitle: 'Users with undefined or missing CRM roles.', rows: data.misconfiguredUserDetails || [] })} className="w-full flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 p-4 hover:bg-white/[0.05] transition-colors">
              <span className="text-sm text-slate-400">Undefined Roles</span>
              <span className="text-xl font-bold text-violet-400">{data.misconfiguredUsers || 0}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
          <Activity className="w-5 h-5 text-blue-500" />
          <span>Recent CRM Activity</span>
        </h3>
        <div className="space-y-4">
          {data.recentActivity?.map((activity: any) => (
            <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-colors">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-white">
                    <span className="font-semibold text-blue-400">{activity.userName}</span>
                    <span className="mx-1 text-slate-400">{activity.action}</span>
                  </p>
                  <p className="text-xs text-slate-500">{activity.details}</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {activity.createdAt?.toDate ? format(activity.createdAt.toDate(), 'HH:mm') : 'Just now'}
              </span>
            </div>
          ))}
          {(!data.recentActivity || data.recentActivity.length === 0) && (
            <p className="text-center py-8 text-slate-500 text-sm italic">No recent activity recorded.</p>
          )}
        </div>
      </div>
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
                      <div className={`text-2xl font-bold ${
                        selectedFile.qualityScore >= 60 ? 'text-emerald-400' :
                        selectedFile.qualityScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
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
                      <div className={`text-2xl font-bold ${
                        selectedSource.qualityScore >= 60 ? 'text-emerald-400' :
                        selectedSource.qualityScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
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
                            <div className={`text-sm font-bold ${
                              file.qualityScore >= 60 ? 'text-emerald-400' :
                              file.qualityScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
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
