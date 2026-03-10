import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, MapPin, Globe, Clock, MessageSquare, History, Edit3, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  
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

    const data = await firestoreService.getLead(id);
    setLead(data);
    setIsEditing(false);
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
            <p className="text-sm text-slate-400 mt-1">Created on {format(new Date(lead.created_at), 'MMM d, yyyy')}</p>
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
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="New">New</option>
                    <option value="VM">VM</option>
                    <option value="No answer">No answer</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Callback">Callback</option>
                    <option value="Low Potential">Low Potential</option>
                    <option value="Language Barrier">Language Barrier</option>
                    <option value="Wrong Person">Wrong Person</option>
                    <option value="Underage">Underage</option>
                    <option value="No Experience">No Experience</option>
                  </select>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
                    {lead.status}
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Assigned Agent</p>
                {isEditing ? (
                  <select 
                    value={editForm.assigned_to || ''} 
                    onChange={e => setEditForm({...editForm, assigned_to: e.target.value ? parseInt(e.target.value) : null})}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Unassigned</option>
                    {users.filter(u => ['Agent', 'Team Leader', 'Manager'].includes(u.role)).map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center space-x-3 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
                    {lead.assigned_to_name ? (
                      <>
                        <img src={lead.assigned_to_avatar} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm text-white font-medium">{lead.assigned_to_name}</span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-400 italic">Unassigned</span>
                    )}
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
              {lead.notes.length > 0 ? lead.notes.map((note: any) => (
                <div key={note.id} className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <img src={note.user_avatar} alt="" className="w-5 h-5 rounded-full" />
                      <span className="text-sm font-medium text-slate-300">{note.user_name}</span>
                    </div>
                    <span className="text-xs text-slate-500">{format(new Date(note.created_at), 'MMM d, h:mm a')}</span>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                </div>
              )) : (
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
              {lead.history.map((item: any, i: number) => (
                <div key={item.id} className="relative pl-6">
                  <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0A0F1C]" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {item.action} <span className="text-slate-500 font-normal">by {item.user_name}</span>
                      </p>
                      <p className="text-sm text-slate-400 mt-1">{item.details}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                      {format(new Date(item.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
