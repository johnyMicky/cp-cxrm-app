import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Filter, Plus, ArrowRight, CheckCircle2, Upload, CheckSquare, Square, UserPlus, RefreshCw, Tag, ChevronDown, X, MessageSquare, Send, AlertTriangle, PhoneCall, Check } from 'lucide-react';
import { format } from 'date-fns';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import LeadForm from '../components/LeadForm';
import LeadImport from '../components/LeadImport';
import { firestoreService } from '../services/firestoreService';
import { safeLower } from '../utils/stringUtils';
import { db } from '../firebase';

const STATUSES = [
  'New',
  'VM',
  'No answer',
  'Deposit',
  'Callback',
  'Low Potential',
  'High Potential',
  'No Potential',
  'Language Barrier',
  'Wrong Person',
  'Underage',
  'No Experience',
  'Not Interested',
  'Hung Up',
  'Wrong Number',
  'Drop',
  'JOR',
];

const RESHUFFLE_PROTECTED_SOURCE_STATUSES = new Set([
  'Callback',
  'Low Potential',
  'High Potential',
  'Deposit'
]);

const RESHUFFLE_SOURCE_STATUSES = STATUSES.filter(
  status => !RESHUFFLE_PROTECTED_SOURCE_STATUSES.has(status)
);


const normalizeStatus = (value: any) => {
  const raw = String(value || 'New').trim();
  const key = raw.toLowerCase().replace(/\s+/g, ' ');

  const canonical: Record<string, string> = {
    'new': 'New',
    'vm': 'VM',
    'no answer': 'No answer',
    'deposit': 'Deposit',
    'callback': 'Callback',
    'low potential': 'Low Potential',
    'high potential': 'High Potential',
    'no potential': 'No Potential',
    'language barrier': 'Language Barrier',
    'wrong person': 'Wrong Person',
    'underage': 'Underage',
    'no experience': 'No Experience',
    'not interested': 'Not Interested',
    'hung up': 'Hung Up',
    'hang up': 'Hung Up',
    'wrong number': 'Wrong Number',
    'drop': 'Drop',
    'jor': 'JOR',
  };

  return canonical[key] || raw;
};

const getStatusStyles = (status: string) => {
  const normalizedStatus = normalizeStatus(status);
  switch (normalizedStatus) {
    case 'Deposit': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    case 'VM': return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    case 'Callback': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    case 'New': return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    case 'No answer': return 'text-slate-400 border-slate-500/20 bg-slate-500/5';
    case 'Low Potential': return 'text-orange-400 border-orange-500/20 bg-orange-500/5';
    case 'High Potential': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    case 'No Potential': return 'text-zinc-500 border-zinc-500/20 bg-zinc-500/5';
    case 'Language Barrier': return 'text-purple-400 border-purple-500/20 bg-purple-500/5';
    case 'Wrong Person': return 'text-pink-400 border-pink-500/20 bg-pink-500/5';
    case 'Underage': return 'text-red-400 border-red-500/20 bg-red-500/5';
    case 'No Experience': return 'text-red-500 border-red-600/20 bg-red-600/5';
    case 'Not Interested': return 'text-red-500 border-red-600/20 bg-red-600/5';
    case 'Hung Up': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    case 'Wrong Number': return 'text-pink-400 border-pink-500/20 bg-pink-500/5';
    case 'Drop': return 'text-slate-400 border-slate-500/20 bg-slate-500/5';
    case 'JOR': return 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5';
    default: return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
  }
};

export default function Leads() {
  const [searchParams] = useSearchParams();
  const dashboardStatus = searchParams.get('status') || '';
  const dashboardView = searchParams.get('view') || '';
  const dashboardRange = searchParams.get('range') || 'all';

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
  const [reshuffleTargetStatus, setReshuffleTargetStatus] = useState('');
  const [isReshuffleTargetOpen, setIsReshuffleTargetOpen] = useState(false);
  const [selectedBulkAgents, setSelectedBulkAgents] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<{ type: 'status' | 'assign' | 'reshuffle' | null, value: any }>({ type: null, value: null });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Lead created successfully');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [quickNoteId, setQuickNoteId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [distributionResult, setDistributionResult] = useState<Record<string, number> | null>(null);
  const [isReshuffling, setIsReshuffling] = useState(false);
  const [visibleLeadCount, setVisibleLeadCount] = useState(100);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState<{
    type: 'all' | 'selected';
    selected: number;
    deleted: number;
    failed: number;
    duration: number;
  } | null>(null);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialAgentLeadLoadRef = useRef(true);
  const previousLeadIdsRef = useRef<Set<string>>(new Set());

  const currentUser = { 
    id: localStorage.getItem('userId'),
    role: localStorage.getItem('userRole') || 'Agent' 
  };

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAtlantCall = async (lead: any) => {
    if (!lead?.phone || callingLeadId) return;

    const leadId = String(lead.id || '');
    setCallingLeadId(leadId);

    try {
      await firestoreService.initiateAtlantCall(lead.phone);
      showToastMessage(`Call initiated to ${lead.name || lead.phone}`);
    } catch (err: any) {
      console.error('Atlant Click2Call failed:', err);
      showToastMessage(`Call failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setTimeout(() => {
        setCallingLeadId(current => current === leadId ? null : current);
      }, 2200);
    }
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

  const fetchLeads = async () => {
    try {
      const data = await firestoreService.getLeadsForUser(currentUser);
      setLeads(data);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      if (currentUser.role === 'Team Leader' && currentUser.id) {
        const freshUser = await firestoreService.getUser(String(currentUser.id));
        const teamId = freshUser?.teamId || '';

        if (!teamId) {
          setAgents([]);
          return;
        }

        const teamUsers = await firestoreService.getUsersByTeam(teamId);
        setAgents(
          teamUsers.filter((u: any) => u.role === 'Agent')
        );
        return;
      }

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

    return () => {
      document.removeEventListener('click', handleClickOutside);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (currentUser.role !== 'Agent' || !currentUser.id) {
      return;
    }

    const leadsQuery = query(
      collection(db, 'leads'),
      where('assigned_to', '==', currentUser.id)
    );

    const unsubscribe = onSnapshot(
      leadsQuery,
      (snapshot) => {
        const currentIds = new Set(snapshot.docs.map((doc) => doc.id));

        if (initialAgentLeadLoadRef.current) {
          previousLeadIdsRef.current = currentIds;
          initialAgentLeadLoadRef.current = false;
          return;
        }

        let newLeadsCount = 0;

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !previousLeadIdsRef.current.has(change.doc.id)) {
            newLeadsCount += 1;
          }
        });

        if (newLeadsCount > 0) {
          showToastMessage(
            newLeadsCount === 1
              ? 'You received 1 new lead'
              : `You received ${newLeadsCount} new leads`
          );
          fetchLeads();
        }

        previousLeadIdsRef.current = currentIds;
      },
      (error) => {
        console.error('Realtime lead listener failed:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser.id, currentUser.role]);

  const handleSuccess = (message?: string, skipFetch = false) => {
    if (!skipFetch) fetchLeads();
    setSelectedLeads([]);
    setBulkAction({ type: null, value: null });
    setIsReshuffleModalOpen(false);
    setReshuffleTargetStatus('');
    setIsReshuffleTargetOpen(false);
    setActiveDropdown(null);
    if (message) showToastMessage(message);
  };

  // Keep typing/filtering responsive even when the account contains thousands of leads.
  const deferredSearch = useDeferredValue(search);

  const filteredLeads = useMemo(() => {
    const searchQuery = safeLower(deferredSearch);
    const sourceQuery = safeLower(filters.source);
    const countryQuery = safeLower(filters.country);
    const statusSet = new Set(filters.statuses);
    const agentSet = new Set(filters.agents);
    const dashboardStatusNormalized = dashboardStatus ? normalizeStatus(dashboardStatus) : '';

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const terminalStatuses = new Set(['Deposit', 'Lost', 'No Potential', 'JOR']);

    const toDate = (value: any) => {
      if (!value) return null;
      const date = value?.toDate ? value.toDate() : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    let dashboardStartDate: Date | null = null;
    if (dashboardRange === '1d') dashboardStartDate = new Date(today);
    else if (dashboardRange === '1w') {
      dashboardStartDate = new Date(now);
      dashboardStartDate.setDate(dashboardStartDate.getDate() - 7);
    } else if (dashboardRange === '1m') {
      dashboardStartDate = new Date(now);
      dashboardStartDate.setMonth(dashboardStartDate.getMonth() - 1);
    }

    return leads.filter(lead => {
      const normalizedLeadStatus = normalizeStatus(lead.status);
      const baseMatch =
        (!searchQuery || safeLower(lead.name).includes(searchQuery) || safeLower(lead.email).includes(searchQuery) || safeLower(lead.phone).includes(searchQuery) || safeLower(lead.country).includes(searchQuery)) &&
        (statusSet.size === 0 || statusSet.has(normalizedLeadStatus)) &&
        (!sourceQuery || safeLower(lead.source).includes(sourceQuery)) &&
        (agentSet.size === 0 || agentSet.has(lead.assigned_to)) &&
        (!countryQuery || safeLower(lead.country).includes(countryQuery));

      if (!baseMatch) return false;
      if (dashboardStatusNormalized && normalizedLeadStatus !== dashboardStatusNormalized) return false;

      const created = toDate(lead.createdAt);
      const updated = toDate(lead.updatedAt) || created;
      const callback = toDate(lead.callbackAt);

      if (dashboardStartDate && (dashboardStatusNormalized || ['all', 'active'].includes(dashboardView)) && (!created || created < dashboardStartDate)) return false;
      if (dashboardView === 'new-today') return !!created && created >= today && created < tomorrow;
      if (dashboardView === 'active') return !terminalStatuses.has(normalizedLeadStatus);
      if (dashboardView === 'unassigned') return !String(lead.assigned_to || '').trim();
      if (dashboardView === 'callbacks-today') return !!callback && callback >= today && callback < tomorrow;
      if (dashboardView === 'overdue-callbacks') return !!callback && callback < now && normalizedLeadStatus === 'Callback';
      if (dashboardView === 'untouched24h') return !terminalStatuses.has(normalizedLeadStatus) && !!updated && now.getTime() - updated.getTime() >= 24 * 60 * 60 * 1000;
      if (dashboardView === 'stale7d') return !terminalStatuses.has(normalizedLeadStatus) && !!updated && now.getTime() - updated.getTime() >= 7 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [leads, deferredSearch, filters.statuses, filters.source, filters.agents, filters.country, dashboardStatus, dashboardView, dashboardRange]);

  // Rendering thousands of table rows is one of the biggest UI bottlenecks.
  // Keep all records available for filters/bulk actions but render 100 at a time.
  const visibleLeads = useMemo(
    () => filteredLeads.slice(0, visibleLeadCount),
    [filteredLeads, visibleLeadCount]
  );

  useEffect(() => {
    setVisibleLeadCount(100);
  }, [deferredSearch, filters.statuses, filters.source, filters.agents, filters.country, dashboardStatus, dashboardView, dashboardRange]);

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
    
    const agentNamesMap: Record<string, string> = {};
    agents.forEach(a => {
      agentNamesMap[a.id] = a.name;
    });

    try {
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

      setLeads(updatedLeads);
      setActiveDropdown(null);
      const count = selectedLeads.length;
      const leadsToDistribute = [...selectedLeads];
      const agentsToUse = [...selectedBulkAgents];
      
      setSelectedLeads([]);
      setSelectedBulkAgents([]);
      setIsAssigning(false);
      
      setDistributionResult(localSummary);
      showToastMessage(`Distributed ${count} leads successfully!`);

      firestoreService.distributeLeads(leadsToDistribute, agentsToUse, currentUser.id, agentNamesMap)
        .catch(err => {
          console.error('Background distribution failed:', err);
          fetchLeads();
        });

    } catch (err) {
      console.error('Bulk assign failed:', err);
      alert('Failed to start distribution. Please try again.');
      setIsAssigning(false);
    }
  };

  const handleReshuffle = async () => {
    if (isReshuffling) return;

    const recipients =
      reshuffleAgents.length > 0
        ? reshuffleAgents
        : agents.map(a => a.id);

    if (recipients.length === 0) {
      alert('Select at least one Agent to receive leads.');
      return;
    }

    setIsReshuffling(true);

    try {
      const reshuffledCount = await firestoreService.reshuffleLeads(
        recipients,
        String(currentUser.id || ''),
        reshuffleStatuses,
        reshuffleTargetStatus || undefined
      );

      handleSuccess(`Reshuffled ${reshuffledCount || 0} leads`);
    } catch (err: any) {
      console.error('Reshuffle failed:', err);
      alert(err?.message || 'Failed to reshuffle leads.');
    } finally {
      setIsReshuffling(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      if (selectedLeads.length > 0) {
        const count = selectedLeads.length;
        const idsToDelete = [...selectedLeads];
        
        setLeads(prev => prev.filter(l => !idsToDelete.includes(l.id)));
        setSelectedLeads([]);
        setIsDeleteAllModalOpen(false);
        
        const result = await firestoreService.bulkDeleteLeads(idsToDelete, currentUser.id);
        
        setDeleteSummary({
          type: 'selected',
          selected: count,
          deleted: result.deletedCount,
          failed: result.failedCount,
          duration: result.duration
        });
      } else {
        const totalCount = leads.length;
        
        setLeads([]);
        setIsDeleteAllModalOpen(false);
        
        const result = await firestoreService.deleteAllLeads(currentUser.id);
        
        setDeleteSummary({
          type: 'all',
          selected: totalCount,
          deleted: result.deletedCount,
          failed: result.failedCount,
          duration: result.duration
        });
      }
    } catch (err: any) {
      console.error('Delete leads failed:', err);
      const errorMessage = err.message || 'Failed to delete leads. Please try again.';
      alert(`Error: ${errorMessage}`);
      fetchLeads();
    } finally {
      setIsDeletingAll(false);
    }
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = normalizeStatus(status);
    switch (normalizedStatus) {
      case 'New': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'VM':
      case 'No answer':
      case 'Callback': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Low Potential':
      case 'Language Barrier':
      case 'Wrong Person': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'High Potential': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Deposit': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Underage':
      case 'No Experience':
      case 'Not Interested': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Hung Up': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Wrong Number': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      case 'Drop': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'JOR': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
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
          {currentUser.role === 'Administrator' && selectedLeads.length === 0 && (
            <button 
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="shimmer-btn bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 border border-rose-500/20"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Delete All Leads</span>
            </button>
          )}
          
          {selectedLeads.length > 0 && currentUser.role !== 'Agent' && (
            <button 
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="shimmer-btn bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-rose-500/20"
            >
              <X className="w-4 h-4" />
              <span>Delete {selectedLeads.length} Selected</span>
            </button>
          )}

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

      {(dashboardStatus || dashboardView) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-blue-400">Dashboard Drill-down</p>
            <p className="text-sm text-slate-300 mt-1">
              {dashboardStatus
                ? `Status: ${normalizeStatus(dashboardStatus)}${dashboardRange !== 'all' ? ` • Range: ${dashboardRange.toUpperCase()}` : ''}`
                : dashboardView === 'unassigned' ? 'Unassigned Leads'
                : dashboardView === 'overdue-callbacks' ? 'Overdue Callbacks'
                : dashboardView === 'untouched24h' ? 'Untouched 24h+'
                : dashboardView === 'stale7d' ? 'Stale 7d+'
                : dashboardView === 'callbacks-today' ? 'Callbacks Today'
                : dashboardView === 'new-today' ? 'New Today'
                : dashboardView === 'active' ? `Active Leads${dashboardRange !== 'all' ? ` • Range: ${dashboardRange.toUpperCase()}` : ''}`
                : 'Dashboard Leads'}
            </p>
          </div>
          <Link to="/leads" className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300">Clear Dashboard Filter</Link>
        </div>
      )}

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
              {(filters.statuses.length > 0 || filters.source || filters.agents.length > 0 || filters.country) && (
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
                    {RESHUFFLE_SOURCE_STATUSES.map(status => (
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
                  setReshuffleStatuses(
                    filters.statuses.filter(
                      status => !RESHUFFLE_PROTECTED_SOURCE_STATUSES.has(
                        normalizeStatus(status)
                      )
                    )
                  );
                  setReshuffleAgents(agents.map(a => a.id));
                  setReshuffleTargetStatus('');
                  setIsReshuffleTargetOpen(false);
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
          <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 md:p-6 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-3rem)] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
              <div className="flex items-center justify-between p-4 md:p-5 border-b border-white/5 bg-white/[0.02] shrink-0">
                <h2 className="text-xl font-semibold text-white tracking-tight flex items-center space-x-2">
                  <RefreshCw className="w-5 h-5 text-amber-400" />
                  <span>Reshuffle Leads</span>
                </h2>
                <button 
                  onClick={() => !isReshuffling && setIsReshuffleModalOpen(false)}
                  disabled={isReshuffling}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 md:p-5 space-y-4 overflow-y-auto custom-scrollbar min-h-0 flex-1">
                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Select Statuses to Reshuffle</label>
                  <div className="grid grid-cols-2 gap-2">
                    {RESHUFFLE_SOURCE_STATUSES.map(status => (
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

                <div className="rounded-xl border border-slate-700/60 bg-white/[0.02] p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-300">Protected from Reshuffle</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Callback, Low Potential, High Potential and Deposit cannot be selected as source statuses.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Change Status While Reshuffling
                    </label>
                    <div className="relative mt-2">
                      <button
                        type="button"
                        onClick={() => setIsReshuffleTargetOpen(open => !open)}
                        className={`w-full flex items-center justify-between gap-3 bg-[#111827] border rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                          isReshuffleTargetOpen
                            ? 'border-blue-500/60 text-white'
                            : 'border-white/10 text-slate-200 hover:border-white/20'
                        }`}
                      >
                        <span className="truncate">
                          {reshuffleTargetStatus
                            ? `Change to ${reshuffleTargetStatus}`
                            : 'Keep current status'}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                            isReshuffleTargetOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {isReshuffleTargetOpen && (
                        <div className="relative z-[20] mt-2 max-h-44 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-[#0B1220] shadow-xl shadow-black/30 p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReshuffleTargetStatus('');
                              setIsReshuffleTargetOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                              reshuffleTargetStatus === ''
                                ? 'bg-blue-600/20 text-blue-300'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span>Keep current status</span>
                            {reshuffleTargetStatus === '' && (
                              <Check className="w-4 h-4 shrink-0" />
                            )}
                          </button>

                          {STATUSES.map(status => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => {
                                setReshuffleTargetStatus(status);
                                setIsReshuffleTargetOpen(false);
                              }}
                              className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                                reshuffleTargetStatus === status
                                  ? 'bg-blue-600/20 text-blue-300'
                                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span>Change to {status}</span>
                              {reshuffleTargetStatus === status && (
                                <Check className="w-4 h-4 shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {reshuffleStatuses.includes('No answer') && (
                      <p className="text-[11px] text-blue-300 mt-2">
                        No Answer selected: you can change these Leads to New, High Potential or any other status before redistribution.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Select Agents to Receive Leads</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 md:max-h-44 overflow-y-auto custom-scrollbar p-1">
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

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                  {(() => {
                    const matchingCount = leads.filter(lead =>
                      reshuffleStatuses.includes(normalizeStatus(lead.status))
                    ).length;

                    const minPerAgent =
                      reshuffleAgents.length > 0
                        ? Math.floor(matchingCount / reshuffleAgents.length)
                        : 0;

                    const maxPerAgent =
                      reshuffleAgents.length > 0
                        ? Math.ceil(matchingCount / reshuffleAgents.length)
                        : 0;

                    return (
                      <>
                        <p className="text-xs text-amber-300 font-semibold">
                          {matchingCount} matching Lead{matchingCount === 1 ? '' : 's'}
                        </p>
                        <p className="text-[11px] text-amber-400/90">
                          Recipients: {reshuffleAgents.length} • Estimated distribution: {minPerAgent}
                          {maxPerAgent !== minPerAgent ? `–${maxPerAgent}` : ''} per recipient
                        </p>
                        <p className="text-[11px] text-amber-400/90">
                          Status after reshuffle: {reshuffleTargetStatus || 'Keep current status'}
                        </p>
                      </>
                    );
                  })()}

                  <p className="text-xs text-amber-400 leading-relaxed pt-1">
                    <strong>Warning:</strong> This action redistributes the selected source statuses and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-3 p-4 md:p-5 border-t border-white/5 bg-[#0A0F1C] shrink-0">
                <button 
                  onClick={() => setIsReshuffleModalOpen(false)}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReshuffle}
                  disabled={
                    reshuffleStatuses.length === 0 ||
                    reshuffleAgents.length === 0 ||
                    reshuffleStatuses.some(status =>
                      RESHUFFLE_PROTECTED_SOURCE_STATUSES.has(
                        normalizeStatus(status)
                      )
                    )
                  }
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
              {visibleLeads.map((lead) => (
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
                      value={normalizeStatus(lead.status)}
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


                        {lead.phone && (
                          <button
                            type="button"
                            onClick={() => handleAtlantCall(lead)}
                            disabled={callingLeadId !== null}
                            className={`p-1.5 rounded-lg transition-colors ${
                              callingLeadId === lead.id
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={callingLeadId === lead.id ? 'Calling...' : 'Call with Atlant'}
                          >
                            <PhoneCall className={`w-4 h-4 ${callingLeadId === lead.id ? 'animate-pulse' : ''}`} />
                          </button>
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
          {visibleLeadCount < filteredLeads.length && (
            <div className="p-4 border-t border-white/5 flex items-center justify-center">
              <button
                onClick={() => setVisibleLeadCount(count => count + 100)}
                className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Load 100 More ({filteredLeads.length - visibleLeadCount} remaining)
              </button>
            </div>
          )}

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

      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-xl font-semibold text-white tracking-tight flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>{selectedLeads.length > 0 ? `Delete ${selectedLeads.length} Leads` : 'Delete All Leads'}</span>
              </h2>
              <button 
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <p className="text-sm text-rose-400 leading-relaxed font-medium">
                  {selectedLeads.length > 0 
                    ? `Are you sure you want to delete the ${selectedLeads.length} selected leads?`
                    : 'Are you absolutely sure you want to delete ALL leads? This action is permanent and cannot be undone.'
                  }
                </p>
              </div>
              <p className="text-xs text-slate-400">
                {selectedLeads.length > 0
                  ? 'The selected leads will be permanently removed from the system using server-side batch processing.'
                  : 'All lead data will be permanently removed from the system. This process runs on the server for maximum reliability.'
                }
              </p>
            </div>
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-white/5 bg-white/[0.01]">
              <button 
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 shadow-lg shadow-rose-500/20"
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteSummary && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 text-center border-b border-white/5 bg-white/[0.02]">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Deletion Complete</h3>
              <p className="text-slate-400 mt-2">
                {deleteSummary.type === 'all' ? 'All leads have been removed.' : `${deleteSummary.deleted} selected leads have been removed.`}
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Selected</p>
                  <p className="text-2xl font-bold text-white">{deleteSummary.selected}</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Deleted</p>
                  <p className="text-2xl font-bold text-emerald-400">{deleteSummary.deleted}</p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                  <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-1">Failed</p>
                  <p className="text-2xl font-bold text-rose-400">{deleteSummary.failed}</p>
                </div>
                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Duration</p>
                  <p className="text-2xl font-bold text-blue-400 flex items-center space-x-1">
                    <span>{deleteSummary.duration.toFixed(1)}</span>
                    <span className="text-sm font-medium">s</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5">
              <button 
                onClick={() => {
                  setDeleteSummary(null);
                  fetchLeads();
                }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
