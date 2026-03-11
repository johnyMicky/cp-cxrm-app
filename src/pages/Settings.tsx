import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

export default function Settings() {
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const currentUserId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole');

  const handleResetSystem = async () => {
    if (!currentUserId) return;
    
    const confirm1 = confirm("Are you sure you want to RESET the entire system? This will delete all leads, users (except c.morgan@ghost.com), history, and notes.");
    if (!confirm1) return;
    
    const confirm2 = confirm("FINAL WARNING: This action is irreversible. All data will be permanently deleted. Proceed?");
    if (!confirm2) return;

    setIsResetting(true);
    setResetStatus('idle');
    
    try {
      await firestoreService.resetSystem(currentUserId);
      setResetStatus('success');
      setTimeout(() => {
        // Log out after reset since other users are gone
        localStorage.clear();
        window.location.href = '/login';
      }, 3000);
    } catch (err: any) {
      console.error('Reset failed:', err);
      setResetStatus('error');
      setErrorMessage(err.message || 'An unknown error occurred during reset.');
    } finally {
      setIsResetting(false);
    }
  };

  if (userRole !== 'Administrator') {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400">Only Administrators can access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
        <p className="text-slate-400">Manage global system configuration and data maintenance.</p>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Data Maintenance</h2>
              <p className="text-sm text-slate-400">Tools for managing and resetting system data.</p>
            </div>
            <ShieldAlert className="w-6 h-6 text-amber-500" />
          </div>

          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-rose-500 uppercase tracking-wider mb-1">Danger Zone</h3>
                <p className="text-xs text-rose-400/80 leading-relaxed">
                  Resetting the system will permanently delete all leads, users, history, notes, and imports. 
                  Only the account <span className="font-bold text-rose-400">c.morgan@ghost.com</span> will be preserved.
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1 mr-8">
              <h3 className="text-sm font-medium text-white mb-1">Reset Entire System</h3>
              <p className="text-xs text-slate-500">Wipe all data and start fresh with a clean database.</p>
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
              <p className="text-sm text-emerald-400">System reset successful! Logging out...</p>
            </div>
          )}

          {resetStatus === 'error' && (
            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <p className="text-sm text-rose-400">Error: {errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
