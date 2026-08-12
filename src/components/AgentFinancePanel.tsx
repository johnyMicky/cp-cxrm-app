import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Plus, Trash2, WalletCards, Clock3, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
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
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AgentFinancePanel() {
  const currentUserId = localStorage.getItem('userId') || '';
  const currentUserName = localStorage.getItem('userName') || '';

  const [users, setUsers] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [form, setForm] = useState({
    clientFullName: '',
    country: '',
    email: '',
    phoneNumber: '',
    walletAddress: '',
    amount: '',
    crypto: 'USDT',
    cryptoOther: '',
    depositDate: todayKey(),
    leadSourceId: '',
    retName: '',
    agentName: currentUserName
  });

  const loadPortfolio = async () => {
    if (!currentUserId) return;
    const result = await firestoreService.getFinancePortfolio(currentUserId);
    setPortfolio(result);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [allUsers] = await Promise.all([
          firestoreService.getUsers(),
          loadPortfolio()
        ]);
        setUsers((allUsers as any[]).filter(user => String(user.id) !== String(currentUserId)));
      } catch (err) {
        console.error('Failed to load finance form:', err);
      }
    };
    load();
  }, [currentUserId]);

  const splitPercentage = useMemo(
    () => splits.reduce((sum, split) => sum + Number(split.percentage || 0), 0),
    [splits]
  );

  const ownerPercentage = Math.max(0, 100 - splitPercentage);
  const numericAmount = Number(form.amount || 0);

  const resetForm = () => {
    setForm({
      clientFullName: '',
      country: '',
      email: '',
      phoneNumber: '',
      walletAddress: '',
      amount: '',
      crypto: 'USDT',
      cryptoOther: '',
      depositDate: todayKey(),
      leadSourceId: '',
      retName: '',
      agentName: currentUserName
    });
    setSplits([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.clientFullName.trim()) return setError('Client Full Name is required.');
    if (!numericAmount || numericAmount <= 0) return setError('Amount must be greater than 0.');
    if (splitPercentage > 100) return setError('Split percentages cannot exceed 100%.');
    if (form.crypto === 'Other' && !form.cryptoOther.trim()) return setError('Please specify the crypto type.');

    if (splits.some(split => !split.userId || Number(split.percentage || 0) <= 0)) {
      return setError('Every Split With row needs a user and a percentage.');
    }

    try {
      setIsSubmitting(true);
      await firestoreService.submitFinanceDeposit(
        {
          ...form,
          amount: numericAmount,
          splits: splits.map(split => ({
            userId: split.userId,
            percentage: Number(split.percentage || 0)
          }))
        },
        currentUserId
      );

      setSuccess('Deposit submitted. Status: Pending approval.');
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

  return (
    <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">My Finance Portfolio</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">Submit deposits for approval and track your attributed revenue.</p>
        </div>

        <button
          type="button"
          onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Submit Deposit
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
        <Metric label="Submitted Approved" value={money(portfolio?.submittedApprovedGross || 0)} color="text-white" />
        <Metric label="Total Approved" value={money(portfolio?.approvedAttributed || 0)} color="text-emerald-400" />
        <Metric label="Split Earnings" value={money(portfolio?.splitEarnings || 0)} color="text-cyan-400" />
        <Metric label="Pending" value={money(portfolio?.pendingAttributed || 0)} color="text-amber-400" />
        <Metric label="Rejected" value={money(portfolio?.rejectedAttributed || 0)} color="text-rose-400" />
      </div>

      {success && <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">{success}</div>}
      {error && !showForm && <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="mt-6 border-t border-white/5 pt-6 space-y-5">
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
              ['depositDate', 'Date', 'date'],
            ].map(([key, label, type]) => (
              <div key={key} className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</label>
                <input
                  type={type}
                  required={['clientFullName', 'amount', 'agentName', 'depositDate'].includes(key)}
                  min={key === 'amount' ? '0.01' : undefined}
                  step={key === 'amount' ? '0.01' : undefined}
                  value={(form as any)[key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Crypto</label>
              <select
                value={form.crypto}
                onChange={(e) => setForm(prev => ({ ...prev, crypto: e.target.value }))}
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
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Other Crypto</label>
                <input
                  value={form.cryptoOther}
                  onChange={(e) => setForm(prev => ({ ...prev, cryptoOther: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                  placeholder="Enter crypto name"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-white">Split With</p>
                <p className="text-[11px] text-slate-500">Remaining {ownerPercentage.toFixed(2)}% stays with you automatically.</p>
              </div>
              <button
                type="button"
                onClick={() => setSplits(prev => [...prev, { userId: '', percentage: '' }])}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Split
              </button>
            </div>

            <div className="space-y-2">
              {splits.map((split, index) => {
                const selectedElsewhere = new Set(
                  splits.filter((_, rowIndex) => rowIndex !== index).map(row => row.userId).filter(Boolean)
                );

                return (
                  <div key={index} className="grid grid-cols-[1fr_110px_40px] gap-2">
                    <select
                      value={split.userId}
                      onChange={(e) => setSplits(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, userId: e.target.value } : row))}
                      className="bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Select CRM user...</option>
                      {users.filter(user => !selectedElsewhere.has(String(user.id))).map(user => (
                        <option key={user.id} value={user.id}>{user.name || user.email} — {user.role}</option>
                      ))}
                    </select>

                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={split.percentage}
                        onChange={(e) => setSplits(prev => prev.map((row, rowIndex) => rowIndex === index ? { ...row, percentage: e.target.value } : row))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-7 text-sm text-white"
                        placeholder="%"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>
                    </div>

                    <button type="button" onClick={() => setSplits(prev => prev.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {splits.length === 0 && <p className="text-xs text-slate-600 py-2">No split recipients. You receive 100% attribution.</p>}
            </div>

            {numericAmount > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                  <span className="text-slate-500">Your attribution:</span>
                  <span className="text-emerald-400 font-bold ml-2">{ownerPercentage.toFixed(2)}% = {money((numericAmount * ownerPercentage) / 100)}</span>
                </div>
                <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
                  <span className="text-slate-500">Split total:</span>
                  <span className="text-blue-400 font-bold ml-2">{splitPercentage.toFixed(2)}%</span>
                </div>
              </div>
            )}
          </div>

          {error && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</span>
        <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" /> Pending</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-1 uppercase">{label}</p>
    </div>
  );
}
