import { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  WalletCards,
  Clock3,
  CheckCircle2,
  XCircle,
  Loader2,
  Route,
  Truck,
  AlertTriangle
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';

type SplitRow = { userId: string; percentage: string };

const todayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

export default function AgentFinancePanel() {
  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserName = localStorage.getItem('userName') || '';

  const [users, setUsers] = useState<any[]>([]);
  const [solutions, setSolutions] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [arrivingId, setArrivingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [splits, setSplits] = useState<SplitRow[]>([]);

  const [form, setForm] = useState({
    depositType: 'Received',
    clientFullName: '',
    country: '',
    email: '',
    phoneNumber: '',
    walletAddress: '',
    method: 'Crypto',
    amount: '',
    crypto: 'USDT',
    cryptoOther: '',
    depositDate: todayKey(),
    leadSourceId: '',
    retName: '',
    agentName: currentUserName,
    solutionId: '',
    solutionFullName: '',
    solutionPaymentComment: '',
    expectedArrivalDays: '3'
  });

  const loadPortfolio = async () => {
    if (!currentUserId) return;
    const result = await firestoreService.getFinancePortfolio(currentUserId);
    setPortfolio(result);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [allUsers, financeSolutions] = await Promise.all([
          firestoreService.getUsers(),
          firestoreService.getFinanceSolutions(),
          loadPortfolio()
        ]);

        setUsers(
          (allUsers as any[]).filter(
            user => String(user.id) !== String(currentUserId)
          )
        );
        setSolutions(financeSolutions as any[]);
      } catch (err) {
        console.error('Failed to load finance form:', err);
      }
    };

    load();
  }, [currentUserId]);

  const splitPercentage = useMemo(
    () =>
      splits.reduce(
        (sum, split) => sum + Number(split.percentage || 0),
        0
      ),
    [splits]
  );

  const ownerPercentage = Math.max(0, 100 - splitPercentage);
  const numericAmount = Number(form.amount || 0);

  const resetForm = () => {
    setForm({
      depositType: 'Received',
      clientFullName: '',
      country: '',
      email: '',
      phoneNumber: '',
      walletAddress: '',
      method: 'Crypto',
      amount: '',
      crypto: 'USDT',
      cryptoOther: '',
      depositDate: todayKey(),
      leadSourceId: '',
      retName: '',
      agentName: currentUserName,
      solutionId: '',
      solutionFullName: '',
      solutionPaymentComment: '',
      expectedArrivalDays: '3'
    });
    setSplits([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.clientFullName.trim()) {
      return setError('Client Full Name is required.');
    }

    if (!numericAmount || numericAmount <= 0) {
      return setError('Amount must be greater than 0.');
    }

    if (splitPercentage > 100) {
      return setError('Split percentages cannot exceed 100%.');
    }

    if (form.crypto === 'Other' && !form.cryptoOther.trim()) {
      return setError('Please specify the crypto type.');
    }

    if (
      splits.some(
        split => !split.userId || Number(split.percentage || 0) <= 0
      )
    ) {
      return setError(
        'Every Split With row needs a user and a percentage.'
      );
    }

    if (form.depositType === 'On Solution') {
      if (!form.solutionId) {
        return setError('Please select a Solution.');
      }

      if (!form.solutionFullName.trim()) {
        return setError('Solution Full Name is required.');
      }

      if (!form.solutionPaymentComment.trim()) {
        return setError('Payment Comment is required.');
      }

      if (Number(form.expectedArrivalDays || 0) < 1) {
        return setError('Expected Arrival must be at least 1 day.');
      }
    }

    try {
      setIsSubmitting(true);

      await firestoreService.submitFinanceDeposit(
        {
          ...form,
          amount: numericAmount,
          expectedArrivalDays: Number(form.expectedArrivalDays || 0),
          splits: splits.map(split => ({
            userId: split.userId,
            percentage: Number(split.percentage || 0)
          }))
        },
        currentUserId
      );

      setSuccess(
        form.depositType === 'On Solution'
          ? 'Solution record submitted. Status: Pending solution approval.'
          : 'Deposit submitted. Status: Pending approval.'
      );

      resetForm();
      setShowForm(false);
      await loadPortfolio();
    } catch (err: any) {
      console.error('Deposit submission failed:', err);
      setError(err?.message || 'Failed to submit deposit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const markArrived = async (record: any) => {
    if (!confirm(`Mark ${record.solutionName || 'solution'} as arrived? This will require a second approval.`)) {
      return;
    }

    try {
      setArrivingId(record.id);
      setError('');
      setSuccess('');

      await firestoreService.markFinanceSolutionArrived(
        record.id,
        currentUserId
      );

      setSuccess(
        'Arrival submitted for confirmation. Status: Arrival Pending.'
      );
      await loadPortfolio();
    } catch (err: any) {
      console.error('Mark arrived failed:', err);
      setError(err?.message || 'Failed to mark solution as arrived.');
    } finally {
      setArrivingId('');
    }
  };

  const solutionRecords = (portfolio?.records || []).filter((record: any) =>
    ['Solution Pending', 'On Solution', 'Arrival Pending'].includes(
      String(record.status || '')
    )
  );

  return (
    <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">
              My Finance Portfolio
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Submit received deposits or funds sent through a Solution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setError('');
            setSuccess('');
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Submit Finance
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mt-5">
        <Metric
          label="Submitted Approved"
          value={money(portfolio?.submittedApprovedGross || 0)}
          color="text-white"
        />
        <Metric
          label="Total Approved"
          value={money(portfolio?.approvedAttributed || 0)}
          color="text-emerald-400"
        />
        <Metric
          label="Split Earnings"
          value={money(portfolio?.splitEarnings || 0)}
          color="text-cyan-400"
        />
        <Metric
          label="Direct Pending"
          value={money(portfolio?.pendingAttributed || 0)}
          color="text-amber-400"
        />
        <Metric
          label="Solution Pending"
          value={money(portfolio?.solutionPendingAttributed || 0)}
          color="text-violet-400"
        />
        <Metric
          label="On Solution"
          value={money(portfolio?.onSolutionAttributed || 0)}
          color="text-blue-400"
        />
        <Metric
          label="Arrival Pending"
          value={money(portfolio?.arrivalPendingAttributed || 0)}
          color="text-orange-400"
        />
      </div>

      {success && (
        <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {error && !showForm && (
        <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="mt-6 border-t border-white/5 pt-6 space-y-5"
        >
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-1 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  depositType: 'Received',
                  solutionId: '',
                  solutionFullName: '',
                  solutionPaymentComment: ''
                }))
              }
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                form.depositType === 'Received'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4 inline mr-2" />
              Already Received
            </button>

            <button
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  depositType: 'On Solution'
                }))
              }
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                form.depositType === 'On Solution'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Route className="w-4 h-4 inline mr-2" />
              Send to Solution
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ['clientFullName', 'Client Full Name', 'text'],
              ['country', 'Country', 'text'],
              ['email', 'Email', 'email'],
              ['phoneNumber', 'Phone Number', 'text'],
              ['walletAddress', 'Wallet Address', 'text'],
              ['amount', 'Amount $', 'number'],
              ['leadSourceId', 'Lead Source / ID', 'text'],
              ['retName', 'Ret Name', 'text'],
              ['agentName', 'Agent Name', 'text'],
              ['depositDate', 'Date', 'date']
            ].map(([key, label, type]) => (
              <div key={key} className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  {label}
                </label>
                <input
                  type={type}
                  required={[
                    'clientFullName',
                    'amount',
                    'agentName',
                    'depositDate'
                  ].includes(key)}
                  min={key === 'amount' ? '0.01' : undefined}
                  step={key === 'amount' ? '0.01' : undefined}
                  value={(form as any)[key]}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      [key]: e.target.value
                    }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Method</label>
              <input
                type="text"
                list="agent-finance-method-options"
                value={form.method}
                onChange={e => setForm(prev => ({ ...prev, method: e.target.value }))}
                placeholder="Type or choose a method..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <datalist id="agent-finance-method-options">
                <option value="Crypto" />
                <option value="Bank Transfer" />
                <option value="Card" />
                <option value="Cash" />
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Crypto
              </label>
              <select
                value={form.crypto}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    crypto: e.target.value
                  }))
                }
                className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {form.crypto === 'Other' && (
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Other Crypto
                </label>
                <input
                  value={form.cryptoOther}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      cryptoOther: e.target.value
                    }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                  placeholder="Enter crypto name"
                />
              </div>
            )}
          </div>

          {form.depositType === 'On Solution' && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Solution Details
                  </p>
                  <p className="text-[11px] text-slate-500">
                    These funds are not counted as received revenue until Arrival is approved.
                  </p>
                </div>
              </div>

              {solutions.length === 0 ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    No active Solutions are configured. Ask an Administrator to add one in Settings.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      Solution
                    </label>
                    <select
                      value={form.solutionId}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          solutionId: e.target.value
                        }))
                      }
                      className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">Select Solution...</option>
                      {solutions.map(solution => (
                        <option key={solution.id} value={solution.id}>
                          {solution.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      Expected Arrival (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.expectedArrivalDays}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          expectedArrivalDays: e.target.value
                        }))
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      Solution Full Name
                    </label>
                    <input
                      value={form.solutionFullName}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          solutionFullName: e.target.value
                        }))
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                      placeholder="Full name used on the Solution"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      Payment Comment
                    </label>
                    <input
                      value={form.solutionPaymentComment}
                      onChange={e =>
                        setForm(prev => ({
                          ...prev,
                          solutionPaymentComment: e.target.value
                        }))
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                      placeholder="How / under what comment was it sent?"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  Split With
                </p>
                <p className="text-[11px] text-slate-500">
                  Remaining {ownerPercentage.toFixed(2)}% stays with you automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSplits(prev => [
                    ...prev,
                    { userId: '', percentage: '' }
                  ])
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Split
              </button>
            </div>

            <div className="space-y-2">
              {splits.map((split, index) => {
                const selectedElsewhere = new Set(
                  splits
                    .filter((_, rowIndex) => rowIndex !== index)
                    .map(row => row.userId)
                    .filter(Boolean)
                );

                return (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_110px_40px] gap-2"
                  >
                    <select
                      value={split.userId}
                      onChange={e =>
                        setSplits(prev =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...row,
                                  userId: e.target.value
                                }
                              : row
                          )
                        )
                      }
                      className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Select CRM user...</option>
                      {users
                        .filter(
                          user =>
                            !selectedElsewhere.has(String(user.id))
                        )
                        .map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name || user.email} — {user.role}
                          </option>
                        ))}
                    </select>

                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={split.percentage}
                        onChange={e =>
                          setSplits(prev =>
                            prev.map((row, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...row,
                                    percentage: e.target.value
                                  }
                                : row
                            )
                          )
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-7 text-sm text-white"
                        placeholder="%"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                        %
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSplits(prev =>
                          prev.filter(
                            (_, rowIndex) => rowIndex !== index
                          )
                        )
                      }
                      className="rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {splits.length === 0 && (
                <p className="text-xs text-slate-600 py-2">
                  No split recipients. You receive 100% attribution.
                </p>
              )}
            </div>

            {numericAmount > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                  <span className="text-slate-500">
                    Your attribution:
                  </span>
                  <span className="text-emerald-400 font-bold ml-2">
                    {ownerPercentage.toFixed(2)}% ={' '}
                    {money(
                      (numericAmount * ownerPercentage) / 100
                    )}
                  </span>
                </div>

                <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
                  <span className="text-slate-500">
                    Split total:
                  </span>
                  <span className="text-blue-400 font-bold ml-2">
                    {splitPercentage.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                (form.depositType === 'On Solution' &&
                  solutions.length === 0)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : form.depositType === 'On Solution' ? (
                <Route className="w-4 h-4" />
              ) : (
                <DollarSign className="w-4 h-4" />
              )}
              {isSubmitting
                ? 'Submitting...'
                : form.depositType === 'On Solution'
                  ? 'Submit Solution'
                  : 'Submit for Approval'}
            </button>
          </div>
        </form>
      )}

      {solutionRecords.length > 0 && (
        <div className="mt-6 border-t border-white/5 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Route className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold text-white">
              My Solution Pipeline
            </h4>
          </div>

          <div className="space-y-2">
            {solutionRecords.slice(0, 10).map((record: any) => {
              const expected = toDate(record.expectedArrivalDate);
              const overdue =
                record.status === 'On Solution' &&
                !!expected &&
                expected.getTime() < Date.now();

              return (
                <div
                  key={record.id}
                  className={`rounded-xl border p-4 ${
                    overdue
                      ? 'bg-rose-500/5 border-rose-500/20'
                      : 'bg-white/[0.02] border-white/5'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1">
                      <SmallField
                        label="Solution"
                        value={record.solutionName || '—'}
                      />
                      <SmallField
                        label="Amount"
                        value={money(record.amount)}
                        valueClass="text-blue-400 font-bold"
                      />
                      <SmallField
                        label="Status"
                        value={record.status}
                        valueClass={
                          record.status === 'Arrival Pending'
                            ? 'text-orange-400'
                            : record.status === 'On Solution'
                              ? 'text-blue-400'
                              : 'text-violet-400'
                        }
                      />
                      <SmallField
                        label="Expected"
                        value={
                          expected
                            ? expected.toLocaleDateString()
                            : '—'
                        }
                      />
                      <SmallField
                        label="Full Name"
                        value={record.solutionFullName || '—'}
                      />
                    </div>

                    {record.status === 'On Solution' &&
                      String(record.submittedBy || '') ===
                        String(currentUserId) && (
                        <button
                          type="button"
                          onClick={() => markArrived(record)}
                          disabled={arrivingId === record.id}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-sm font-semibold disabled:opacity-50"
                        >
                          {arrivingId === record.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Mark Arrived
                        </button>
                      )}
                  </div>

                  {overdue && (
                    <div className="mt-3 text-xs text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Expected arrival date has passed.
                    </div>
                  )}

                  {record.arrivalStatus === 'Rejected' &&
                    record.arrivalRejectReason && (
                      <div className="mt-3 text-xs text-amber-300">
                        Last arrival confirmation was rejected:{' '}
                        {record.arrivalRejectReason}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Approved
        </span>
        <span className="flex items-center gap-1">
          <Clock3 className="w-3 h-3" />
          Pending
        </span>
        <span className="flex items-center gap-1">
          <Route className="w-3 h-3" />
          On Solution
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-1 uppercase">
        {label}
      </p>
    </div>
  );
}

function SmallField({
  label,
  value,
  valueClass = 'text-slate-300'
}: any) {
  return (
    <div>
      <p className="text-[9px] uppercase text-slate-600">
        {label}
      </p>
      <p className={`text-xs mt-1 ${valueClass}`}>
        {value || '—'}
      </p>
    </div>
  );
}
