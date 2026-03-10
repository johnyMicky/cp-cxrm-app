import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Plus, ArrowRight, CheckCircle2, Upload, CheckSquare, Square, UserPlus, RefreshCw, Tag, ChevronDown, X } from 'lucide-react';
import { format } from 'date-fns';
import LeadForm from '../components/LeadForm';
import LeadImport from '../components/LeadImport';

const STATUSES = ['New', 'VM', 'No answer', 'Deposit', 'Callback', 'Low Potential', 'Language Barrier', 'Wrong Person', 'Underage', 'No Experience'];

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    statuses: [] as string[],
    source: '',
    agents: [] as number[],
    country: ''
  });
  const [activeDropdown, setActiveDropdown] = useState<'status' | 'agent' | null>(null);
  const [statusSearch, setStatusSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isReshuffleModalOpen, setIsReshuffleModalOpen] = useState(false);
  const [reshuffleStatuses, setReshuffleStatuses] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<{ type: 'status' | 'assign' | 'reshuffle' | null, value: any }>({ type: null, value: null });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Lead created successfully');
  
  const currentUser = { 
    id: 1, // Hardcoded for now
    role: window.localStorage.getItem('userRole') || 'Administrator' 
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setAgents(data.filter((u: any) => ['Agent', 'Team Leader', 'Manager'].includes(u.role)));
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchAgents();
  }, []);

  const handleSuccess = (message?: string) => {
    fetchLeads();
    setSelectedLeads([]);
    setBulkAction({ type: null, value: null });
    setIsReshuffleModalOpen(false);
    if (message) setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
      (lead.phone && lead.phone.includes(search)) ||
      (lead.country && lead.country.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(lead.status);
    const matchesSource = !filters.source || (lead.source && lead.source.toLowerCase().includes(filters.source.toLowerCase()));
    const matchesAgent = filters.agents.length === 0 || filters.agents.includes(lead.assigned_to);
    const matchesCountry = !filters.country || (lead.country && lead.country.toLowerCase().includes(filters.country.toLowerCase()));

    return matchesSearch && matchesStatus && matchesSource && matchesAgent && matchesCountry;
  });

  const handleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l.id));
    }
  };

  const handleSelectLead = (id: number) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleStatusFilter = (status: string) => {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status) 
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
    }));
  };

  const toggleAgentFilter = (agentId: number) => {
    setFilters(prev => ({
      ...prev,
      agents: prev.agents.includes(agentId)
        ? prev.agents.filter(id => id !== agentId)
        : [...prev.agents, agentId]
    }));
  };

  const handleBulkStatusUpdate = async (status: string) => {
    try {
      const res = await fetch('/api/leads/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: selectedLeads,
          status,
          user_id: currentUser.id
        })
      });
      if (res.ok) handleSuccess(`Updated status for ${selectedLeads.length} leads`);
    } catch (err) {
      console.error('Bulk status update failed:', err);
    }
  };

  const handleBulkAssign = async (agentId: number | 'round-robin') => {
    try {
      if (agentId === 'round-robin') {
        const res = await fetch('/api/leads/distribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_ids: selectedLeads,
            agent_ids: agents.map(a => a.id),
            user_id: currentUser.id
          })
        });
        if (res.ok) handleSuccess(`Distributed ${selectedLeads.length} leads among ${agents.length} agents`);
      } else {
        const res = await fetch('/api/leads/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_ids: selectedLeads,
            assigned_to: agentId,
            user_id: currentUser.id
          })
        });
        if (res.ok) handleSuccess(`Assigned ${selectedLeads.length} leads to agent`);
      }
    } catch (err) {
      console.error('Bulk assign failed:', err);
    }
  };

  const handleReshuffle = async () => {
    try {
      const res = await fetch('/api/leads/reshuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_ids: agents.map(a => a.id),
          user_id: currentUser.id,
          status_filter: reshuffleStatuses
        })
      });
      const data = await res.json();
      if (res.ok) handleSuccess(`Reshuffled ${data.reshuffledCount || 0} leads`);
    } catch (err) {
      console.error('Reshuffle failed:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'VM':
      case 'No answer':
      case 'Callback': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Low Potential':
      case 'Language Barrier':
      case 'Wrong Person': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Deposit': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Underage':
      case 'No Experience': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      {/* Success Toast */}
      {showToast && (
        <div className="fixed bottom-8 right-8 z-[100] bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl shadow-emerald-500/30 flex items-center space-x-3 animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Lead Management</h1>
          <p className="text-sm text-slate-400 mt-1">View, filter, and manage all incoming leads.</p>
        </div>
        <div className="flex items-center space-x-3">
          {currentUser.role !== 'Agent' && (
            <button 
              onClick={() => setIsImportOpen(true)}
              className="shimmer-btn bg-white/5 hover:bg-white/10 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 border border-white/10"
            >
              <Upload className="w-4 h-4" />
              <span>Import Leads</span>
            </button>
          )}
          {currentUser.role !== 'Agent' && (
            <button 
              onClick={() => setIsFormOpen(true)}
              className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Lead</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between bg-[#0A0F1C] p-4 rounded-xl border border-white/5 shadow-sm">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search leads by name, email, phone, or country..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`shimmer-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${showFilters ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {(filters.status || filters.source || filters.agent || filters.country) && (
                <span className="ml-1 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          </div>

          {selectedLeads.length > 0 && (
            <div className="flex items-center space-x-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <span className="text-sm font-medium text-blue-400">{selectedLeads.length} selected</span>
              <div className="h-4 w-px bg-white/10 mx-2" />
              
              <div className="relative group">
                <button className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 border border-white/10 transition-colors">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Status</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 hidden group-hover:block">
                  {STATUSES.map(status => (
                    <button 
                      key={status}
                      onClick={() => handleBulkStatusUpdate(status)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group">
                <button className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 border border-white/10 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 hidden group-hover:block">
                  <button 
                    onClick={() => handleBulkAssign('round-robin')}
                    className="w-full text-left px-4 py-2 text-xs text-blue-400 font-medium hover:bg-white/5 transition-colors border-b border-white/5 mb-1"
                  >
                    Round Robin (All Agents)
                  </button>
                  {agents.map(agent => (
                    <button 
                      key={agent.id}
                      onClick={() => handleBulkAssign(agent.id)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => {
                  setReshuffleStatuses(filters.statuses);
                  setIsReshuffleModalOpen(true);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-400 border border-amber-500/20 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reshuffle</span>
              </button>
            </div>
          )}
        </div>

        {isReshuffleModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
                <h2 className="text-xl font-semibold text-white tracking-tight flex items-center space-x-2">
                  <RefreshCw className="w-5 h-5 text-amber-400" />
                  <span>Reshuffle Leads</span>
                </h2>
                <button 
                  onClick={() => setIsReshuffleModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Select Statuses to Reshuffle</label>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUSES.map(status => (
                      <button
                        key={status}
                        onClick={() => setReshuffleStatuses(prev => 
                          prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                        )}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all ${
                          reshuffleStatuses.includes(status)
                            ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <span>{status}</span>
                        {reshuffleStatuses.includes(status) && <CheckSquare className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 leading-relaxed">
                    <strong>Warning:</strong> This will redistribute all leads with the selected statuses among all active agents. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-white/5 bg-white/[0.01]">
                <button 
                  onClick={() => setIsReshuffleModalOpen(false)}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReshuffle}
                  disabled={reshuffleStatuses.length === 0}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 shadow-lg shadow-amber-500/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Confirm Reshuffle</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0A0F1C] p-4 rounded-xl border border-white/5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</label>
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'status' ? null : 'status')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white flex items-center justify-between hover:bg-white/10 transition-colors"
              >
                <span className="truncate">
                  {filters.statuses.length === 0 ? 'All Statuses' : `${filters.statuses.length} Selected`}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'status' ? 'rotate-180' : ''}`} />
              </button>
              
              {activeDropdown === 'status' && (
                <div className="absolute left-0 top-full mt-2 w-full bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="px-3 pb-2 mb-2 border-b border-white/5">
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Search statuses..."
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => setFilters(prev => ({ ...prev, statuses: [] }))}
                    className="w-full text-left px-4 py-2 text-xs text-blue-400 font-medium hover:bg-white/5 transition-colors border-b border-white/5 mb-1"
                  >
                    Clear All
                  </button>
                  {STATUSES.filter(s => s.toLowerCase().includes(statusSearch.toLowerCase())).map(status => (
                    <button 
                      key={status}
                      onClick={() => toggleStatusFilter(status)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
                    >
                      <span>{status}</span>
                      {filters.statuses.includes(status) && <CheckSquare className="w-3 h-3 text-blue-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Source</label>
              <input 
                type="text"
                placeholder="Filter by source..."
                value={filters.source}
                onChange={(e) => setFilters({...filters, source: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>

            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agent</label>
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'agent' ? null : 'agent')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white flex items-center justify-between hover:bg-white/10 transition-colors"
              >
                <span className="truncate">
                  {filters.agents.length === 0 ? 'All Agents' : `${filters.agents.length} Selected`}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'agent' ? 'rotate-180' : ''}`} />
              </button>

              {activeDropdown === 'agent' && (
                <div className="absolute left-0 top-full mt-2 w-full bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="px-3 pb-2 mb-2 border-b border-white/5">
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Search agents..."
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => setFilters(prev => ({ ...prev, agents: [] }))}
                    className="w-full text-left px-4 py-2 text-xs text-blue-400 font-medium hover:bg-white/5 transition-colors border-b border-white/5 mb-1"
                  >
                    Clear All
                  </button>
                  {agents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase())).map(agent => (
                    <button 
                      key={agent.id}
                      onClick={() => toggleAgentFilter(agent.id)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
                    >
                      <span>{agent.name}</span>
                      {filters.agents.includes(agent.id) && <CheckSquare className="w-3 h-3 text-blue-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Country</label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Filter by country..."
                  value={filters.country}
                  onChange={(e) => setFilters({...filters, country: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                {(filters.statuses.length > 0 || filters.source || filters.agents.length > 0 || filters.country) && (
                  <button 
                    onClick={() => setFilters({ statuses: [], source: '', agents: [], country: '' })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#0A0F1C] rounded-xl border border-white/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 w-10">
                  <button 
                    onClick={handleSelectAll}
                    className="text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    {selectedLeads.length === filteredLeads.length && filteredLeads.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned To</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className={`hover:bg-white/[0.02] transition-colors group ${selectedLeads.includes(lead.id) ? 'bg-blue-500/[0.03]' : ''}`}>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleSelectLead(lead.id)}
                      className="text-slate-500 hover:text-blue-400 transition-colors"
                    >
                      {selectedLeads.includes(lead.id) ? (
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-semibold text-xs">
                        {lead.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{lead.name}</div>
                        <div className="text-xs text-slate-500">{lead.email || 'No Email'} • {lead.country || 'No Country'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-300">{lead.source}</span>
                  </td>
                  <td className="px-6 py-4">
                    {lead.assigned_to_name ? (
                      <div className="flex items-center space-x-2">
                        <img src={lead.assigned_to_avatar} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm text-slate-300">{lead.assigned_to_name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {format(new Date(lead.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      to={`/leads/${lead.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLeads.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              No leads found matching your search.
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <LeadForm 
          onClose={() => setIsFormOpen(false)} 
          onSuccess={() => handleSuccess('Lead created successfully')}
        />
      )}

      {isImportOpen && (
        <LeadImport 
          onClose={() => setIsImportOpen(false)} 
          onSuccess={() => handleSuccess('Leads imported successfully')}
        />
      )}
    </div>
  );
}
