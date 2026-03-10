import { useEffect, useState } from 'react';
import { Users, Filter, CheckSquare, Square, ArrowRightLeft, RefreshCw } from 'lucide-react';

export default function Dispatcher() {
  const [leads, setLeads] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);
  const [isDistributing, setIsDistributing] = useState(false);
  
  const currentUser = { role: window.localStorage.getItem('userRole') || 'Administrator' };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    fetch('/api/leads')
      .then(res => res.json())
      .then(data => setLeads(data.filter((l: any) => l.status === 'New' || l.assigned_to === null)));
      
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.filter((u: any) => ['Agent', 'Team Leader', 'Manager'].includes(u.role))));
  };

  const handleSelectLead = (id: number) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const handleSelectAllLeads = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(l => l.id));
    }
  };

  const handleSelectAgent = (id: number) => {
    setSelectedAgents(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleDistribute = async () => {
    if (selectedLeads.length === 0 || selectedAgents.length === 0) return;
    
    setIsDistributing(true);
    await fetch('/api/leads/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: selectedLeads,
        agent_ids: selectedAgents,
        user_id: 1 // Admin user
      })
    });
    
    setSelectedLeads([]);
    setSelectedAgents([]);
    fetchData();
    setIsDistributing(false);
  };

  if (currentUser.role !== 'Administrator' && currentUser.role !== 'Manager') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl text-white">Access Denied</h1>
        <p className="text-slate-400">You do not have permission to access the Dispatcher.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Lead Dispatcher</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time desk view for assigning and distributing leads.</p>
        </div>
        <button 
          onClick={fetchData}
          className="shimmer-btn p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 bg-[#0A0F1C] rounded-xl border border-white/5 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-medium text-white">Unassigned & New Leads</h3>
              <span className="bg-blue-500/20 text-blue-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                {leads.length} available
              </span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>{selectedLeads.length} selected</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 w-10">
                    <button onClick={handleSelectAllLeads} className="text-slate-500 hover:text-white transition-colors">
                      {selectedLeads.length === leads.length && leads.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-blue-500" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead Details</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${selectedLeads.includes(lead.id) ? 'bg-blue-500/5' : ''}`}
                    onClick={() => handleSelectLead(lead.id)}
                  >
                    <td className="px-4 py-3">
                      {selectedLeads.includes(lead.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-500" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-600" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{lead.name}</div>
                      <div className="text-xs text-slate-500">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{lead.source}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{lead.country}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No new or unassigned leads available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0A0F1C] rounded-xl border border-white/5 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-sm font-medium text-white">Select Agents for Distribution</h3>
            <p className="text-xs text-slate-400 mt-1">Choose agents to receive the selected leads.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {users.map((user) => (
              <div 
                key={user.id}
                onClick={() => handleSelectAgent(user.id)}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedAgents.includes(user.id) 
                    ? 'bg-blue-500/10 border-blue-500/30' 
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-white">{user.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                  </div>
                </div>
                {selectedAgents.includes(user.id) ? (
                  <CheckSquare className="w-5 h-5 text-blue-500" />
                ) : (
                  <Square className="w-5 h-5 text-slate-600" />
                )}
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-white/5 bg-white/[0.02]">
            <button 
              onClick={handleDistribute}
              disabled={selectedLeads.length === 0 || selectedAgents.length === 0 || isDistributing}
              className="shimmer-btn w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>
                {isDistributing 
                  ? 'Distributing...' 
                  : `Distribute ${selectedLeads.length} leads to ${selectedAgents.length} agents`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
