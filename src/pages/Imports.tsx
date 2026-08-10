import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Calendar, User, CheckCircle2, AlertCircle, Loader2, Search, Filter, Users, Shuffle, X } from 'lucide-react';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';
import { cn } from '../App';

interface ImportRecord {
  id: string;
  fileName: string;
  createdBy: string;
  createdAt: any;
  totalLeads: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  status: string;
}

export default function Imports() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [distributionUsers, setDistributionUsers] = useState<any[]>([]);
  const [distributionImport, setDistributionImport] = useState<ImportRecord | null>(null);
  const [distributionMode, setDistributionMode] = useState<'distribute' | 'reshuffle'>('distribute');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionResult, setDistributionResult] = useState<Record<string, number> | null>(null);
  const [distributionTotal, setDistributionTotal] = useState(0);

  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const canDeleteImports = currentUserRole === 'Administrator' || currentUserRole === 'Manager';

  useEffect(() => {
    fetchData();
  }, [currentUserId, currentUserRole]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [importsData, usersData, distributionUsersData] = await Promise.all([
        firestoreService.getImportsForUser(currentUserId),
        firestoreService.getUsers(),
        firestoreService.getDistributionUsersForUser(currentUserId)
      ]);

      setImports(importsData as ImportRecord[]);
      setUsers(usersData);
      setDistributionUsers(distributionUsersData);
    } catch (err) {
      console.error('Failed to fetch imports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await firestoreService.deleteImport(id);
      setImports(prev => prev.filter(i => i.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete import:', err);
      alert('Failed to delete import and associated leads.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDistributionModal = (imp: ImportRecord, mode: 'distribute' | 'reshuffle') => {
    setDistributionImport(imp);
    setDistributionMode(mode);
    setSelectedAgentIds(distributionUsers.map((user: any) => String(user.id)));
    setDistributionResult(null);
    setDistributionTotal(0);
  };

  const closeDistributionModal = () => {
    if (isDistributing) return;
    setDistributionImport(null);
    setSelectedAgentIds([]);
    setDistributionResult(null);
    setDistributionTotal(0);
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleDistribution = async () => {
    if (!distributionImport || selectedAgentIds.length === 0) return;

    setIsDistributing(true);

    try {
      const agentNamesMap = distributionUsers.reduce((acc: Record<string, string>, user: any) => {
        acc[String(user.id)] = user.name || user.email || String(user.id);
        return acc;
      }, {});

      const result =
        distributionMode === 'reshuffle'
          ? await firestoreService.reshuffleImportLeads(
              distributionImport.id,
              selectedAgentIds,
              currentUserId,
              agentNamesMap
            )
          : await firestoreService.distributeImportLeads(
              distributionImport.id,
              selectedAgentIds,
              currentUserId,
              agentNamesMap
            );

      setDistributionResult(result.summary || {});
      setDistributionTotal(result.total || 0);
    } catch (err: any) {
      console.error('Import distribution failed:', err);
      alert(err?.message || 'Failed to distribute leads.');
    } finally {
      setIsDistributing(false);
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  };

  const filteredImports = imports.filter(imp => 
    imp.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!['Administrator', 'Manager', 'Team Leader'].includes(currentUserRole)) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-slate-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Lead Files</h1>
          <p className="text-slate-400 mt-1">
            {currentUserRole === 'Team Leader'
              ? 'View and distribute lead files that you uploaded for your team.'
              : 'Manage and track your bulk lead imports.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text"
            placeholder="Search by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <button className="flex items-center space-x-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/10 transition-all">
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-500 animate-pulse">Loading lead files...</p>
        </div>
      ) : filteredImports.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredImports.map((imp) => (
            <div 
              key={imp.id}
              className="group bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all hover:shadow-2xl hover:shadow-blue-500/5"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">{imp.fileName}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{imp.createdAt?.toDate ? format(imp.createdAt.toDate(), 'MMM d, yyyy HH:mm') : 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>{getUserName(imp.createdBy)}</span>
                      </div>
                      <div className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                        imp.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                      )}>
                        {imp.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 lg:gap-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total</p>
                      <p className="text-lg font-bold text-white">{imp.totalLeads}</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-emerald-500 uppercase font-bold tracking-widest">Imported</p>
                      <p className="text-lg font-bold text-emerald-400">{imp.importedCount || 0}</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-amber-500 uppercase font-bold tracking-widest">Duplicates</p>
                      <p className="text-lg font-bold text-amber-400">{imp.duplicateCount || 0}</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[10px] text-rose-500 uppercase font-bold tracking-widest">Errors</p>
                      <p className="text-lg font-bold text-rose-400">{imp.errorCount || 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2 ml-auto lg:ml-0">
                    <button
                      onClick={() => openDistributionModal(imp, 'distribute')}
                      disabled={distributionUsers.length === 0}
                      className="flex items-center space-x-2 px-3 py-2.5 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="Distribute this file's leads"
                    >
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-semibold">Distribute</span>
                    </button>

                    <button
                      onClick={() => openDistributionModal(imp, 'reshuffle')}
                      disabled={distributionUsers.length === 0}
                      className="flex items-center space-x-2 px-3 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="Reshuffle this file's leads"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span className="text-xs font-semibold">Reshuffle</span>
                    </button>

                    {canDeleteImports && (
                      <button 
                        onClick={() => setDeleteConfirm(imp.id)}
                        className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                        title="Delete file and all associated leads"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-3xl p-20 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-slate-600" />
          </div>
          <h3 className="text-xl font-semibold text-white">No lead files found</h3>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            {searchTerm ? `No results matching "${searchTerm}"` : "You haven't imported any lead files yet."}
          </p>
        </div>
      )}

      {distributionImport && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {distributionMode === 'reshuffle' ? (
                    <Shuffle className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Users className="w-5 h-5 text-blue-400" />
                  )}
                  <h2 className="text-xl font-semibold text-white">
                    {distributionMode === 'reshuffle' ? 'Reshuffle Lead File' : 'Distribute Lead File'}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-2 truncate max-w-sm">
                  {distributionImport.fileName}
                </p>
              </div>

              <button
                onClick={closeDistributionModal}
                disabled={isDistributing}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {distributionResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-semibold">
                        {distributionMode === 'reshuffle' ? 'Reshuffle completed' : 'Distribution completed'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-2">
                      {distributionTotal} leads processed.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(distributionResult).map(([name, count]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3"
                      >
                        <span className="text-sm text-slate-300">{name}</span>
                        <span className="text-sm font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={closeDistributionModal}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
                        Select Agents
                      </p>
                      <span className="text-xs font-semibold text-blue-400">
                        {selectedAgentIds.length} selected
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 p-2 space-y-1">
                      {distributionUsers.length > 0 ? (
                        distributionUsers.map((agent: any) => {
                          const selected = selectedAgentIds.includes(String(agent.id));

                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => toggleAgent(String(agent.id))}
                              className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                                selected
                                  ? 'bg-blue-500/10 border-blue-500/30'
                                  : 'border-transparent hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 text-left">
                                <img
                                  src={agent.avatar || `https://i.pravatar.cc/150?u=${agent.id}`}
                                  alt=""
                                  className="w-9 h-9 rounded-full object-cover border border-white/10"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">
                                    {agent.name || agent.email || 'Agent'}
                                  </p>
                                  <p className="text-xs text-slate-500 truncate">
                                    {agent.email || agent.role}
                                  </p>
                                </div>
                              </div>

                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                selected
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'border-white/20 text-transparent'
                              }`}>
                                ✓
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="py-8 text-center text-sm text-slate-500">
                          No eligible Agents found.
                        </div>
                      )}
                    </div>
                  </div>

                  {currentUserRole === 'Team Leader' && (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3 text-xs text-amber-300">
                      Team Leaders can distribute only their own uploaded files and only to Agents in their assigned team.
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={closeDistributionModal}
                      disabled={isDistributing}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDistribution}
                      disabled={isDistributing || selectedAgentIds.length === 0}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                        distributionMode === 'reshuffle'
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isDistributing
                        ? 'Processing...'
                        : distributionMode === 'reshuffle'
                          ? 'Reshuffle'
                          : 'Distribute'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && canDeleteImports && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Delete Lead File?</h3>
              <p className="text-slate-400 mt-2">
                This will permanently delete the file record and <span className="text-rose-400 font-bold">ALL associated leads</span>, even if they are already assigned to agents.
              </p>
              <p className="text-xs text-rose-500/60 mt-4 font-medium italic">This action cannot be undone.</p>
            </div>
            <div className="flex p-4 gap-3 bg-white/[0.02] border-t border-white/5">
              <button 
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(deleteConfirm)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center space-x-2 shadow-lg shadow-rose-500/20"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete All'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
