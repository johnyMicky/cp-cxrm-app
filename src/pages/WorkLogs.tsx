import { Fragment, useEffect, useState } from 'react';
import { Clock3, Coffee, PlayCircle, Square, RefreshCw, Users } from 'lucide-react';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';

export default function WorkLogs() {
  const currentUser = {
    id: localStorage.getItem('userId') || '',
    role: localStorage.getItem('userRole') || 'Agent'
  };

  const [dateKey, setDateKey] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [rows, setRows] = useState<any[]>([]);
  const [events, setEvents] = useState<Record<string, any[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const toDate = (value: any) => {
    if (!value) return null;
    return value?.toDate ? value.toDate() : new Date(value);
  };

  const formatDuration = (ms: number) => {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const breakMs = (shift: any) => {
    if (!shift) return 0;
    let total = Number(shift.totalBreakMs || 0);

    if (shift.status === 'break' && shift.currentBreakStart) {
      const start = toDate(shift.currentBreakStart);
      if (start) total += Math.max(0, Date.now() - start.getTime());
    }

    return total;
  };

  const workMs = (shift: any) => {
    if (!shift?.shiftStart) return 0;

    const start = toDate(shift.shiftStart);
    const end = shift.shiftEnd ? toDate(shift.shiftEnd) : new Date();
    if (!start || !end) return 0;

    return Math.max(0, end.getTime() - start.getTime() - breakMs(shift));
  };

  const loadRows = async () => {
    try {
      setLoading(true);
      const data = await firestoreService.getWorkLogs(currentUser, dateKey);
      setRows(data);
    } catch (err) {
      console.error('Failed to load work logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEvents = async (userId: string) => {
    if (expanded === userId) {
      setExpanded(null);
      return;
    }

    if (!events[userId]) {
      const data = await firestoreService.getShiftEvents(userId, dateKey);
      setEvents(prev => ({ ...prev, [userId]: data }));
    }

    setExpanded(userId);
  };

  useEffect(() => {
    loadRows();
    setExpanded(null);
    setEvents({});
  }, [dateKey]);

  if (!['Administrator', 'Manager', 'Team Leader', 'Financial Manager'].includes(currentUser.role)) {
    return (
      <div className="p-8 text-slate-400">
        You do not have permission to view Work Logs.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Work Logs</h1>
          <p className="text-sm text-slate-400 mt-1">
            Shift start, breaks, work time and end-of-shift history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className="bg-[#0A0F1C] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            onClick={loadRows}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Agent</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Start</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Break Total</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Work Time</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500">End Shift</th>
                <th className="px-5 py-4 text-xs uppercase tracking-wider text-slate-500 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map(({ user, shift }) => (
                <Fragment key={user.id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.teamName || 'No Team'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        shift?.status === 'ready'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : shift?.status === 'break'
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                            : shift?.status === 'ended'
                              ? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
                              : 'text-slate-500 bg-white/5 border-white/10'
                      }`}>
                        {shift?.status === 'ready' ? <PlayCircle className="w-3 h-3" /> :
                         shift?.status === 'break' ? <Coffee className="w-3 h-3" /> :
                         <Square className="w-3 h-3" />}
                        {shift?.status === 'ready'
                          ? 'Ready to Work'
                          : shift?.status === 'break'
                            ? 'On Break'
                            : shift?.status === 'ended'
                              ? 'Ended'
                              : 'Not Started'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">
                      {shift?.shiftStart ? format(toDate(shift.shiftStart)!, 'HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-amber-400">
                      {shift ? formatDuration(breakMs(shift)) : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-emerald-400">
                      {shift ? formatDuration(workMs(shift)) : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">
                      {shift?.shiftEnd ? format(toDate(shift.shiftEnd)!, 'HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => toggleEvents(user.id)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {expanded === user.id ? 'Hide Timeline' : 'View Timeline'}
                      </button>
                    </td>
                  </tr>

                  {expanded === user.id && (
                    <tr key={`${user.id}-events`}>
                      <td colSpan={7} className="px-5 py-4 bg-black/20">
                        <div className="space-y-2 max-w-2xl">
                          {(events[user.id] || []).map((event: any) => (
                            <div key={event.id} className="flex items-center gap-3 text-sm">
                              <Clock3 className="w-4 h-4 text-slate-500" />
                              <span className="w-14 text-slate-400">
                                {event.createdAt?.toDate ? format(event.createdAt.toDate(), 'HH:mm') : '—'}
                              </span>
                              <span className="text-white">
                                {event.type === 'ready'
                                  ? 'Ready to Work'
                                  : event.type === 'break'
                                    ? 'On Break'
                                    : 'End Shift'}
                              </span>
                            </div>
                          ))}

                          {(!events[user.id] || events[user.id].length === 0) && (
                            <p className="text-sm text-slate-500 italic">No events recorded for this date.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    No agents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-10 text-center text-slate-500">Loading work logs...</div>
        )}
      </div>
    </div>
  );
}
