import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Route,
  Power,
  PowerOff,
  SlidersHorizontal,
  Percent,
  BadgeDollarSign
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

const moneyLabel = (value: number) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Settings() {
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const [solutions, setSolutions] = useState<any[]>([]);
  const [solutionName, setSolutionName] = useState('');
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [solutionError, setSolutionError] = useState('');

  const [financeCatalog, setFinanceCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogForm, setCatalogForm] = useState({ type: 'Expense', name: '', calculationType: 'Fixed', defaultValue: '', recurring: false, frequency: 'Monthly', dueDay: '1', description: '' });

  const currentUserId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole');

  const loadSolutions = async () => {
    if (userRole !== 'Administrator') return;

    try {
      const data = await firestoreService.getFinanceSolutions(true);
      setSolutions(data as any[]);
    } catch (err: any) {
      console.error('Failed to load finance solutions:', err);
      setSolutionError(
        err?.message || 'Failed to load Solutions.'
      );
    }
  };

  const loadFinanceCatalog = async () => {
    if (userRole !== 'Administrator') return;
    try { setFinanceCatalog(await firestoreService.getFinanceCatalog(true) as any[]); }
    catch (err: any) { setCatalogError(err?.message || 'Failed to load finance catalog.'); }
  };

  useEffect(() => {
    loadSolutions();
    loadFinanceCatalog();
  }, [userRole]);

  const handleAddSolution = async () => {
    if (!currentUserId || !solutionName.trim()) return;

    try {
      setSolutionLoading(true);
      setSolutionError('');

      await firestoreService.createFinanceSolution(
        solutionName,
        currentUserId
      );

      setSolutionName('');
      await loadSolutions();
    } catch (err: any) {
      setSolutionError(
        err?.message || 'Failed to create Solution.'
      );
    } finally {
      setSolutionLoading(false);
    }
  };

  const toggleSolution = async (solution: any) => {
    if (!currentUserId) return;

    try {
      setSolutionLoading(true);
      setSolutionError('');

      await firestoreService.setFinanceSolutionActive(
        solution.id,
        solution.isActive === false,
        currentUserId
      );

      await loadSolutions();
    } catch (err: any) {
      setSolutionError(
        err?.message || 'Failed to update Solution.'
      );
    } finally {
      setSolutionLoading(false);
    }
  };

  const handleAddCatalogItem = async () => {
    if (!currentUserId || !catalogForm.name.trim()) return;
    try {
      setCatalogLoading(true);
      setCatalogError('');
      await firestoreService.createFinanceCatalogItem({
        ...catalogForm,
        defaultValue: Number(catalogForm.defaultValue || 0),
        dueDay: Number(catalogForm.dueDay || 1)
      }, currentUserId);
      setCatalogForm({ type: 'Expense', name: '', calculationType: 'Fixed', defaultValue: '', recurring: false, frequency: 'Monthly', dueDay: '1', description: '' });
      await loadFinanceCatalog();
    } catch (err: any) {
      setCatalogError(err?.message || 'Failed to add finance item.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const toggleCatalogItem = async (item: any) => {
    if (!currentUserId) return;
    try {
      setCatalogLoading(true);
      setCatalogError('');
      await firestoreService.setFinanceCatalogItemActive(item.id, item.isActive === false, currentUserId);
      await loadFinanceCatalog();
    } catch (err: any) {
      setCatalogError(err?.message || 'Failed to update finance item.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleResetSystem = async () => {
    if (!currentUserId) return;

    const confirm1 = confirm(
      'Are you sure you want to RESET the entire system? This will delete all leads, users (except c.morgan@ghost.com), history, and notes.'
    );
    if (!confirm1) return;

    const confirm2 = confirm(
      'FINAL WARNING: This action is irreversible. All data will be permanently deleted. Proceed?'
    );
    if (!confirm2) return;

    setIsResetting(true);
    setResetStatus('idle');

    try {
      await firestoreService.resetSystem(currentUserId);
      setResetStatus('success');

      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/login';
      }, 3000);
    } catch (err: any) {
      console.error('Reset failed:', err);
      setResetStatus('error');
      setErrorMessage(
        err.message || 'An unknown error occurred during reset.'
      );
    } finally {
      setIsResetting(false);
    }
  };

  if (userRole !== 'Administrator') {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">
          Access Denied
        </h1>
        <p className="text-slate-400">
          Only Administrators can access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          System Settings
        </h1>
        <p className="text-slate-400">
          Manage global system configuration and data maintenance.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold text-white">
                  Finance Solutions
                </h2>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Add the Solution names Agents can select when funds are sent through an external payment route.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={solutionName}
              onChange={e => setSolutionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSolution();
                }
              }}
              placeholder="Example: Safe, JOR..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />

            <button
              onClick={handleAddSolution}
              disabled={
                solutionLoading || !solutionName.trim()
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Solution
            </button>
          </div>

          {solutionError && (
            <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {solutionError}
            </div>
          )}

          <div className="mt-5 space-y-2">
            {solutions.map(solution => {
              const active = solution.isActive !== false;

              return (
                <div
                  key={solution.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {solution.name}
                    </p>
                    <p
                      className={`text-[10px] uppercase tracking-wider mt-1 ${
                        active
                          ? 'text-emerald-400'
                          : 'text-slate-600'
                      }`}
                    >
                      {active ? 'Active' : 'Disabled'}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleSolution(solution)}
                    disabled={solutionLoading}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                      active
                        ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {active ? (
                      <PowerOff className="w-4 h-4" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                    {active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}

            {solutions.length === 0 && (
              <p className="text-sm text-slate-600 py-6 text-center">
                No Finance Solutions added yet.
              </p>
            )}
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-violet-400" />
                <h2 className="text-xl font-semibold text-white">Finance Configuration Catalog</h2>
              </div>
              <p className="text-sm text-slate-400 mt-1">Create selectable Expenses, Salaries, Commissions, Taxes, Bonuses and Penalties for Finance users.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <select value={catalogForm.type} onChange={e => setCatalogForm(p => ({...p, type:e.target.value}))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white">
              {['Expense','Salary','Commission','Tax','Bonus','Penalty'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <input value={catalogForm.name} onChange={e => setCatalogForm(p => ({...p, name:e.target.value}))} placeholder="Name, e.g. Office Rent" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white" />
            <select value={catalogForm.calculationType} onChange={e => setCatalogForm(p => ({...p, calculationType:e.target.value}))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white">
              <option value="Fixed">Fixed $</option><option value="Percentage">Percentage %</option>
            </select>
            <input type="number" min="0" step="0.01" value={catalogForm.defaultValue} onChange={e => setCatalogForm(p => ({...p, defaultValue:e.target.value}))} placeholder={catalogForm.calculationType === 'Percentage' ? 'Default %' : 'Default $'} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[auto_160px_120px_1fr_auto] gap-3 mt-3 items-center">
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={catalogForm.recurring} onChange={e=>setCatalogForm(p=>({...p,recurring:e.target.checked}))}/> Recurring</label>
            <select disabled={!catalogForm.recurring} value={catalogForm.frequency} onChange={e=>setCatalogForm(p=>({...p,frequency:e.target.value}))} className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-40"><option>Monthly</option><option>Weekly</option><option>Yearly</option></select>
            <input disabled={!catalogForm.recurring} type="number" min="1" max="31" value={catalogForm.dueDay} onChange={e=>setCatalogForm(p=>({...p,dueDay:e.target.value}))} placeholder="Due day" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-40" />
            <input value={catalogForm.description} onChange={e=>setCatalogForm(p=>({...p,description:e.target.value}))} placeholder="Description / rule" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white" />
            <button onClick={handleAddCatalogItem} disabled={catalogLoading || !catalogForm.name.trim()} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold">Add Item</button>
          </div>
          {catalogError && <div className="mt-3 text-sm text-rose-400">{catalogError}</div>}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {financeCatalog.map(item => (
              <div key={item.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><BadgeDollarSign className="w-4 h-4 text-violet-400"/><p className="text-sm font-semibold text-white">{item.name}</p><span className="text-[9px] uppercase text-slate-500">{item.type}</span></div>
                  <p className="text-xs text-slate-500 mt-1">{item.calculationType === 'Percentage' ? `${item.defaultValue}%` : moneyLabel(item.defaultValue)}{item.recurring ? ` • ${item.frequency} • due day ${item.dueDay}` : ''}</p>
                </div>
                <button onClick={()=>toggleCatalogItem(item)} disabled={catalogLoading} className={`px-3 py-2 rounded-lg text-xs font-semibold ${item.isActive !== false ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{item.isActive !== false ? 'Disable' : 'Enable'}</button>
              </div>
            ))}
            {financeCatalog.length === 0 && <p className="text-sm text-slate-600 py-5">No finance configuration items yet.</p>}
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">
                Data Maintenance
              </h2>
              <p className="text-sm text-slate-400">
                Tools for managing and resetting system data.
              </p>
            </div>
            <ShieldAlert className="w-6 h-6 text-amber-500" />
          </div>

          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-rose-500 uppercase tracking-wider mb-1">
                  Danger Zone
                </h3>
                <p className="text-xs text-rose-400/80 leading-relaxed">
                  Resetting the system will permanently delete all leads,
                  users, history, notes, and imports. Only the account{' '}
                  <span className="font-bold text-rose-400">
                    c.morgan@ghost.com
                  </span>{' '}
                  will be preserved. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1 mr-8">
              <h3 className="text-sm font-medium text-white mb-1">
                Reset Entire System
              </h3>
              <p className="text-xs text-slate-500">
                Wipe all data and start fresh with a clean database.
              </p>
            </div>

            <button
              onClick={handleResetSystem}
              disabled={isResetting}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isResetting
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20'
              }`}
            >
              {isResetting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Resetting...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Reset All Data</span>
                </>
              )}
            </button>
          </div>

          {resetStatus === 'success' && (
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <p className="text-sm text-emerald-400">
                System reset successful! Logging out...
              </p>
            </div>
          )}

          {resetStatus === 'error' && (
            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <p className="text-sm text-rose-400">
                Error: {errorMessage}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
