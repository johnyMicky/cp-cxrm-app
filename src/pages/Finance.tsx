import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock3,
  DollarSign,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  History,
  Route,
  Truck,
  AlertTriangle,
  ReceiptText,
  Calculator,
  WalletCards,
  TrendingUp,
  Plus,
  Check,
  Save,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';

const money = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const toDate = (value: any) => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

type FinanceTab =
  | 'Pending'
  | 'On Solution'
  | 'Arrival Pending'
  | 'Approved'
  | 'Rejected';

export default function Finance() {
  const currentUser = {
    id: localStorage.getItem('userId') || '',
    role: localStorage.getItem('userRole') || 'Agent'
  };

  const allowed = [
    'Administrator',
    'Manager',
    'Team Leader',
    'Financial Manager'
  ].includes(currentUser.role);

  const [deposits, setDeposits] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [tab, setTab] = useState<FinanceTab>('Pending');
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [arrivalEditing, setArrivalEditing] = useState<any>(null);
  const [arrivalBusy, setArrivalBusy] = useState(false);
  const [arrivalDraft, setArrivalDraft] = useState({
    receivedAmount: '',
    receivedDate: format(new Date(), 'yyyy-MM-dd'),
    receivedCrypto: 'USDT',
    receivingWalletAddress: '',
    transactionReference: '',
    arrivalComment: ''
  });
  const fullFinanceAccess = ['Administrator', 'Manager', 'Financial Manager'].includes(currentUser.role);
  const [financeMonth, setFinanceMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [opsOverview, setOpsOverview] = useState<any>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [expenseDrafts, setExpenseDrafts] = useState<Record<string, { amount: string; status: string; notes: string }>>({});
  const [payrollDrafts, setPayrollDrafts] = useState<Record<string, { fines: string; notWorkedDays: string; notes: string }>>({});

  const loadData = async () => {
    if (!allowed) return;

    try {
      setLoading(true);

      const [financeData, auditData, overviewData] = await Promise.all([
        firestoreService.getFinanceDepositsForUser(currentUser),
        currentUser.role === 'Administrator'
          ? firestoreService.getFinanceAuditLogs(currentUser.id)
          : Promise.resolve([]),
        fullFinanceAccess
          ? firestoreService.getSimpleFinanceWorkspace(currentUser, financeMonth)
          : Promise.resolve(null)
      ]);

      setDeposits(financeData as any[]);
      setAuditLogs(auditData as any[]);
      setOpsOverview(overviewData);

      if (overviewData) {
        const nextExpenseDrafts: Record<string, { amount: string; status: string; notes: string }> = {};
        (overviewData.expenseRows || []).forEach((row: any) => {
          nextExpenseDrafts[String(row.categoryId)] = {
            amount: String(row.amount ?? 0),
            status: String(row.status || 'Expected'),
            notes: String(row.notes || '')
          };
        });
        setExpenseDrafts(nextExpenseDrafts);

        const nextPayrollDrafts: Record<string, { fines: string; notWorkedDays: string; notes: string }> = {};
        (overviewData.payrollRows || []).forEach((row: any) => {
          nextPayrollDrafts[String(row.employeeId)] = {
            fines: String(row.fines ?? 0),
            notWorkedDays: String(row.notWorkedDays ?? 0),
            notes: String(row.notes || '')
          };
        });
        setPayrollDrafts(nextPayrollDrafts);
      }
    } catch (err) {
      console.error('Finance load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id, currentUser.role, financeMonth]);

  const filtered = useMemo(() => {
    if (tab === 'Pending') {
      return deposits.filter(deposit =>
        ['Pending', 'Solution Pending'].includes(
          String(deposit.status || 'Pending')
        )
      );
    }

    return deposits.filter(
      deposit => String(deposit.status || '') === tab
    );
  }, [deposits, tab]);

  const totals = useMemo(() => {
    const sum = (statuses: string[]) =>
      deposits
        .filter(d => statuses.includes(String(d.status || '')))
        .reduce(
          (total, d) => total + Number(d.amount || 0),
          0
        );

    return {
      pending: sum(['Pending', 'Solution Pending']),
      approved: sum(['Approved']),
      rejected: sum(['Rejected']),
      onSolution: sum(['On Solution']),
      arrivalPending: sum(['Arrival Pending'])
    };
  }, [deposits]);

  const overdueSolutionTotal = useMemo(() => {
    const now = Date.now();

    return deposits
      .filter((deposit: any) => {
        if (deposit.status !== 'On Solution') return false;
        const expected = toDate(deposit.expectedArrivalDate);
        return !!expected && expected.getTime() < now;
      })
      .reduce(
        (sum, deposit) => sum + Number(deposit.amount || 0),
        0
      );
  }, [deposits]);

  const openArrivalForm = (deposit: any) => {
    setArrivalEditing(deposit);
    setArrivalDraft({
      receivedAmount: String(
        deposit.receivedAmount ??
        deposit.amount ??
        ''
      ),
      receivedDate:
        String(deposit.receivedDate || '').trim() ||
        format(new Date(), 'yyyy-MM-dd'),
      receivedCrypto:
        String(
          deposit.receivedCrypto ||
          deposit.crypto ||
          'USDT'
        ),
      receivingWalletAddress:
        String(
          deposit.receivingWalletAddress ||
          ''
        ),
      transactionReference:
        String(deposit.arrivalTransactionReference || ''),
      arrivalComment:
        String(deposit.arrivalComment || '')
    });
  };

  const closeArrivalForm = () => {
    if (arrivalBusy) return;
    setArrivalEditing(null);
  };

  const submitArrivalDetails = async () => {
    if (!arrivalEditing) return;

    const receivedAmount = Number(arrivalDraft.receivedAmount || 0);

    if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
      return alert('Actually Received amount must be greater than 0.');
    }

    if (!arrivalDraft.receivedDate) {
      return alert('Received Date is required.');
    }

    if (!arrivalDraft.receivingWalletAddress.trim()) {
      return alert('Receiving Wallet / Account is required.');
    }

    if (!arrivalDraft.receivedCrypto.trim()) {
      return alert('Received Crypto / Currency is required.');
    }

    try {
      setArrivalBusy(true);

      await firestoreService.submitFinanceSolutionArrival(
        arrivalEditing.id,
        currentUser.id,
        {
          ...arrivalDraft,
          receivedAmount
        }
      );

      setArrivalEditing(null);
      setTab('Arrival Pending');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to submit Solution arrival.');
    } finally {
      setArrivalBusy(false);
    }
  };

  const review = async (
    deposit: any,
    decision: 'Approved' | 'Rejected',
    reason = ''
  ) => {
    try {
      setReviewingId(deposit.id);

      await firestoreService.reviewFinanceDeposit(
        deposit.id,
        currentUser.id,
        decision,
        reason
      );

      setRejecting(null);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Finance review failed.');
    } finally {
      setReviewingId('');
    }
  };

  const approveLabel = (deposit: any) => {
    if (deposit.status === 'Solution Pending') {
      return 'Approve Solution';
    }

    if (deposit.status === 'Arrival Pending') {
      return 'Confirm Arrived';
    }

    return 'Approve';
  };

  const saveExpenseRow = async (row: any) => {
    const draft = expenseDrafts[String(row.categoryId)] || {
      amount: String(row.amount || 0),
      status: row.status || 'Expected',
      notes: row.notes || ''
    };

    try {
      setEntryBusy(true);
      await firestoreService.saveMonthlyExpense(
        {
          monthKey: financeMonth,
          categoryId: row.categoryId,
          amount: Number(draft.amount || 0),
          status: draft.status,
          notes: draft.notes
        },
        currentUser.id
      );
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to save expense.');
    } finally {
      setEntryBusy(false);
    }
  };

  const savePayrollRow = async (row: any) => {
    const draft = payrollDrafts[String(row.employeeId)] || {
      fines: String(row.fines || 0),
      notWorkedDays: String(row.notWorkedDays || 0),
      notes: row.notes || ''
    };

    try {
      setEntryBusy(true);
      await firestoreService.saveMonthlyPayrollAdjustment(
        {
          monthKey: financeMonth,
          employeeId: row.employeeId,
          fines: Number(draft.fines || 0),
          notWorkedDays: Number(draft.notWorkedDays || 0),
          notes: draft.notes
        },
        currentUser.id
      );
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to save payroll row.');
    } finally {
      setEntryBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="p-8 text-center">
        <ShieldCheck className="w-12 h-12 text-rose-400 mx-auto mb-4" />
        <h1 className="text-xl text-white font-semibold">
          Finance Access Denied
        </h1>
        <p className="text-slate-500 mt-2">
          This page is restricted to authorized finance reviewers.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Finance
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Received deposits, Solution pipeline, arrival approvals and immutable review history.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              loading ? 'animate-spin' : ''
            }`}
          />
          Refresh
        </button>
      </div>

      {fullFinanceAccess && (
        <div className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#0A0F1C] border border-white/5 rounded-xl p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-violet-400 font-bold">
                Financial Manager Workspace
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Admin configures the rules. Finance only fills monthly expenses, fines and not-worked days.
              </p>
            </div>

            <input
              type="month"
              value={financeMonth}
              onChange={e => setFinanceMonth(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <OpsMetric label="Approved Revenue" value={opsOverview?.approvedRevenue || 0} cls="text-emerald-400" />
            <OpsMetric label="On Solution" value={opsOverview?.onSolution || 0} cls="text-blue-400" />
            <OpsMetric label="Company Expenses" value={opsOverview?.totalExpenses || 0} cls="text-rose-400" />
            <OpsMetric label="Total Payroll" value={opsOverview?.totalPayroll || 0} cls="text-violet-400" />
            <OpsMetric label="Total Bonus" value={opsOverview?.totalBonus || 0} cls="text-cyan-400" />
            <OpsMetric
              label="Net Profit"
              value={opsOverview?.netProfit || 0}
              cls={(opsOverview?.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}
            />
            <OpsMetric
              label="Projected Month End"
              value={opsOverview?.projectedMonthEnd || 0}
              cls={(opsOverview?.projectedMonthEnd || 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'}
            />
          </div>

          {/* Simple company expenses */}
          <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Company Expenses</h3>
                  <p className="text-xs text-slate-500">
                    Fill the amounts for the expense names created by Administrator.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Total Expense</p>
                <p className="text-xl font-bold text-rose-400">{money(opsOverview?.totalExpenses || 0)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <th className="py-3">Expense</th>
                    <th>Amount $</th>
                    <th>Status</th>
                    <th>Comment</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(opsOverview?.expenseRows || []).map((row: any) => {
                    const draft = expenseDrafts[String(row.categoryId)] || {
                      amount: String(row.amount || 0),
                      status: row.status || 'Expected',
                      notes: row.notes || ''
                    };

                    return (
                      <tr key={row.categoryId}>
                        <td className="py-3 text-sm font-semibold text-white">{row.name}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.amount}
                            onChange={e =>
                              setExpenseDrafts(prev => ({
                                ...prev,
                                [String(row.categoryId)]: {
                                  ...draft,
                                  amount: e.target.value
                                }
                              }))
                            }
                            className="w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </td>
                        <td>
                          <select
                            value={draft.status}
                            onChange={e =>
                              setExpenseDrafts(prev => ({
                                ...prev,
                                [String(row.categoryId)]: {
                                  ...draft,
                                  status: e.target.value
                                }
                              }))
                            }
                            className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                          >
                            <option value="Expected">Expected</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </td>
                        <td>
                          <input
                            value={draft.notes}
                            onChange={e =>
                              setExpenseDrafts(prev => ({
                                ...prev,
                                [String(row.categoryId)]: {
                                  ...draft,
                                  notes: e.target.value
                                }
                              }))
                            }
                            placeholder="Optional comment"
                            className="w-full min-w-[180px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                          />
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => saveExpenseRow(row)}
                            disabled={entryBusy}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {(!opsOverview?.expenseRows || opsOverview.expenseRows.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-600">
                        Administrator has not configured expense names yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Simple payroll */}
          <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Employee Payroll</h3>
                  <p className="text-xs text-slate-500">
                    Revenue and bonus are automatic. Fill only fines and not-worked days.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Total Payroll</p>
                <p className="text-xl font-bold text-violet-400">{money(opsOverview?.totalPayroll || 0)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <th className="py-3">Employee</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Fixed Salary</th>
                    <th className="text-right">Bonus %</th>
                    <th className="text-right">Bonus</th>
                    <th className="text-right">1 Day Salary</th>
                    <th>Fines $</th>
                    <th>Not Worked</th>
                    <th className="text-right">Deduction</th>
                    <th className="text-right">Final Salary</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(opsOverview?.payrollRows || []).map((row: any) => {
                    const draft = payrollDrafts[String(row.employeeId)] || {
                      fines: String(row.fines || 0),
                      notWorkedDays: String(row.notWorkedDays || 0),
                      notes: row.notes || ''
                    };

                    const localFines = Number(draft.fines || 0);
                    const localNotWorked = Number(draft.notWorkedDays || 0);
                    const localDeduction = Number(row.oneDaySalary || 0) * localNotWorked;
                    const localFinal = Math.max(
                      0,
                      Number(row.fixedSalary || 0) +
                        Number(row.bonus || 0) -
                        localFines -
                        localDeduction
                    );

                    return (
                      <tr key={row.employeeId}>
                        <td className="py-3">
                          <p className="text-sm font-semibold text-white">{row.employeeName}</p>
                          <p className="text-[10px] text-slate-500">{row.employeeRole} • {row.teamName || 'No Team'}</p>
                        </td>
                        <td className="text-right text-sm font-bold text-emerald-400">{money(row.revenue)}</td>
                        <td className="text-right text-sm text-white">{money(row.fixedSalary)}</td>
                        <td className="text-right text-sm text-cyan-400">{Number(row.bonusPercent || 0)}%</td>
                        <td className="text-right text-sm font-bold text-cyan-400">{money(row.bonus)}</td>
                        <td className="text-right text-sm text-slate-300">{money(row.oneDaySalary)}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.fines}
                            onChange={e =>
                              setPayrollDrafts(prev => ({
                                ...prev,
                                [String(row.employeeId)]: {
                                  ...draft,
                                  fines: e.target.value
                                }
                              }))
                            }
                            className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={draft.notWorkedDays}
                            onChange={e =>
                              setPayrollDrafts(prev => ({
                                ...prev,
                                [String(row.employeeId)]: {
                                  ...draft,
                                  notWorkedDays: e.target.value
                                }
                              }))
                            }
                            className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white"
                          />
                        </td>
                        <td className="text-right text-sm text-rose-400">{money(localDeduction)}</td>
                        <td className="text-right text-sm font-bold text-violet-400">{money(localFinal)}</td>
                        <td className="text-right">
                          <button
                            onClick={() => savePayrollRow(row)}
                            disabled={entryBusy}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {(!opsOverview?.payrollRows || opsOverview.payrollRows.length === 0) && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-sm text-slate-600">
                        Administrator has not configured employee salaries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-5 border-t border-white/5">
              <MiniTotal label="Fixed Salary" value={opsOverview?.totalFixedSalary || 0} />
              <MiniTotal label="Bonus Total" value={opsOverview?.totalBonus || 0} />
              <MiniTotal label="Fines" value={opsOverview?.totalFines || 0} />
              <MiniTotal label="Not Worked Deduction" value={opsOverview?.totalNotWorkedDeduction || 0} />
              <MiniTotal label="Final Payroll" value={opsOverview?.totalPayroll || 0} emphasis />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Summary
          icon={<Clock3 className="w-5 h-5 text-amber-400" />}
          value={totals.pending}
          count={deposits.filter(d =>
            ['Pending', 'Solution Pending'].includes(d.status)
          ).length}
          label="Pending Approval"
          valueClass="text-amber-400"
        />

        <Summary
          icon={<Route className="w-5 h-5 text-blue-400" />}
          value={totals.onSolution}
          count={deposits.filter(d => d.status === 'On Solution').length}
          label="On Solution"
          valueClass="text-blue-400"
        />

        <Summary
          icon={<Truck className="w-5 h-5 text-orange-400" />}
          value={totals.arrivalPending}
          count={deposits.filter(d => d.status === 'Arrival Pending').length}
          label="Arrival Pending"
          valueClass="text-orange-400"
        />

        <Summary
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          value={totals.approved}
          count={deposits.filter(d => d.status === 'Approved').length}
          label="Approved Gross"
          valueClass="text-emerald-400"
        />

        <Summary
          icon={<XCircle className="w-5 h-5 text-rose-400" />}
          value={totals.rejected}
          count={deposits.filter(d => d.status === 'Rejected').length}
          label="Rejected Gross"
          valueClass="text-rose-400"
        />
      </div>

      {overdueSolutionTotal > 0 && (
        <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <div>
              <p className="text-sm font-semibold text-white">
                Overdue Solution Funds
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Expected arrival date has passed.
              </p>
            </div>
          </div>
          <p className="text-xl font-bold text-rose-400">
            {money(overdueSolutionTotal)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-[#0A0F1C] border border-white/5 p-1 rounded-xl w-fit">
        {(
          [
            'Pending',
            'On Solution',
            'Arrival Pending',
            'Approved',
            'Rejected'
          ] as FinanceTab[]
        ).map(status => (
          <button
            key={status}
            onClick={() => setTab(status)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === status
                ? 'bg-white/10 text-white'
                : 'text-slate-500 hover:text-white'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            Loading finance records...
          </div>
        ) : filtered.length > 0 ? (
          filtered.map(deposit => {
            const expanded = expandedId === deposit.id;
            const submittedDate = toDate(deposit.submittedAt);
            const expectedDate = toDate(deposit.expectedArrivalDate);
            const overdue =
              deposit.status === 'On Solution' &&
              !!expectedDate &&
              expectedDate.getTime() < Date.now();

            return (
              <div
                key={deposit.id}
                className={`bg-[#0A0F1C] border rounded-xl overflow-hidden ${
                  overdue
                    ? 'border-rose-500/20'
                    : 'border-white/5'
                }`}
              >
                <div className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 flex-1">
                    <Field
                      label="Client"
                      value={deposit.clientFullName || '—'}
                    />
                    <Field
                      label="Amount"
                      value={money(deposit.amount)}
                      valueClass="text-emerald-400 font-bold"
                    />
                    <Field
                      label="Type"
                      value={deposit.depositType || 'Received'}
                      valueClass={
                        deposit.depositType === 'On Solution'
                          ? 'text-blue-400'
                          : 'text-slate-300'
                      }
                    />
                    <Field
                      label="Solution"
                      value={deposit.solutionName || '—'}
                    />
                    <Field
                      label="Agent"
                      value={
                        deposit.agentName ||
                        deposit.submittedByName ||
                        '—'
                      }
                    />
                    <Field
                      label="Submitted"
                      value={
                        submittedDate
                          ? format(
                              submittedDate,
                              'MMM d, HH:mm'
                            )
                          : '—'
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setExpandedId(expanded ? '' : deposit.id)
                      }
                      className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400"
                    >
                      {expanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {deposit.status === 'On Solution' && (
                      <button
                        onClick={() => openArrivalForm(deposit)}
                        disabled={arrivalBusy}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
                      >
                        <Truck className="w-4 h-4" />
                        Record Arrival
                      </button>
                    )}

                    {[
                      'Pending',
                      'Solution Pending',
                      'Arrival Pending'
                    ].includes(deposit.status) && (
                      <>
                        <button
                          onClick={() =>
                            review(deposit, 'Approved')
                          }
                          disabled={
                            reviewingId === deposit.id
                          }
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {approveLabel(deposit)}
                        </button>

                        <button
                          onClick={() => {
                            setRejecting(deposit);
                            setRejectReason('');
                          }}
                          disabled={
                            reviewingId === deposit.id
                          }
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-semibold"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/5 p-5 bg-white/[0.01] space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <Detail label="Country" value={deposit.country} />
                      <Detail label="Email" value={deposit.email} />
                      <Detail label="Phone" value={deposit.phoneNumber} />
                      <Detail label="Wallet" value={deposit.walletAddress} />
                      <Detail
                        label="Lead Source / ID"
                        value={deposit.leadSourceId}
                      />
                      <Detail
                        label="Ret Name"
                        value={deposit.retName}
                      />
                      <Detail
                        label="Deposit Date"
                        value={deposit.depositDate}
                      />
                      <Detail
                        label="Team"
                        value={deposit.teamName}
                      />
                      <Detail
                        label="System Submitter"
                        value={deposit.submittedByName}
                      />

                      {deposit.depositType === 'On Solution' && (
                        <>
                          <Detail
                            label="Solution"
                            value={deposit.solutionName}
                          />
                          <Detail
                            label="Solution Full Name"
                            value={deposit.solutionFullName}
                          />
                          <Detail
                            label="Payment Comment"
                            value={deposit.solutionPaymentComment}
                          />
                          <Detail
                            label="Expected Days"
                            value={
                              deposit.expectedArrivalDays
                                ? `${deposit.expectedArrivalDays} day(s)`
                                : '—'
                            }
                          />
                          <Detail
                            label="Expected Arrival"
                            value={
                              expectedDate
                                ? format(
                                    expectedDate,
                                    'MMM d, yyyy'
                                  )
                                : '—'
                            }
                          />
                          <Detail
                            label="Arrival Status"
                            value={
                              deposit.arrivalStatus ||
                              'Not Arrived'
                            }
                          />
                          {deposit.receivedAmount != null && (
                            <>
                              <Detail
                                label="Originally Sent"
                                value={money(
                                  deposit.originalSentAmount ??
                                  deposit.amount
                                )}
                              />
                              <Detail
                                label="Actually Received"
                                value={money(deposit.receivedAmount)}
                              />
                              <Detail
                                label="Variance"
                                value={`${money(
                                  deposit.varianceAmount || 0
                                )} (${Number(
                                  deposit.variancePercent || 0
                                ).toFixed(2)}%)`}
                              />
                              <Detail
                                label="Received Date"
                                value={deposit.receivedDate || '—'}
                              />
                              <Detail
                                label="Received Crypto / Currency"
                                value={
                                  deposit.receivedCrypto || '—'
                                }
                              />
                              <Detail
                                label="Receiving Wallet / Account"
                                value={
                                  deposit.receivingWalletAddress ||
                                  '—'
                                }
                              />
                              <Detail
                                label="Transaction / Reference"
                                value={
                                  deposit.arrivalTransactionReference ||
                                  '—'
                                }
                              />
                              <Detail
                                label="Arrival Comment"
                                value={
                                  deposit.arrivalComment ||
                                  '—'
                                }
                              />
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Attribution / Split
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(deposit.allocations || []).map(
                          (allocation: any) => (
                            <div
                              key={`${deposit.id}-${allocation.userId}`}
                              className="rounded-lg bg-white/[0.02] border border-white/5 p-3 flex items-center justify-between"
                            >
                              <div>
                                <p className="text-sm font-medium text-white">
                                  {allocation.userName}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {allocation.role} •{' '}
                                  {allocation.percentage}%
                                </p>
                              </div>
                              <p className="text-sm font-bold text-emerald-400">
                                {money(allocation.amount)}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {Array.isArray(deposit.arrivalAllocations) &&
                      deposit.arrivalAllocations.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                            Arrival Attribution / Split
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {deposit.arrivalAllocations.map(
                              (allocation: any) => (
                                <div
                                  key={`${deposit.id}-arrival-${allocation.userId}`}
                                  className="rounded-lg bg-blue-500/[0.03] border border-blue-500/10 p-3 flex items-center justify-between"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-white">
                                      {allocation.userName}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      {allocation.role} •{' '}
                                      {allocation.percentage}%
                                    </p>
                                  </div>
                                  <p className="text-sm font-bold text-cyan-400">
                                    {money(allocation.amount)}
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {overdue && (
                      <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 p-3 text-sm text-rose-300">
                        Expected arrival date has passed.
                      </div>
                    )}

                    {deposit.arrivalStatus === 'Rejected' &&
                      deposit.arrivalRejectReason && (
                        <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3 text-sm text-amber-300">
                          Last Arrival Reject Reason:{' '}
                          {deposit.arrivalRejectReason}
                        </div>
                      )}

                    {deposit.status === 'Rejected' && (
                      <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 p-3 text-sm text-rose-300">
                        Reject Reason:{' '}
                        {deposit.rejectReason || '—'}
                      </div>
                    )}

                    {deposit.status === 'Approved' && (
                      <div className="text-xs text-emerald-400">
                        Approved by{' '}
                        {deposit.approvedByName ||
                          'Reviewer'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center text-slate-500 bg-[#0A0F1C] border border-white/5 rounded-xl">
            No {tab.toLowerCase()} finance records.
          </div>
        )}
      </div>

      {currentUser.role === 'Administrator' && (
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-violet-400" />
            <h3 className="text-lg font-semibold text-white">
              Finance Audit History
            </h3>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {auditLogs.map(log => {
              const date = toDate(log.createdAt);

              return (
                <div
                  key={log.id}
                  className="rounded-lg bg-white/[0.02] border border-white/5 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-semibold text-white">
                        {log.changedByName || 'Unknown'}
                      </span>
                      <span className="text-xs text-violet-400 ml-2">
                        {log.action}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-600">
                      {date
                        ? format(
                            date,
                            'MMM d, HH:mm:ss'
                          )
                        : '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Deposit #{log.depositId}
                  </p>
                </div>
              );
            })}

            {auditLogs.length === 0 && (
              <p className="text-sm text-slate-600 py-8 text-center">
                No finance audit records yet.
              </p>
            )}
          </div>
        </div>
      )}

      {arrivalEditing && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden bg-[#0A0F1C] border border-blue-500/20 rounded-2xl shadow-2xl flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <Truck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Record Solution Arrival
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Record what actually reached the company. It will move to Arrival Pending for final approval.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeArrivalForm}
                disabled={arrivalBusy}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-50"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ArrivalMetric
                  label="Sent to Solution"
                  value={money(
                    arrivalEditing.originalSentAmount ??
                    arrivalEditing.amount
                  )}
                  cls="text-blue-400"
                />
                <ArrivalMetric
                  label="Actually Received"
                  value={money(
                    Number(arrivalDraft.receivedAmount || 0)
                  )}
                  cls="text-emerald-400"
                />
                <ArrivalMetric
                  label="Variance"
                  value={money(
                    Number(arrivalDraft.receivedAmount || 0) -
                    Number(
                      arrivalEditing.originalSentAmount ??
                      arrivalEditing.amount ??
                      0
                    )
                  )}
                  cls={
                    Number(arrivalDraft.receivedAmount || 0) -
                      Number(
                        arrivalEditing.originalSentAmount ??
                        arrivalEditing.amount ??
                        0
                      ) >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                />
                <ArrivalMetric
                  label="Solution"
                  value={arrivalEditing.solutionName || '—'}
                  cls="text-violet-300"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ArrivalInput
                  label="Actually Received $"
                  type="number"
                  value={arrivalDraft.receivedAmount}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      receivedAmount: value
                    }))
                  }
                  required
                />

                <ArrivalInput
                  label="Received Date"
                  type="date"
                  value={arrivalDraft.receivedDate}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      receivedDate: value
                    }))
                  }
                  required
                />

                <ArrivalInput
                  label="Received Crypto / Currency"
                  value={arrivalDraft.receivedCrypto}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      receivedCrypto: value
                    }))
                  }
                  placeholder="USDT / BTC / ETH / USD..."
                  required
                />

                <ArrivalInput
                  label="Receiving Wallet / Account"
                  value={arrivalDraft.receivingWalletAddress}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      receivingWalletAddress: value
                    }))
                  }
                  placeholder="Wallet address / bank account / internal destination"
                  required
                />

                <ArrivalInput
                  label="Transaction / Reference ID"
                  value={arrivalDraft.transactionReference}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      transactionReference: value
                    }))
                  }
                  placeholder="Optional transaction hash / reference"
                />

                <ArrivalInput
                  label="Arrival Comment"
                  value={arrivalDraft.arrivalComment}
                  onChange={(value: string) =>
                    setArrivalDraft(prev => ({
                      ...prev,
                      arrivalComment: value
                    }))
                  }
                  placeholder="Optional finance comment"
                />
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Split Preview
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Original percentages are preserved. Final credited amounts are recalculated from the amount actually received.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(arrivalEditing.allocations || []).map(
                    (allocation: any) => {
                      const received = Number(
                        arrivalDraft.receivedAmount || 0
                      );
                      const calculated = Number(
                        (
                          received *
                          Number(allocation.percentage || 0) /
                          100
                        ).toFixed(2)
                      );

                      return (
                        <div
                          key={`arrival-preview-${allocation.userId}`}
                          className="rounded-lg border border-white/5 bg-[#0B1220] p-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-white">
                              {allocation.userName}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {allocation.role} • {allocation.percentage}%
                            </p>
                          </div>
                          <p className="text-sm font-bold text-cyan-400">
                            {money(calculated)}
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-300 leading-relaxed">
                  Submitting does not count this money as approved revenue yet. The record moves to <strong>Arrival Pending</strong>. After final approval, the actually received amount and recalculated splits become the real company/agent revenue.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 flex items-center justify-end gap-3 shrink-0 bg-[#0A0F1C]">
              <button
                type="button"
                onClick={closeArrivalForm}
                disabled={arrivalBusy}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitArrivalDetails}
                disabled={arrivalBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {arrivalBusy ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Submit for Arrival Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0A0F1C] border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-white">
              Reject Finance Action
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              A reason is required. Arrival rejection returns the record to On Solution.
            </p>

            <textarea
              autoFocus
              value={rejectReason}
              onChange={e =>
                setRejectReason(e.target.value)
              }
              rows={5}
              className="w-full mt-5 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              placeholder="Enter reject reason..."
            />

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => {
                  setRejecting(null);
                  setRejectReason('');
                }}
                className="px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                onClick={() =>
                  review(
                    rejecting,
                    'Rejected',
                    rejectReason
                  )
                }
                disabled={
                  !rejectReason.trim() ||
                  reviewingId === rejecting.id
                }
                className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniTotal({
  label,
  value,
  emphasis = false
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'bg-violet-500/10 border-violet-500/20' : 'bg-white/[0.02] border-white/5'}`}>
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-sm font-bold mt-1 ${emphasis ? 'text-violet-400' : 'text-white'}`}>{money(value)}</p>
    </div>
  );
}

function OpsMetric({ label, value, cls }: any) {
  return <div className="rounded-xl bg-[#0A0F1C] border border-white/5 p-4"><p className={`text-xl font-bold ${cls}`}>{money(value)}</p><p className="text-[10px] uppercase text-slate-500 mt-1">{label}</p></div>;
}

function Summary({
  icon,
  value,
  count,
  label,
  valueClass
}: any) {
  return (
    <div className="rounded-xl bg-[#0A0F1C] border border-white/5 p-5">
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-xs text-slate-500">
          {count} records
        </span>
      </div>
      <p className={`text-2xl font-bold mt-4 ${valueClass}`}>
        {money(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {label}
      </p>
    </div>
  );
}

function ArrivalMetric({
  label,
  value,
  cls = 'text-white'
}: {
  label: string;
  value: string;
  cls?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`text-base font-bold mt-1 ${cls}`}>
        {value}
      </p>
    </div>
  );
}

function ArrivalInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        {label}{required ? ' *' : ''}
      </label>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        min={type === 'number' ? '0.01' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
    </div>
  );
}

function Field({
  label,
  value,
  valueClass = 'text-slate-300'
}: any) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-600">
        {label}
      </p>
      <p className={`text-sm mt-1 ${valueClass}`}>
        {value || '—'}
      </p>
    </div>
  );
}

function Detail({ label, value }: any) {
  return (
    <div>
      <span className="text-slate-600">
        {label}:
      </span>
      <span className="text-slate-300 ml-2 break-all">
        {value || '—'}
      </span>
    </div>
  );
}
