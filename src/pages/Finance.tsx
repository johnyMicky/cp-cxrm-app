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
  Check
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
  const fullFinanceAccess = ['Administrator', 'Manager', 'Financial Manager'].includes(currentUser.role);
  const [financeMonth, setFinanceMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [catalog, setCatalog] = useState<any[]>([]);
  const [opsOverview, setOpsOverview] = useState<any>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryForm, setEntryForm] = useState({ catalogId:'', assignedUserId:'', baseAmount:'', amount:'', entryDate: format(new Date(), 'yyyy-MM-dd'), dueDate: format(new Date(), 'yyyy-MM-dd'), status:'Expected', notes:'' });
  const [financeUsers, setFinanceUsers] = useState<any[]>([]);

  const loadData = async () => {
    if (!allowed) return;

    try {
      setLoading(true);

      const [financeData, auditData, catalogData, overviewData, usersData] = await Promise.all([
        firestoreService.getFinanceDepositsForUser(currentUser),
        currentUser.role === 'Administrator'
          ? firestoreService.getFinanceAuditLogs(currentUser.id)
          : Promise.resolve([]),
        fullFinanceAccess ? firestoreService.getFinanceCatalog() : Promise.resolve([]),
        fullFinanceAccess ? firestoreService.getFinanceManagerOverview(currentUser, financeMonth) : Promise.resolve(null),
        fullFinanceAccess ? firestoreService.getUsers() : Promise.resolve([])
      ]);

      setDeposits(financeData as any[]);
      setAuditLogs(auditData as any[]);
      setCatalog(catalogData as any[]);
      setOpsOverview(overviewData);
      setFinanceUsers(usersData as any[]);
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

  const selectedCatalog = catalog.find((item: any) => item.id === entryForm.catalogId);
  const calculatedEntryAmount = selectedCatalog?.calculationType === 'Percentage'
    ? (Number(entryForm.baseAmount || 0) * Number(selectedCatalog?.defaultValue || 0)) / 100
    : Number(entryForm.amount || selectedCatalog?.defaultValue || 0);

  const createFinanceEntry = async () => {
    if (!entryForm.catalogId) return alert('Choose an Admin-configured finance item.');
    try {
      setEntryBusy(true);
      await firestoreService.createFinanceOperationalEntry({
        ...entryForm,
        monthKey: financeMonth,
        baseAmount: Number(entryForm.baseAmount || 0),
        amount: Number(entryForm.amount || 0)
      }, currentUser.id);
      setEntryForm({ catalogId:'', assignedUserId:'', baseAmount:'', amount:'', entryDate: format(new Date(), 'yyyy-MM-dd'), dueDate: format(new Date(), 'yyyy-MM-dd'), status:'Expected', notes:'' });
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to create finance entry.');
    } finally { setEntryBusy(false); }
  };

  const markEntryPaid = async (entry: any) => {
    try {
      setEntryBusy(true);
      await firestoreService.updateFinanceOperationalEntryStatus(entry.id, entry.status === 'Paid' ? 'Expected' : 'Paid', currentUser.id);
      await loadData();
    } catch (err: any) { alert(err?.message || 'Failed to update finance entry.'); }
    finally { setEntryBusy(false); }
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
              <p className="text-xs uppercase tracking-wider text-violet-400 font-bold">Financial Manager Workspace</p>
              <p className="text-sm text-slate-400 mt-1">Administrator, Manager and Financial Manager share the same operating finance controls.</p>
            </div>
            <input type="month" value={financeMonth} onChange={e=>setFinanceMonth(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
            <OpsMetric label="Approved Revenue" value={opsOverview?.approvedRevenue || 0} cls="text-emerald-400" />
            <OpsMetric label="On Solution" value={opsOverview?.onSolution || 0} cls="text-blue-400" />
            <OpsMetric label="Paid Expenses" value={opsOverview?.paidExpenses || 0} cls="text-rose-400" />
            <OpsMetric label="Expected Expenses" value={opsOverview?.expectedExpenses || 0} cls="text-amber-400" />
            <OpsMetric label="Current Net" value={opsOverview?.currentNet || 0} cls={(opsOverview?.currentNet || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
            <OpsMetric label="Projected Month End" value={opsOverview?.projectedMonthEnd || 0} cls={(opsOverview?.projectedMonthEnd || 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'} />
          </div>

          <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4"><ReceiptText className="w-5 h-5 text-violet-400"/><h3 className="text-lg font-semibold text-white">Expenses, Payroll, Taxes & Adjustments</h3></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <select value={entryForm.catalogId} onChange={e=>setEntryForm(p=>({...p,catalogId:e.target.value, amount:''}))} className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"><option value="">Choose configured item...</option>{catalog.map((item:any)=><option key={item.id} value={item.id}>{item.type} — {item.name}</option>)}</select>
              <select value={entryForm.assignedUserId} onChange={e=>setEntryForm(p=>({...p,assignedUserId:e.target.value}))} className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"><option value="">Company / no employee</option>{financeUsers.map((u:any)=><option key={u.id} value={u.id}>{u.name || u.email} — {u.role}</option>)}</select>
              {selectedCatalog?.calculationType === 'Percentage' ? <input type="number" min="0" step="0.01" placeholder="Base amount $" value={entryForm.baseAmount} onChange={e=>setEntryForm(p=>({...p,baseAmount:e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" /> : <input type="number" min="0" step="0.01" placeholder={`Amount $${selectedCatalog?.defaultValue ? ` (default ${selectedCatalog.defaultValue})` : ''}`} value={entryForm.amount} onChange={e=>setEntryForm(p=>({...p,amount:e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" />}
              <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5 text-sm"><span className="text-slate-500">Calculated: </span><span className="text-white font-bold">{money(calculatedEntryAmount || 0)}</span></div>
              <input type="date" value={entryForm.entryDate} onChange={e=>setEntryForm(p=>({...p,entryDate:e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" />
              <input type="date" value={entryForm.dueDate} onChange={e=>setEntryForm(p=>({...p,dueDate:e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" />
              <select value={entryForm.status} onChange={e=>setEntryForm(p=>({...p,status:e.target.value}))} className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"><option value="Expected">Expected</option><option value="Paid">Paid</option></select>
              <input value={entryForm.notes} onChange={e=>setEntryForm(p=>({...p,notes:e.target.value}))} placeholder="Comment / reason" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" />
            </div>
            <div className="flex justify-end mt-3"><button onClick={createFinanceEntry} disabled={entryBusy || !entryForm.catalogId} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"><Plus className="w-4 h-4"/>Add Finance Entry</button></div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left"><thead><tr className="text-[10px] uppercase text-slate-500 border-b border-white/5"><th className="py-3">Type</th><th>Item</th><th>Employee</th><th>Due</th><th className="text-right">Amount</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody className="divide-y divide-white/5">{(opsOverview?.entries || []).map((entry:any)=><tr key={entry.id}><td className="py-3 text-xs text-violet-400">{entry.type}</td><td className="text-sm text-white">{entry.catalogName}</td><td className="text-xs text-slate-400">{entry.assignedUserName || 'Company'}</td><td className="text-xs text-slate-400">{entry.dueDate || '—'}</td><td className="text-right text-sm font-bold text-white">{money(entry.amount)}</td><td><span className={`text-[10px] font-bold uppercase ${entry.status === 'Paid' ? 'text-emerald-400' : 'text-amber-400'}`}>{entry.status}</span></td><td className="text-right"><button onClick={()=>markEntryPaid(entry)} disabled={entryBusy} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300">{entry.status === 'Paid' ? 'Mark Expected' : 'Mark Paid'}</button></td></tr>)}{(!opsOverview?.entries || opsOverview.entries.length===0) && <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-600">No finance entries for this month.</td></tr>}</tbody></table>
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
