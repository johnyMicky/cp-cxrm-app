import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search, ArrowRight, CheckCircle2, Phone, Mail, MapPin, User, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';
import { safeLower } from '../utils/stringUtils';

export default function JOR() {
  const [leads, setLeads] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const sessionUser = {
          id: localStorage.getItem('userId'),
          role: localStorage.getItem('userRole') || 'Agent'
        };

        const [visibleLeads, usersData] = await Promise.all([
          firestoreService.getLeadsForUser(sessionUser),
          firestoreService.getUsers()
        ]);

        if (!mounted) return;

        setLeads((visibleLeads as any[]).filter((lead: any) => lead.status === 'JOR'));
        setUsers(usersData as any[]);
      } catch (err) {
        console.error('JOR Page Load Error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user: any) => {
      map.set(String(user.id), user.name || user.email || 'Unknown User');
    });
    return map;
  }, [users]);

  const filteredLeads = useMemo(() => {
    const q = safeLower(deferredSearch);

    if (!q) return leads;

    return leads.filter((lead: any) =>
      safeLower(lead.name).includes(q) ||
      safeLower(lead.email).includes(q) ||
      safeLower(lead.phone).includes(q) ||
      safeLower(lead.country).includes(q) ||
      safeLower(lead.source).includes(q) ||
      safeLower(userNameById.get(String(lead.assigned_to || '')) || '').includes(q)
    );
  }, [leads, deferredSearch, userNameById]);

  const formatDate = (value: any) => {
    if (!value) return '—';

    try {
      const date = value?.toDate ? value.toDate() : new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : format(date, 'MMM d, yyyy HH:mm');
    } catch {
      return '—';
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-400 animate-pulse">Loading JOR leads...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">JOR</h1>
              <p className="text-sm text-slate-400 mt-1">
                All leads in your permitted scope with JOR status.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-6 py-3">
          <p className="text-2xl font-bold text-white leading-none">{leads.length}</p>
          <p className="text-xs text-cyan-400 uppercase tracking-wider font-bold mt-1">JOR Total</p>
        </div>
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-white/5 bg-white/[0.02]">
          <div className="relative w-full max-w-xl">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search JOR leads by name, phone, email, country, source or agent..."
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned To</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {filteredLeads.map((lead: any) => (
                <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span className="text-sm font-medium text-white">{lead.name || 'Unnamed Lead'}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{lead.phone || '—'}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>{lead.email || '—'}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{lead.country || '—'}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-400">{lead.source || '—'}</td>

                  <td className="px-5 py-4 text-sm text-slate-300">
                    {userNameById.get(String(lead.assigned_to || '')) || 'Unassigned'}
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDate(lead.createdAt)}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      JOR
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/leads/${lead.id}`}
                      className="inline-flex items-center space-x-2 text-slate-500 hover:text-cyan-400 transition-colors"
                    >
                      <span className="text-xs font-medium">View Full Lead</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}

              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center text-slate-500">
                    No JOR leads found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
