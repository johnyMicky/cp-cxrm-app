import { useEffect, useState } from 'react';
import { XCircle, ShieldAlert, Search, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Lost() {
  const [leads, setLeads] = useState<any[]>([]);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [leadsRes, dashboardRes] = await Promise.all([
          fetch('/api/leads'),
          fetch('/api/dashboard')
        ]);

        if (!leadsRes.ok || !dashboardRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const leadsData = await leadsRes.json();
        const dashboardData = await dashboardRes.json();

        setLeads(leadsData.filter((l: any) => l.status === 'Lost' || l.status === 'Underage' || l.status === 'No Experience'));
        setDuplicatesCount(dashboardData.duplicates || 0);
        setLoading(false);
      } catch (err) {
        console.error('Lost Page Load Error:', err);
      }
    };

    loadData();
  }, []);

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(search.toLowerCase()) ||
    (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
    (lead.phone && lead.phone.includes(search))
  );

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Loading lost leads...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Lost Leads & Duplicates</h1>
          <p className="text-sm text-slate-400 mt-1">Review lost opportunities and system duplicates.</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-6 py-3 flex items-center space-x-4">
            <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-rose-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white leading-none">{leads.length}</p>
              <p className="text-xs text-rose-400 uppercase tracking-wider font-bold mt-1">Lost Total</p>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-6 py-3 flex items-center space-x-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white leading-none">{duplicatesCount}</p>
              <p className="text-xs text-amber-400 uppercase tracking-wider font-bold mt-1">Duplicates in DB</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search lost leads..." 
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead Info</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-white">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.phone || lead.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{lead.source}</td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      to={`/leads/${lead.id}`}
                      className="inline-flex items-center space-x-2 text-slate-500 hover:text-blue-400 transition-colors"
                    >
                      <span className="text-xs font-medium">View</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No lost leads found matching your search.
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
