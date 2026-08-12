import { useEffect, useState } from 'react';
import { Users, UserPlus, CheckCircle, XCircle, Activity, BarChart3, PieChart, ShieldCheck, ShieldAlert, MessageSquare, Coffee, PlayCircle, Square, Clock3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie } from 'recharts';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';
import { chatService } from '../services/chatService';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'1d' | '1w' | '1m' | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

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
    { name: 'Total Leads', value: data.total, change: data.totalChange, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'New Today', value: data.newToday, icon: UserPlus, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'Active Leads', value: data.active, change: data.activeChange, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'Converted', value: data.converted, change: data.convertedChange, icon: CheckCircle, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { name: 'Lost / No Pot.', value: data.lost, change: data.lostChange, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { name: 'Duplicates', value: data.duplicates, icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-500/10' },
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

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              {stat.change !== undefined && timeRange !== 'all' && (
                <div className="flex flex-col items-end">
                  <div className={`flex items-center text-[10px] font-bold ${stat.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {stat.change >= 0 ? '+' : ''}{stat.change}%
                  </div>
                  <span className="text-[8px] text-slate-500 uppercase font-medium">Growth</span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-semibold text-white">{stat.value}</h3>
              <p className="text-sm text-slate-400 mt-1 font-medium">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
            <PieChart className="w-5 h-5 text-blue-500" />
            <span>Leads by Status</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <RePieChart>
                <Pie
                  data={data.leadsByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="status"
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
          <div className="grid grid-cols-2 gap-2 mt-4">
            {data.leadsByStatus.map((status: any, index: number) => (
              <div key={status.status} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{status.status}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-white">{status.count}</span>
                  <span className="text-[9px] text-slate-500">{Math.round((status.count / data.total) * 100) || 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          {currentUserRole === 'Team Leader' ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-white flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <span>My Team Agents</span>
                </h3>
                <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                  {data.teamMembers?.length || 0} Agents
                </span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {(data.teamMembers || []).map((agent: any) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={agent.avatar}
                          alt={agent.name}
                          className="w-10 h-10 rounded-full object-cover border border-white/10"
                        />
                        <span
                          className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-[#0A0F1C] ${
                            agent.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}
                          title={agent.isOnline ? 'Online' : 'Offline'}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{agent.name}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                            agent.shift?.status === 'ready'
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                              : agent.shift?.status === 'break'
                                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                : agent.shift?.status === 'ended'
                                  ? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
                                  : 'text-slate-500 bg-white/5 border-white/10'
                          }`}>
                            {agent.shift?.status === 'ready'
                              ? 'Ready'
                              : agent.shift?.status === 'break'
                                ? 'Break'
                                : agent.shift?.status === 'ended'
                                  ? 'Ended'
                                  : 'Not Started'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{agent.email || 'No email'}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleMessageAgent(agent)}
                      disabled={openingChatUserId === agent.id}
                      className="ml-3 inline-flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 text-xs font-medium transition-all disabled:opacity-50"
                      title={`Message ${agent.name}`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{openingChatUserId === agent.id ? 'Opening...' : 'Message'}</span>
                    </button>
                  </div>
                ))}

                {(!data.teamMembers || data.teamMembers.length === 0) && (
                  <div className="py-10 text-center">
                    <Users className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No agents assigned to your team.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <span>Team Roles</span>
              </h3>
              <div className="space-y-4">
                {data.usersByRole.map((role: any, index: number) => (
                  <div key={role.role} className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white capitalize">{role.role}</p>
                        <p className="text-xs text-slate-500">Total Members</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-white">{role.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6">Top Agent Workload</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={data.workload} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff10', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="new_leads" name="New" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                <Bar dataKey="in_progress" name="In Progress" stackId="a" fill="#f59e0b" />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6">Top Lead Sources</h3>
          <div className="space-y-4">
            {data.topSources.map((source: any, i: number) => (
              <div key={source.source} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-medium text-slate-300">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-200">{source.source}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold text-white">{source.count}</span>
                  <span className="text-[10px] text-slate-500">{Math.round((source.count / data.total) * 100) || 0}%</span>
                </div>
              </div>
            ))}
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
    </div>
  );
}
