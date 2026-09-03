import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Route,
  Power,
  PowerOff,
  ReceiptText,
  Users,
  Save,
  PhoneCall,
  ListChecks,
  Trash2
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

const money = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

export default function Settings() {
  const currentUserId = localStorage.getItem('userId') || '';
  const userRole = localStorage.getItem('userRole') || 'Agent';

  // Existing system reset logic.
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Existing Finance Solutions logic.
  const [solutions, setSolutions] = useState<any[]>([]);
  const [solutionName, setSolutionName] = useState('');
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [solutionError, setSolutionError] = useState('');

  // Simplified finance configuration.
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [expenseName, setExpenseName] = useState('');
  const [financeUsers, setFinanceUsers] = useState<any[]>([]);
  const [payrollConfigs, setPayrollConfigs] = useState<any[]>([]);
  const [payrollDrafts, setPayrollDrafts] = useState<Record<string, { fixedSalary: string; bonusPercent: string }>>({});
  const [financeConfigBusy, setFinanceConfigBusy] = useState(false);
  const [financeConfigError, setFinanceConfigError] = useState('');
  const [atlantUsers, setAtlantUsers] = useState<any[]>([]);
  const [atlantDrafts, setAtlantDrafts] = useState<Record<string, string>>({});
  const [atlantBusyId, setAtlantBusyId] = useState('');
  const [atlantError, setAtlantError] = useState('');
  const [atlantSuccess, setAtlantSuccess] = useState('');

  // Administrator-managed Lead statuses.
  const [leadStatuses, setLeadStatuses] = useState<any[]>([]);
  const [leadStatusName, setLeadStatusName] = useState('');
  const [leadStatusBusyId, setLeadStatusBusyId] = useState('');
  const [leadStatusError, setLeadStatusError] = useState('');
  const [leadStatusSuccess, setLeadStatusSuccess] = useState('');


  const loadSolutions = async () => {
    if (userRole !== 'Administrator') return;
    try {
      setSolutions(await firestoreService.getFinanceSolutions(true) as any[]);
    } catch (err: any) {
      setSolutionError(err?.message || 'Failed to load Solutions.');
    }
  };

  const loadSimpleFinanceConfig = async () => {
    if (userRole !== 'Administrator') return;

    try {
      const [categories, users, configs] = await Promise.all([
        firestoreService.getSimpleExpenseCategories(true),
        firestoreService.getUsers(),
        firestoreService.getPayrollConfigs()
      ]);

      setExpenseCategories(categories as any[]);

      const employees = (users as any[])
        .filter((user: any) => String(user.role || '') !== 'Administrator')
        .sort((a: any, b: any) =>
          String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
        );

      setFinanceUsers(employees);
      setPayrollConfigs(configs as any[]);

      const nextDrafts: Record<string, { fixedSalary: string; bonusPercent: string }> = {};
      employees.forEach((employee: any) => {
        const existing = (configs as any[]).find(
          (config: any) => String(config.employeeId || config.id) === String(employee.id)
        );

        nextDrafts[String(employee.id)] = {
          fixedSalary: String(existing?.fixedSalary ?? ''),
          bonusPercent: String(existing?.bonusPercent ?? '')
        };
      });
      setPayrollDrafts(nextDrafts);
    } catch (err: any) {
      setFinanceConfigError(err?.message || 'Failed to load finance configuration.');
    }
  };

  const loadAtlantConfig = async () => {
    if (userRole !== 'Administrator') return;

    try {
      setAtlantError('');
      const users = await firestoreService.getUsers();

      const atlantUsersList = (users as any[])
        .sort((a: any, b: any) =>
          String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
        );

      setAtlantUsers(atlantUsersList);

      const drafts: Record<string, string> = {};
      atlantUsersList.forEach((user: any) => {
        drafts[String(user.id)] = String(user.atlantExtension || '');
      });
      setAtlantDrafts(drafts);
    } catch (err: any) {
      setAtlantError(err?.message || 'Failed to load Atlant Agent configuration.');
    }
  };

  const loadLeadStatuses = async () => {
    if (userRole !== 'Administrator' || !currentUserId) return;

    try {
      setLeadStatusError('');
      await firestoreService.initializeLeadStatuses(currentUserId);
      setLeadStatuses(await firestoreService.getLeadStatuses(true) as any[]);
    } catch (err: any) {
      setLeadStatusError(err?.message || 'Failed to load Lead statuses.');
    }
  };

  useEffect(() => {
    loadSolutions();
    loadSimpleFinanceConfig();
    loadAtlantConfig();
    loadLeadStatuses();
  }, [userRole, currentUserId]);

  const handleAddSolution = async () => {
    if (!currentUserId || !solutionName.trim()) return;
    try {
      setSolutionLoading(true);
      setSolutionError('');
      await firestoreService.createFinanceSolution(solutionName, currentUserId);
      setSolutionName('');
      await loadSolutions();
    } catch (err: any) {
      setSolutionError(err?.message || 'Failed to create Solution.');
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
      setSolutionError(err?.message || 'Failed to update Solution.');
    } finally {
      setSolutionLoading(false);
    }
  };

  const addExpenseCategory = async () => {
    if (!expenseName.trim()) return;

    try {
      setFinanceConfigBusy(true);
      setFinanceConfigError('');
      await firestoreService.createSimpleExpenseCategory(expenseName, currentUserId);
      setExpenseName('');
      await loadSimpleFinanceConfig();
    } catch (err: any) {
      setFinanceConfigError(err?.message || 'Failed to add expense.');
    } finally {
      setFinanceConfigBusy(false);
    }
  };

  const toggleExpense = async (item: any) => {
    try {
      setFinanceConfigBusy(true);
      setFinanceConfigError('');
      await firestoreService.setFinanceCatalogItemActive(
        item.id,
        item.isActive === false,
        currentUserId
      );
      await loadSimpleFinanceConfig();
    } catch (err: any) {
      setFinanceConfigError(err?.message || 'Failed to update expense.');
    } finally {
      setFinanceConfigBusy(false);
    }
  };

  const saveEmployeePayroll = async (employee: any) => {
    const draft = payrollDrafts[String(employee.id)] || { fixedSalary: '', bonusPercent: '' };

    try {
      setFinanceConfigBusy(true);
      setFinanceConfigError('');

      await firestoreService.savePayrollConfig(
        {
          employeeId: employee.id,
          fixedSalary: Number(draft.fixedSalary || 0),
          bonusPercent: Number(draft.bonusPercent || 0),
          isActive: true
        },
        currentUserId
      );

      await loadSimpleFinanceConfig();
    } catch (err: any) {
      setFinanceConfigError(err?.message || 'Failed to save payroll configuration.');
    } finally {
      setFinanceConfigBusy(false);
    }
  };

  const saveAtlantExtension = async (user: any) => {
    const userId = String(user?.id || '');
    if (!userId || !currentUserId) return;

    try {
      setAtlantBusyId(userId);
      setAtlantError('');
      setAtlantSuccess('');

      const extension = String(atlantDrafts[userId] || '').trim();

      await firestoreService.setAtlantExtension(userId, extension, currentUserId);

      setAtlantSuccess(
        extension
          ? `Atlant extension ${extension} saved for ${user.name || user.email}.`
          : `Atlant extension cleared for ${user.name || user.email}.`
      );

      await loadAtlantConfig();
    } catch (err: any) {
      setAtlantError(err?.message || 'Failed to save Atlant extension.');
    } finally {
      setAtlantBusyId('');
    }
  };

  const addLeadStatus = async () => {
    if (!leadStatusName.trim() || !currentUserId) return;

    try {
      setLeadStatusBusyId('new');
      setLeadStatusError('');
      setLeadStatusSuccess('');
      await firestoreService.createLeadStatus(leadStatusName, currentUserId);
      setLeadStatusSuccess(`Status "${leadStatusName.trim()}" added.`);
      setLeadStatusName('');
      await loadLeadStatuses();
    } catch (err: any) {
      setLeadStatusError(err?.message || 'Failed to add Lead status.');
    } finally {
      setLeadStatusBusyId('');
    }
  };

  const toggleLeadStatus = async (status: any) => {
    if (!currentUserId) return;

    try {
      setLeadStatusBusyId(String(status.id));
      setLeadStatusError('');
      setLeadStatusSuccess('');
      await firestoreService.setLeadStatusActive(
        status.id,
        status.isActive === false,
        currentUserId
      );
      await loadLeadStatuses();
    } catch (err: any) {
      setLeadStatusError(err?.message || 'Failed to update Lead status.');
    } finally {
      setLeadStatusBusyId('');
    }
  };

  const deleteLeadStatus = async (status: any) => {
    if (!currentUserId) return;
    if (!confirm(`Delete Lead status "${status.name}"? This is only allowed when no Lead currently uses it.`)) {
      return;
    }

    try {
      setLeadStatusBusyId(String(status.id));
      setLeadStatusError('');
      setLeadStatusSuccess('');
      await firestoreService.deleteLeadStatus(status.id, currentUserId);
      setLeadStatusSuccess(`Status "${status.name}" deleted.`);
      await loadLeadStatuses();
    } catch (err: any) {
      setLeadStatusError(err?.message || 'Failed to delete Lead status.');
    } finally {
      setLeadStatusBusyId('');
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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
        <p className="text-slate-400">
          Administrator configures Finance once. Finance users only fill monthly values.
        </p>
      </div>

      <div className="space-y-6">
        {/* Existing Solution management — preserved */}
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Route className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Finance Solutions</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Add the Solution names Agents can select when funds are sent through an external payment route.
          </p>

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
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
            <button
              onClick={handleAddSolution}
              disabled={solutionLoading || !solutionName.trim()}
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

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {solutions.map(solution => {
              const active = solution.isActive !== false;
              return (
                <div key={solution.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{solution.name}</p>
                    <p className={`text-[10px] uppercase mt-1 ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
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
                    {active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    {active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simplified expense names */}
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptText className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-semibold text-white">Company Expense Names</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Create the rows Finance Manager will fill every month: Rent, Fees, VOIP, Servers, etc.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={expenseName}
              onChange={e => setExpenseName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addExpenseCategory();
                }
              }}
              placeholder="Example: Rent"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
            <button
              onClick={addExpenseCategory}
              disabled={financeConfigBusy || !expenseName.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {expenseCategories.map(item => {
              const active = item.isActive !== false;
              return (
                <div key={item.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className={`text-[10px] uppercase mt-1 ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {active ? 'Active' : 'Disabled'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleExpense(item)}
                    disabled={financeConfigBusy}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                      active
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}

            {expenseCategories.length === 0 && (
              <p className="text-sm text-slate-600 py-5">No expense names configured yet.</p>
            )}
          </div>
        </div>

        {/* Payroll setup */}
        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">Employee Payroll Configuration</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Set each employee's fixed monthly salary and bonus percentage. Finance Manager cannot change these rules.
          </p>

          {financeConfigError && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {financeConfigError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="py-3">Employee</th>
                  <th>Role</th>
                  <th>Fixed Salary $</th>
                  <th>Bonus %</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {financeUsers.map(employee => {
                  const draft = payrollDrafts[String(employee.id)] || {
                    fixedSalary: '',
                    bonusPercent: ''
                  };

                  return (
                    <tr key={employee.id}>
                      <td className="py-3">
                        <p className="text-sm font-semibold text-white">{employee.name || employee.email}</p>
                        <p className="text-[10px] text-slate-500">{employee.teamName || 'No Team'}</p>
                      </td>
                      <td className="text-xs text-slate-400">{employee.role}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.fixedSalary}
                          onChange={e =>
                            setPayrollDrafts(prev => ({
                              ...prev,
                              [String(employee.id)]: {
                                ...draft,
                                fixedSalary: e.target.value
                              }
                            }))
                          }
                          className="w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={draft.bonusPercent}
                          onChange={e =>
                            setPayrollDrafts(prev => ({
                              ...prev,
                              [String(employee.id)]: {
                                ...draft,
                                bonusPercent: e.target.value
                              }
                            }))
                          }
                          className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          placeholder="0"
                        />
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => saveEmployeePayroll(employee)}
                          disabled={financeConfigBusy}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {financeUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-600">
                      No employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <PhoneCall className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Atlant Click2Call</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Map every CRM user to their Atlant extension. Saved extensions are shown separately and are used automatically by Click2Call and Auto Dialer. The Atlant API key stays on the server.
          </p>

          {atlantError && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {atlantError}
            </div>
          )}

          {atlantSuccess && (
            <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
              {atlantSuccess}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="py-3">User</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Email</th>
                  <th>Saved Extension</th>
                  <th>Atlant Extension</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {atlantUsers.map((user: any) => {
                  const userId = String(user.id);
                  return (
                    <tr key={userId}>
                      <td className="py-3 text-sm font-semibold text-white">
                        {user.name || user.email || 'User'}
                      </td>
                      <td className="text-xs text-blue-300">{user.role || 'Undefined'}</td>
                      <td className="text-xs text-slate-400">{user.teamName || 'No Team'}</td>
                      <td className="text-xs text-slate-400">{user.email || '—'}</td>
                      <td>
                        {String(user.atlantExtension || '').trim() ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-300">
                            {String(user.atlantExtension).trim()}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">Not configured</span>
                        )}
                      </td>
                      <td>
                        <input
                          value={atlantDrafts[userId] ?? ''}
                          onChange={e =>
                            setAtlantDrafts(prev => ({
                              ...prev,
                              [userId]: e.target.value
                            }))
                          }
                          placeholder="Example: 1005"
                          className="w-40 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => saveAtlantExtension(user)}
                          disabled={atlantBusyId === userId}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold"
                        >
                          {atlantBusyId === userId ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {atlantUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-600">
                      No CRM users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-semibold text-white">Lead Statuses</h2>
          </div>
          <p className="text-sm text-slate-400 mb-5">
            Add or disable the statuses Agents can use on Leads. In Process is included by default. Core workflow statuses are protected so Lead routing, callbacks and finance logic cannot be broken accidentally.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={leadStatusName}
              onChange={e => setLeadStatusName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLeadStatus();
                }
              }}
              placeholder="Example: Follow Up"
              maxLength={40}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
            <button
              onClick={addLeadStatus}
              disabled={leadStatusBusyId === 'new' || !leadStatusName.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {leadStatusBusyId === 'new' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Status
            </button>
          </div>

          {leadStatusError && (
            <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {leadStatusError}
            </div>
          )}

          {leadStatusSuccess && (
            <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
              {leadStatusSuccess}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {leadStatuses.map(status => {
              const active = status.isActive !== false;
              const locked = status.isLocked === true;
              const busy = leadStatusBusyId === String(status.id);

              return (
                <div
                  key={status.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{status.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] uppercase ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {active ? 'Active' : 'Disabled'}
                      </span>
                      {locked && (
                        <span className="text-[10px] uppercase text-amber-400">Protected</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleLeadStatus(status)}
                      disabled={busy || locked}
                      title={locked ? 'Required by a core CRM workflow' : undefined}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 ${
                        active
                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {busy ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : active ? (
                        <PowerOff className="w-3.5 h-3.5" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                      {active ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      onClick={() => deleteLeadStatus(status)}
                      disabled={busy || locked}
                      title={locked ? 'Required by a core CRM workflow' : 'Delete only if unused'}
                      className="inline-flex items-center justify-center p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Existing reset / danger zone — preserved */}
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
                  Resetting the system will permanently delete all leads, users, history, notes, and imports. Only the account
                  <span className="font-bold text-rose-400"> c.morgan@ghost.com </span>
                  will be preserved. This action cannot be undone.
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
              <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Resetting...' : 'Reset All Data'}</span>
            </button>
          </div>

          {resetStatus === 'success' && (
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <p className="text-sm text-emerald-400">System reset successful! Logging out...</p>
            </div>
          )}

          {resetStatus === 'error' && (
            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <p className="text-sm text-rose-400">Error: {errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
