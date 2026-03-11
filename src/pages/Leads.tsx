import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Plus, ArrowRight, CheckCircle2, Upload, CheckSquare, Square, UserPlus, RefreshCw, Tag, ChevronDown, X, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import LeadForm from '../components/LeadForm';
import LeadImport from '../components/LeadImport';
import { firestoreService } from '../services/firestoreService';

const STATUSES = ['New', 'VM', 'No answer', 'Deposit', 'Callback', 'Low Potential', 'No Potential', 'Language Barrier', 'Wrong Person', 'Underage', 'No Experience'];

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'Deposit': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    case 'VM': return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    case 'Callback': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    case 'New': return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    case 'No answer': return 'text-slate-400 border-slate-500/20 bg-slate-500/5';
    case 'Low Potential': return 'text-orange-400 border-orange-500/20 bg-orange-500/5';
    case 'No Potential': return 'text-zinc-500 border-zinc-500/20 bg-zinc-500/5';
    case 'Language Barrier': return 'text-purple-400 border-purple-500/20 bg-purple-500/5';
    case 'Wrong Person': return 'text-pink-400 border-pink-500/20 bg-pink-500/5';
    case 'Underage': return 'text-red-400 border-red-500/20 bg-red-500/5';
    case 'No Experience': return 'text-red-500 border-red-600/20 bg-red-600/5';
    default: return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
  }
};

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    statuses: [] as string[],
    source: '',
    agents: [] as string[],
    country: ''
  });
  const [activeDropdown, setActiveDropdown] = useState<'status' | 'agent' | 'bulkStatus' | 'bulkAssign' | null>(null);
  const [statusSearch, setStatusSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isReshuffleModalOpen, setIsReshuffleModalOpen] = useState(false);
  const [reshuffleStatuses, setReshuffleStatuses] = useState<string[]>([]);
  const [reshuffleAgents, setReshuffleAgents] = useState<string[]>([]);
  const [selectedBulkAgents, setSelectedBulkAgents] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<{ type: 'status' | 'assign' | 'reshuffle' | null, value: any }>({ type: null, value: null });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Lead created successfully');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [quickNoteId, setQuickNoteId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [distributionResult, setDistributionResult] = useState<Record<string, number> | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleQuickNote = async (leadId: string) => {
    if (!quickNoteText.trim()) return;
    try {
      await firestoreService.addNote(leadId, currentUser.id, quickNoteText);
      setQuickNoteId(null);
      setQuickNoteText('');
      handleSuccess('Note added successfully');
    } catch (err) {
      console.error('Failed to add quick note:', err);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      await firestoreService.updateLead(leadId, { status: newStatus });
      await firestoreService.logActivity({
        lead_id: leadId,
        user_id: currentUser.id,
        action: 'Status Changed',
        details: `Status changed to ${newStatus} from list`
      });
      handleSuccess('Status updated successfully');
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const currentUser = { 
    id: localStorage.getItem('userId') || '1',
    role: localStorage.getItem('userRole') || 'Administrator' 
  };

  const fetchLeads = async () => {
    try {
      const data = await firestoreService.getLeads(currentUser.role === 'Agent' ? currentUser.id : undefined);
      setLeads(data);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await firestoreService.getUsers();
      setAgents(data.filter((u: any) => ['Agent', 'Team Leader', 'Manager'].includes(u.role)));
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchAgents();

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.relative')) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSuccess = (message?: string) => {
    fetchLeads();
    setSelectedLeads([]);
    setBulkAction({ type: null, value: null });
    setIsReshuffleModalOpen(false);
    setActiveDropdown(null);
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

  const handleSelectLead = (id: string) => {
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

  const toggleAgentFilter = (agentId: string) => {
    setFilters(prev => ({
      ...prev,
      agents: prev.agents.includes(agentId)
        ? prev.agents.filter(id => id !== agentId)
        : [...prev.agents, agentId]
    }));
  };

  const handleBulkStatusUpdate = async (status: string) => {
    try {
      await firestoreService.bulkUpdateLeadsStatus(selectedLeads, status, currentUser.id);
      handleSuccess(`Updated status for ${selectedLeads.length} leads`);
    } catch (err) {
      console.error('Bulk status update failed:', err);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedBulkAgents.length === 0) return;
    setIsAssigning(true);
    
    // Create a map of agent names for the summary
    const agentNamesMap: Record<string, string> = {};
    agents.forEach(a => {
      agentNamesMap[a.id] = a.name;
    });

    try {
      // 1. Calculate distribution locally for "Instant" feel
      const localSummary: Record<string, number> = {};
      selectedBulkAgents.forEach(id => {
        localSummary[agentNamesMap[id] || id] = 0;
      });

      const updatedLeads = leads.map(lead => {
        if (selectedLeads.includes(lead.id)) {
          const index = selectedLeads.indexOf(lead.id);
          const agentId = selectedBulkAgents[index % selectedBulkAgents.length];
          const agentName = agentNamesMap[agentId] || agentId;
          localSummary[agentName] = (localSummary[agentName] || 0) + 1;
          return { ...lead, assigned_to: agentId };
        }
        return lead;
      });

      // 2. Update UI immediately (Optimistic)
      setLeads(updatedLeads);
      setActiveDropdown(null);
      const count = selectedLeads.length;
      const leadsToDistribute = [...selectedLeads];
      const agentsToUse = [...selectedBulkAgents];
      
      setSelectedLeads([]);
      setSelectedBulkAgents([]);
      setIsAssigning(false); // Stop loading state immediately
      
      // 3. Show the result modal immediately
      setDistributionResult(localSummary);
      setToastMessage(`Distributed ${count} leads successfully!`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);

      // 4. Perform actual Firestore distribution in background (don't await)
      firestoreService.distributeLeads(leadsToDistribute, agentsToUse, currentUser.id, agentNamesMap)
        .catch(err => {
          console.error('Background distribution failed:', err);
          // If it fails, we might want to refresh the data to show the real state
          fetchLeads();
        });

    } catch (err) {
      console.error('Bulk assign failed:', err);
      alert('Failed to start distribution. Please try again.');
      setIsAssigning(false);
    }
  };

  const handleReshuffle = async () => {
    try {
      const reshuffledCount = await firestoreService.reshuffleLeads(
        reshuffleAgents.length > 0 ? reshuffleAgents : agents.map(a => a.id),
        currentUser.id,
        reshuffleStatuses
      );
      handleSuccess(`Reshuffled ${reshuffledCount || 0} leads`);
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

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return format(d, 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      {/* Success Toast */}
      {showToast && (
        <div className="fixed bottom-8 right-8 z-[100] bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl shadow-emerald-500/30 flex items-center space-x-3 animate-in slide-in-from-bottom-4 duration-300 max-w-md">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="font-medium text-sm leading-tight">{toastMessage}</span>
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
              
              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === 'bulkStatus' ? null : 'bulkStatus');
                  }}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeDropdown === 'bulkStatus' ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Status</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'bulkStatus' ? 'rotate-180' : ''}`} />
                </button>
                {activeDropdown === 'bulkStatus' && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in duration-150">
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
                )}
              </div>

              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === 'bulkAssign' ? null : 'bulkAssign');
                  }}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeDropdown === 'bulkAssign' ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'bulkAssign' ? 'rotate-180' : ''}`} />
                </button>
                {activeDropdown === 'bulkAssign' && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-[#0D121F] border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in duration-150" onClick={(e) => e.stopPropagation()}>
                    <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select Agents</span>
                      <button 
                        onClick={() => setSelectedBulkAgents(selectedBulkAgents.length === agents.length ? [] : agents.map(a => a.id))}
                        className="text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        {selectedBulkAgents.length === agents.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                      {agents.map(agent => (
                        <button 
                          key={agent.id}
                          onClick={() => setSelectedBulkAgents(prev => 
                            prev.includes(agent.id) ? prev.filter(id => id !== agent.id) : [...prev, agent.id]
                          )}
                          className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2">
                            <img src={agent.avatar} alt="" className="w-5 h-5 rounded-full" />
                            <span>{agent.name}</span>
                          </div>
                          {selectedBulkAgents.includes(agent.id) && <CheckSquare className="w-3 h-3 text-blue-500" />}
                        </button>
                      ))}
                    </div>
                    <div className="p-2 border-t border-white/5">
                      <button 
                        onClick={handleBulkAssign}
                        disabled={selectedBulkAgents.length === 0 || isAssigning}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-2"
                      >
                        {isAssigning ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Assigning...</span>
                          </>
                        ) : (
                          <span>Assign to {selectedBulkAgents.length} Agents</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={() => {
                  setReshuffleStatuses(filters.statuses);
                  setReshuffleAgents(agents.map(a => a.id));
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

                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Select Agents to Receive Leads</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => setReshuffleAgents(prev => 
                          prev.includes(agent.id) ? prev.filter(id => id !== agent.id) : [...prev, agent.id]
                        )}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all ${
                          reshuffleAgents.includes(agent.id)
                            ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <img src={agent.avatar} alt="" className="w-4 h-4 rounded-full" />
                          <span className="truncate">{agent.name}</span>
                        </div>
                        {reshuffleAgents.includes(agent.id) && <CheckSquare className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setReshuffleAgents(reshuffleAgents.length === agents.length ? [] : agents.map(a => a.id))}
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      {reshuffleAgents.length === agents.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 leading-relaxed">
                    <strong>Warning:</strong> This will redistribute leads with the selected statuses among the selected agents. This action cannot be undone.
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
                  disabled={reshuffleStatuses.length === 0 || reshuffleAgents.length === 0}
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

            {currentUser.role !== 'Agent' && (
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
            )}

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
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
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
                    <select 
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer transition-colors ${getStatusStyles(lead.status)}`}
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s} className="bg-[#0A0F1C] text-slate-300">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    {lead.assigned_to ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center overflow-hidden">
                          <img 
                            src={agents.find(a => a.id === lead.assigned_to)?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(agents.find(a => a.id === lead.assigned_to)?.name || 'U')}&background=random`} 
                            alt="" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-xs text-slate-300 font-medium truncate max-w-[100px]">
                          {agents.find(a => a.id === lead.assigned_to)?.name || 'Unknown'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic font-medium uppercase tracking-wider">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-300">{lead.source}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center space-x-2">
                        {lead.phone ? (
                          <button 
                            onClick={() => handleCopy(lead.phone, lead.id)}
                            className="group/copy relative flex items-center space-x-2 text-sm text-slate-300 hover:text-blue-400 transition-colors"
                          >
                            <span>{lead.phone}</span>
                            {copiedId === lead.id ? (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded animate-in fade-in zoom-in duration-200">Copied!</span>
                            ) : (
                              <Tag className="w-3 h-3 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                            )}
                          </button>
                        ) : (
                          <span className="text-sm text-slate-500 italic">No Phone</span>
                        )}
                        
                        <button 
                          onClick={() => {
                            setQuickNoteId(quickNoteId === lead.id ? null : lead.id);
                            setQuickNoteText('');
                          }}
                          className={`p-1 rounded hover:bg-white/5 transition-colors ${quickNoteId === lead.id ? 'text-blue-400' : 'text-slate-500'}`}
                          title="Quick Note"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {quickNoteId === lead.id && (
                        <div className="flex items-center space-x-2 animate-in slide-in-from-top-1 duration-200">
                          <input 
                            type="text"
                            autoFocus
                            value={quickNoteText}
                            onChange={(e) => setQuickNoteText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleQuickNote(lead.id)}
                            placeholder="Type note..."
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-32"
                          />
                          <button 
                            onClick={() => handleQuickNote(lead.id)}
                            className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => setQuickNoteId(null)}
                            className="p-1 text-slate-500 hover:text-slate-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
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

      {/* Distribution Summary Modal */}
      {distributionResult && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center border-b border-white/5 bg-white/[0.02]">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Distribution Complete!</h3>
              <p className="text-slate-400 mt-2">Leads have been successfully assigned to agents.</p>
            </div>
            
            <div className="p-8 space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Assignment Summary</h4>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(distributionResult).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center overflow-hidden">
                        <img 
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="font-semibold text-white">{name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-bold text-blue-400">{count}</span>
                      <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Leads</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5">
              <button 
                onClick={() => setDistributionResult(null)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
