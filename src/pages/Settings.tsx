import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Route,
  Power,
  PowerOff
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

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

  useEffect(() => {
    loadSolutions();
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
