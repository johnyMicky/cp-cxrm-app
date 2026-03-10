import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, MapPin, Globe, Clock, MessageSquare, History, Edit3, Check, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';

const STATUSES = ['New', 'VM', 'No answer', 'Deposit', 'Callback', 'Low Potential', 'No Potential', 'Language Barrier', 'Wrong Person', 'Underage', 'No Experience'];

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'Deposit': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    case 'VM': return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    case 'Callback': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    case 'New': return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    case 'No answer': return 'text-slate-400 border-slate-500/20 bg-slate-500/5';
    case 'Low Potential': return 'text-orange-400 border-orange-500/20 bg-orange-500/5';
    case 'No Potential': return 'text-zinc-500 border-zinc-500/20 bg-zinc-500/5';
    case 'Language Barrier': return 'text-purple-400 border-purple-500/20 bg-purple-500/5';
    case 'Wrong Person': return 'text-pink-400 border-pink-500/20 bg-pink-500/5';
    case 'Underage': return 'text-red-400 border-red-500/20 bg-red-500/5';
    case 'No Experience': return 'text-red-500 border-red-600/20 bg-red-600/5';
    default: return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
  }
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSchedulingCallback, setIsSchedulingCallback] = useState(false);
  const [callbackDate, setCallbackDate] = useState('');
  
  const currentUserId = localStorage.getItem('userId') || '1';
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const [leadData, usersData] = await Promise.all([
          firestoreService.getLead(id),
          firestoreService.getUsers()
        ]);

        setLead(leadData);
        setEditForm(leadData);
        setUsers(usersData);
      } catch (err) {
        console.error('Lead Detail Load Error:', err);
      }
    };

    loadData();
  }, [id]);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return format(d, 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const formatDateTime = (date: any) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return format(d, 'MMM d, h:mm a');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  if (!lead) return <div className="p-8 text-slate-400">Loading lead details...</div>;

  const handleSave = async () => {
    if (!id) return;
    await firestoreService.updateLead(id, { ...editForm });
    
    // Log reassignment or status change
    if (lead.status !== editForm.status) {
      await firestoreService.logActivity({
        lead_id: id,
        user_id: currentUserId,
        action: 'Status Changed',
        details: `Status changed from ${lead.status} to ${editForm.status}`
      });
    }
    if (lead.assigned_to !== editForm.assigned_to) {
      const assignedUser = editForm.assigned_to ? users.find(u => u.id === editForm.assigned_to) : { name: 'Unassigned' };
      await firestoreService.logActivity({
        lead_id: id,
        user_id: currentUserId,
        action: 'Reassigned',
        details: `Assigned to ${assignedUser?.name || 'Unassigned'}`
      });
    }
    if (lead.callbackAt !== editForm.callbackAt) {
      await firestoreService.logActivity({
        lead_id: id,
        user_id: currentUserId,
        action: 'Callback Updated',
        details: `Callback scheduled for ${formatDateTime(editForm.callbackAt)}`
      });
    }

    const data = await firestoreService.getLead(id);
    setLead(data);
    setIsEditing(false);
  };

  const handleQuickCallback = async () => {
    if (!id || !callbackDate) return;
    try {
      await firestoreService.updateLead(id, { 
        callbackAt: new Date(callbackDate)
      });
      await firestoreService.logActivity({
        lead_id: id,
        user_id: currentUserId,
        action: 'Callback Scheduled',
        details: `Scheduled for ${format(new Date(callbackDate), 'MMM d, h:mm a')}`
      });
      const data = await firestoreService.getLead(id);
      setLead(data);
      setEditForm(data);
      setIsSchedulingCallback(false);
      setCallbackDate('');
    } catch (err) {
      console.error('Failed to schedule callback:', err);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim() || !id) return;
    
    await firestoreService.addNote(id, currentUserId, noteContent);
    
    setNoteContent('');
    const data = await firestoreService.getLead(id);
    setLead(data);
  };

  const handleDelete = async () => {
    if (currentUserRole === 'Manager') {
      alert('Managers are not allowed to delete leads.');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return;
    
    if (!id) return;
    await firestoreService.deleteLead(id);
    navigate('/leads');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'VM':
      case 'No answer':
      case 'Callback': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Low Potential':
      case 'Language Barrier':
      case 'Wrong Person': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Deposit': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Underage':
      case 'No Experience': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/leads" className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center space-x-3">
              <span>{lead.name}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${getStatusColor(lead.status)}`}>
                {lead.status}
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">Created on {formatDate(lead.createdAt)}</p>
          </div>
        </div>
        
        {isEditing ? (
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-emerald-500/20"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            {currentUserRole !== 'Manager' && (
              <button 
                onClick={handleDelete}
                className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors border border-white/5"
                title="Delete Lead"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => setIsEditing(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Details</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#0A0F1C] rounded-xl border border-white/5 p-6 shadow-sm">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
              <User className="w-5 h-5 text-blue-500" />
              <span>Contact Information</span>
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Phone className="w-4 h-4 text-slate-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Phone</p>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.phone} 
                      onChange={e => setEditForm({...editForm, phone: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <p className="text-sm text-slate-200">{lead.phone || '—'}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Mail className="w-4 h-4 text-slate-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Email</p>
                  {isEditing ? (
                    <input 
                      type="email" 
                      value={editForm.email} 
                      onChange={e => setEditForm({...editForm, email: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <p className="text-sm text-slate-200">{lead.email || '—'}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Country</p>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.country} 
                      onChange={e => setEditForm({...editForm, country: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <p className="text-sm text-slate-200">{lead.country || '—'}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Globe className="w-4 h-4 text-slate-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Source</p>
                  {isEditing ? (
                    <select 
                      value={editForm.source} 
                      onChange={e => setEditForm({...editForm, source: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="Website">Website</option>
                      <option value="Referral">Referral</option>
                      <option value="Cold Call">Cold Call</option>
                      <option value="Social Media">Social Media</option>
                      <option value="Partner">Partner</option>
                    </select>
                  ) : (
                    <p className="text-sm text-slate-200">{lead.source || '—'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0A0F1C] rounded-xl border border-white/5 p-6 shadow-sm">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <span>Assignment & Status</span>
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Current Status</p>
                {isEditing ? (
                  <select 
                    value={editForm.status} 
                    onChange={e => setEditForm({...editForm, status: e.target.value})}
                    className={`w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${getStatusStyles(editForm.status)}`}
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s} className="bg-[#0A0F1C] text-slate-300">{s}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`inline-flex items-center px-4 py-2.5 rounded-lg border text-sm font-bold uppercase tracking-wider ${getStatusStyles(lead.status)}`}>
                    {lead.status}
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Assigned Agent</p>
                {isEditing ? (
                  <select 
                    value={editForm.assigned_to || ''} 
                    onChange={e => setEditForm({...editForm, assigned_to: e.target.value || null})}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Unassigned</option>
                    {users.filter(u => ['Agent', 'Team Leader', 'Manager'].includes(u.role)).map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center space-x-3 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
                    {(() => {
                      const agent = users.find(u => u.id === lead.assigned_to);
                      return agent ? (
                        <>
                          <img src={agent.avatar} alt="" className="w-6 h-6 rounded-full" />
                          <span className="text-sm text-white font-medium">{agent.name}</span>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400 italic">Unassigned</span>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Calendar className="w-3 h-3" />
                  <span>Callback Schedule</span>
                </p>
                {isEditing ? (
                  <input 
                    type="datetime-local" 
                    value={editForm.callbackAt ? format(editForm.callbackAt.toDate ? editForm.callbackAt.toDate() : new Date(editForm.callbackAt), "yyyy-MM-dd'T'HH:mm") : ''} 
                    onChange={e => setEditForm({...editForm, callbackAt: e.target.value ? new Date(e.target.value) : null})}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                ) : (
                  <div className="group relative">
                    <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white flex items-center justify-between">
                      <span>
                        {lead.callbackAt ? formatDateTime(lead.callbackAt) : <span className="text-slate-500 italic">No callback scheduled</span>}
                      </span>
                      <button 
                        onClick={() => {
                          setCallbackDate(lead.callbackAt ? format(lead.callbackAt.toDate ? lead.callbackAt.toDate() : new Date(lead.callbackAt), "yyyy-MM-dd'T'HH:mm") : '');
                          setIsSchedulingCallback(true);
                        }}
                        className="text-blue-500 hover:text-blue-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {lead.callbackAt ? 'Change' : 'Set Date'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0A0F1C] rounded-xl border border-white/5 p-6 shadow-sm">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              <span>Internal Notes</span>
            </h3>
            
            <div className="mb-6">
              <textarea 
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Add a note about this lead..."
                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none min-h-[100px]"
              />
              <div className="flex justify-end mt-3">
                <button 
                  onClick={handleAddNote}
                  disabled={!noteContent.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Post Note
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {lead.notes.length > 0 ? lead.notes.map((note: any) => {
                const noteUser = users.find(u => u.id === note.user_id);
                return (
                  <div key={note.id} className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <img src={noteUser?.avatar || 'https://i.pravatar.cc/150?u=unknown'} alt="" className="w-5 h-5 rounded-full" />
                        <span className="text-sm font-medium text-slate-300">{noteUser?.name || 'Unknown User'}</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                );
              }) : (
                <p className="text-sm text-slate-500 text-center py-4 italic">No notes added yet.</p>
              )}
            </div>
          </div>

          <div className="bg-[#0A0F1C] rounded-xl border border-white/5 p-6 shadow-sm">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
              <History className="w-5 h-5 text-blue-500" />
              <span>Activity History</span>
            </h3>
            
            <div className="relative border-l border-white/10 ml-3 space-y-6 pb-4">
              {lead.history.map((item: any, i: number) => {
                const historyUser = users.find(u => u.id === item.user_id);
                return (
                  <div key={item.id} className="relative pl-6">
                    <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0A0F1C]" />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {item.action} <span className="text-slate-500 font-normal">by {historyUser?.name || 'Unknown User'}</span>
                        </p>
                        <p className="text-sm text-slate-400 mt-1">{item.details}</p>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isSchedulingCallback && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-lg font-semibold text-white tracking-tight flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <span>Schedule Callback</span>
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Please select a date and time for the callback.</p>
              <input 
                type="datetime-local" 
                value={callbackDate}
                onChange={(e) => setCallbackDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <div className="flex items-center space-x-3 pt-2">
                <button 
                  onClick={() => setIsSchedulingCallback(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleQuickCallback}
                  disabled={!callbackDate}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
