import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  Clock3,
  CheckCircle2,
  XCircle,
  Copy,
  Send,
  RefreshCw,
  LockKeyhole,
  ChevronDown,
  ChevronUp,
  Ban,
  AlertTriangle,
  UserPlus,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { firestoreService } from '../services/firestoreService';

const REQUEST_TYPES = [
  'Wallet Address',
  'Bank Details',
  'IBAN / SWIFT',
  'Crypto Details',
  'Payment Instructions',
  'Other'
];

const toDate = (value: any) => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function SecureInfo() {
  const currentUser = {
    id: localStorage.getItem('userId') || '',
    role: localStorage.getItem('userRole') || 'Agent',
    name: localStorage.getItem('userName') || 'User',
    teamId: localStorage.getItem('userTeamId') || ''
  };

  const isAgent = currentUser.role === 'Agent';
  const canDeliver = [
    'Administrator',
    'Manager',
    'Team Leader',
    'Financial Manager'
  ].includes(currentUser.role);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, string>>({});
  const [copyMessage, setCopyMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requestForm, setRequestForm] = useState({
    requestType: 'Wallet Address',
    clientReference: '',
    requestComment: ''
  });

  const [recipients, setRecipients] = useState<any[]>([]);
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [recipientMode, setRecipientMode] = useState<'one' | 'multiple' | 'all'>('one');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [directForm, setDirectForm] = useState({
    requestType: 'Wallet Address',
    clientReference: '',
    comment: '',
    details: ''
  });

  const loadData = async () => {
    if (!currentUser.id) return;

    try {
      setLoading(true);
      setError('');

      const data = await firestoreService.getSecureInfoRequestsForUser(
        currentUser
      );

      setRecords(data as any[]);
    } catch (err: any) {
      console.error('Secure Info load failed:', err);
      setError(err?.message || 'Failed to load Secure Info requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser.id) return;

    setLoading(true);

    const unsubscribe = firestoreService.subscribeSecureInfoRequestsForUser(
      currentUser,
      data => {
        setRecords(data as any[]);
        setLoading(false);
      },
      err => {
        console.error('Secure Info realtime listener failed:', err);
        setError(err?.message || 'Failed to listen for Secure Info updates.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser.id, currentUser.role, currentUser.teamId]);

  useEffect(() => {
    if (!canDeliver || !currentUser.id) return;

    firestoreService
      .getSecureInfoRecipientsForUser(currentUser)
      .then(data => setRecipients(data as any[]))
      .catch(err => {
        console.error('Failed to load Secure Info recipients:', err);
      });
  }, [currentUser.id, currentUser.role, currentUser.teamId]);

  const counts = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        const status = String(record.status || 'Pending');
        if (status === 'Pending') acc.pending++;
        if (status === 'Delivered') acc.delivered++;
        if (status === 'Expired') acc.expired++;
        if (status === 'Cancelled') acc.cancelled++;
        return acc;
      },
      { pending: 0, delivered: 0, expired: 0, cancelled: 0 }
    );
  }, [records]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setError('');
      setSuccess('');

      await firestoreService.createSecureInfoRequest(
        requestForm,
        currentUser.id
      );

      setRequestForm({
        requestType: 'Wallet Address',
        clientReference: '',
        requestComment: ''
      });
      setShowRequestForm(false);
      setSuccess('Secure Info request submitted.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request.');
    }
  };

  const submitDirectDelivery = async (event: React.FormEvent) => {
    event.preventDefault();

    let recipientIds = selectedRecipientIds;

    if (recipientMode === 'all') {
      recipientIds = recipients.map(recipient => String(recipient.id));
    }

    if (recipientMode === 'one') {
      recipientIds = selectedRecipientIds.slice(0, 1);
    }

    if (recipientIds.length === 0) {
      setError('Select at least one Agent.');
      return;
    }

    try {
      setError('');
      setSuccess('');

      await firestoreService.createDirectSecureInfoDelivery(
        {
          ...directForm,
          recipientAgentIds: recipientIds
        },
        currentUser.id
      );

      setDirectForm({
        requestType: 'Wallet Address',
        clientReference: '',
        comment: '',
        details: ''
      });
      setSelectedRecipientIds([]);
      setRecipientMode('one');
      setShowDirectForm(false);

      setSuccess(
        recipientIds.length === 1
          ? 'Secure Info sent to 1 Agent.'
          : `Secure Info sent to ${recipientIds.length} Agents.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to send Secure Info.');
    }
  };

  const deliver = async (record: any) => {
    const details = String(deliveryDrafts[record.id] || '').trim();

    if (!details) {
      setError('Enter the Secure Details before delivery.');
      return;
    }

    if (
      !confirm(
        `Deliver ${record.requestType || 'Secure Info'} to ${record.requestedByName || 'this Agent'}?`
      )
    ) {
      return;
    }

    try {
      setBusyId(record.id);
      setError('');
      setSuccess('');

      await firestoreService.deliverSecureInfoRequest(
        record.id,
        details,
        currentUser.id
      );

      setDeliveryDrafts(prev => ({
        ...prev,
        [record.id]: ''
      }));

      setSuccess(
        `Secure Details delivered to ${record.requestedByName || 'Agent'}.`
      );

      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to deliver Secure Info.');
    } finally {
      setBusyId('');
    }
  };

  const cancelRequest = async (record: any) => {
    if (!confirm('Cancel this Secure Info request?')) return;

    try {
      setBusyId(record.id);
      setError('');
      setSuccess('');

      await firestoreService.cancelSecureInfoRequest(
        record.id,
        currentUser.id
      );

      setSuccess('Secure Info request cancelled.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel request.');
    } finally {
      setBusyId('');
    }
  };

  const expireRequest = async (record: any) => {
    if (!confirm('Expire these delivered Secure Details?')) return;

    try {
      setBusyId(record.id);
      setError('');
      setSuccess('');

      await firestoreService.expireSecureInfoRequest(
        record.id,
        currentUser.id
      );

      setSuccess('Secure Details expired.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to expire Secure Info.');
    } finally {
      setBusyId('');
    }
  };

  const copyDetails = async (record: any) => {
    const details = String(record.deliveredDetails || '');
    if (!details) return;

    try {
      await navigator.clipboard.writeText(details);
      setCopyMessage(record.id);

      window.setTimeout(() => {
        setCopyMessage(current =>
          current === record.id ? '' : current
        );
      }, 1800);
    } catch {
      setError('Could not copy the Secure Details.');
    }
  };

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <LockKeyhole className="w-6 h-6 text-blue-400" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-white">
              Secure Info Request
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isAgent
                ? 'Request payment or banking details and receive them directly inside the CRM.'
                : 'Review Agent requests and deliver the requested details directly inside the CRM.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          {isAgent && (
            <button
              onClick={() => {
                setShowRequestForm(!showRequestForm);
                setError('');
                setSuccess('');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              New Request
            </button>
          )}
          {canDeliver && (
            <button
              onClick={() => {
                setShowDirectForm(!showDirectForm);
                setError('');
                setSuccess('');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              <UserPlus className="w-4 h-4" />
              Send Secure Info
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Pending"
          value={counts.pending}
          icon={<Clock3 className="w-5 h-5 text-amber-400" />}
          cls="text-amber-400"
        />
        <Metric
          label="Delivered"
          value={counts.delivered}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          cls="text-emerald-400"
        />
        <Metric
          label="Expired"
          value={counts.expired}
          icon={<AlertTriangle className="w-5 h-5 text-slate-400" />}
          cls="text-slate-300"
        />
        <Metric
          label="Cancelled"
          value={counts.cancelled}
          icon={<XCircle className="w-5 h-5 text-rose-400" />}
          cls="text-rose-400"
        />
      </div>

      {success && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {canDeliver && showDirectForm && (
        <form
          onSubmit={submitDirectDelivery}
          className="bg-[#0A0F1C] border border-emerald-500/10 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Send Secure Info
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Send details directly without waiting for an Agent request.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Info Type
              </label>
              <select
                value={directForm.requestType}
                onChange={e =>
                  setDirectForm(prev => ({
                    ...prev,
                    requestType: e.target.value
                  }))
                }
                className="w-full mt-2 bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                {REQUEST_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Client / Reference
              </label>
              <input
                value={directForm.clientReference}
                onChange={e =>
                  setDirectForm(prev => ({
                    ...prev,
                    clientReference: e.target.value
                  }))
                }
                placeholder="Optional"
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Recipients
              </label>

              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  ['one', 'One Agent'],
                  ['multiple', 'Multiple Agents'],
                  ['all', 'All Agents']
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setRecipientMode(mode as 'one' | 'multiple' | 'all');
                      if (mode === 'one') {
                        setSelectedRecipientIds(prev => prev.slice(0, 1));
                      }
                    }}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold border ${
                      recipientMode === mode
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-white/[0.02] text-slate-400 border-white/5 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {recipientMode !== 'all' ? (
                <div className="mt-3 max-h-56 overflow-y-auto custom-scrollbar rounded-xl border border-white/5 bg-white/[0.02] p-2">
                  {recipients.map(recipient => {
                    const recipientId = String(recipient.id);
                    const selected = selectedRecipientIds.includes(recipientId);

                    return (
                      <label
                        key={recipientId}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type={recipientMode === 'one' ? 'radio' : 'checkbox'}
                            name={recipientMode === 'one' ? 'secure-recipient' : undefined}
                            checked={selected}
                            onChange={() => {
                              if (recipientMode === 'one') {
                                setSelectedRecipientIds([recipientId]);
                              } else {
                                setSelectedRecipientIds(prev =>
                                  selected
                                    ? prev.filter(id => id !== recipientId)
                                    : [...prev, recipientId]
                                );
                              }
                            }}
                            className="accent-emerald-500"
                          />

                          <div>
                            <p className="text-sm font-medium text-white">
                              {recipient.name || recipient.email}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {recipient.teamName || 'No Team'}
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] uppercase text-slate-600">
                          Agent
                        </span>
                      </label>
                    );
                  })}

                  {recipients.length === 0 && (
                    <p className="text-sm text-slate-600 p-4 text-center">
                      No Agents available.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-4 py-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs text-emerald-300">
                    This will deliver the information to all {recipients.length} Agent(s) available to you.
                  </p>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Secure Details
              </label>
              <textarea
                required
                value={directForm.details}
                onChange={e =>
                  setDirectForm(prev => ({
                    ...prev,
                    details: e.target.value
                  }))
                }
                rows={6}
                placeholder="Enter wallet, bank, IBAN/SWIFT or other details..."
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Comment
              </label>
              <input
                value={directForm.comment}
                onChange={e =>
                  setDirectForm(prev => ({
                    ...prev,
                    comment: e.target.value
                  }))
                }
                placeholder="Optional internal comment"
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowDirectForm(false)}
              className="px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              <Send className="w-4 h-4" />
              Deliver Secure Info
            </button>
          </div>
        </form>
      )}

      {isAgent && showRequestForm && (
        <form
          onSubmit={submitRequest}
          className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                New Secure Info Request
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                The request will be visible to authorized CRM roles.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Request Type
              </label>
              <select
                value={requestForm.requestType}
                onChange={e =>
                  setRequestForm(prev => ({
                    ...prev,
                    requestType: e.target.value
                  }))
                }
                className="w-full mt-2 bg-[#0F172A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                {REQUEST_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Client / Lead Reference
              </label>
              <input
                value={requestForm.clientReference}
                onChange={e =>
                  setRequestForm(prev => ({
                    ...prev,
                    clientReference: e.target.value
                  }))
                }
                placeholder="Optional client name, phone or Lead ID"
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Comment
              </label>
              <textarea
                value={requestForm.requestComment}
                onChange={e =>
                  setRequestForm(prev => ({
                    ...prev,
                    requestComment: e.target.value
                  }))
                }
                rows={4}
                placeholder="Optional note for the manager..."
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowRequestForm(false)}
              className="px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              <Send className="w-4 h-4" />
              Submit Request
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            Loading Secure Info requests...
          </div>
        ) : records.length > 0 ? (
          records.map(record => {
            const expanded = expandedId === record.id;
            const createdAt = toDate(record.createdAt);
            const deliveredAt = toDate(record.deliveredAt);

            return (
              <div
                key={record.id}
                className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden"
              >
                <div className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                    <Field
                      label="Request"
                      value={record.requestType || '—'}
                    />
                    <Field
                      label={record.requestOrigin === 'Management Delivery' ? 'Recipients' : 'Agent'}
                      value={
                        record.requestOrigin === 'Management Delivery'
                          ? (record.recipientAgentNames || []).join(', ') || '—'
                          : record.requestedByName || '—'
                      }
                    />
                    <Field
                      label="Team"
                      value={record.teamName || '—'}
                    />
                    <Field
                      label="Client / Reference"
                      value={record.clientReference || '—'}
                    />
                    <Field
                      label="Status"
                      value={record.status || 'Pending'}
                      valueClass={statusClass(record.status)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {record.status === 'Pending' && (
                      <button
                        onClick={() => cancelRequest(record)}
                        disabled={busyId === record.id}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold disabled:opacity-50"
                      >
                        <Ban className="w-4 h-4" />
                        Cancel
                      </button>
                    )}

                    {record.status === 'Delivered' && canDeliver && (
                      <button
                        onClick={() => expireRequest(record)}
                        disabled={busyId === record.id}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold disabled:opacity-50"
                      >
                        Expire
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setExpandedId(expanded ? '' : record.id)
                      }
                      className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400"
                    >
                      {expanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/5 p-5 bg-white/[0.01] space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <Detail
                        label={record.requestOrigin === 'Management Delivery' ? 'Sent by' : 'Requested by'}
                        value={
                          record.requestOrigin === 'Management Delivery'
                            ? record.deliveredByName
                            : record.requestedByName
                        }
                      />
                      <Detail
                        label="Created"
                        value={
                          createdAt
                            ? format(createdAt, 'MMM d, yyyy HH:mm')
                            : '—'
                        }
                      />
                      <Detail
                        label="Request Comment"
                        value={record.requestComment}
                      />

                      {record.deliveredByName && (
                        <>
                          <Detail
                            label="Delivered by"
                            value={record.deliveredByName}
                          />
                          <Detail
                            label="Delivered"
                            value={
                              deliveredAt
                                ? format(
                                    deliveredAt,
                                    'MMM d, yyyy HH:mm'
                                  )
                                : '—'
                            }
                          />
                        </>
                      )}
                    </div>

                    {record.status === 'Pending' && canDeliver && (
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <LockKeyhole className="w-4 h-4 text-blue-400" />
                          <p className="text-sm font-semibold text-white">
                            Deliver Secure Details
                          </p>
                        </div>

                        <textarea
                          value={deliveryDrafts[record.id] || ''}
                          onChange={e =>
                            setDeliveryDrafts(prev => ({
                              ...prev,
                              [record.id]: e.target.value
                            }))
                          }
                          rows={6}
                          placeholder="Enter wallet, bank, IBAN/SWIFT or other requested details..."
                          className="w-full bg-[#0A0F1C] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />

                        <div className="flex justify-end mt-3">
                          <button
                            onClick={() => deliver(record)}
                            disabled={busyId === record.id}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
                          >
                            <Send className="w-4 h-4" />
                            Deliver to {record.requestedByName || 'Agent'}
                          </button>
                        </div>
                      </div>
                    )}

                    {record.deliveredDetails &&
                      ['Delivered', 'Expired'].includes(
                        String(record.status || '')
                      ) && (
                        <div
                          className={`rounded-xl border p-4 ${
                            record.status === 'Expired'
                              ? 'bg-slate-500/5 border-slate-500/10'
                              : 'bg-emerald-500/5 border-emerald-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <LockKeyhole
                                className={`w-4 h-4 ${
                                  record.status === 'Expired'
                                    ? 'text-slate-500'
                                    : 'text-emerald-400'
                                }`}
                              />
                              <p className="text-sm font-semibold text-white">
                                Delivered Details
                              </p>
                            </div>

                            {record.status === 'Delivered' && (
                              <button
                                onClick={() => copyDetails(record)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                              >
                                <Copy className="w-4 h-4" />
                                {copyMessage === record.id
                                  ? 'Copied'
                                  : 'Copy'}
                              </button>
                            )}
                          </div>

                          <pre className="text-sm text-slate-200 whitespace-pre-wrap break-words font-sans leading-relaxed select-text">
                            {record.deliveredDetails}
                          </pre>

                          {record.status === 'Expired' && (
                            <p className="text-xs text-amber-300 mt-3">
                              These details are expired and should no longer be used.
                            </p>
                          )}
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center bg-[#0A0F1C] border border-white/5 rounded-xl">
            <LockKeyhole className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              No Secure Info requests yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  cls
}: {
  label: string;
  value: number;
  icon: any;
  cls: string;
}) {
  return (
    <div className="rounded-xl bg-[#0A0F1C] border border-white/5 p-4">
      <div className="flex items-center justify-between">
        {icon}
        <span className={`text-2xl font-bold ${cls}`}>
          {value}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-3">
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
      <p className="text-[10px] uppercase tracking-wider text-slate-600">
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
      <span className="text-slate-300 ml-2 break-words">
        {value || '—'}
      </span>
    </div>
  );
}

function statusClass(status: string) {
  switch (String(status || '')) {
    case 'Delivered':
      return 'text-emerald-400 font-semibold';
    case 'Cancelled':
      return 'text-rose-400 font-semibold';
    case 'Expired':
      return 'text-slate-400 font-semibold';
    default:
      return 'text-amber-400 font-semibold';
  }
}
