import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';

interface User {
  id: number;
  name: string;
  role: string;
  avatar: string;
}

interface LeadFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
}

export default function LeadForm({ onClose, onSuccess, initialData }: LeadFormProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    country: initialData?.country || '',
    source: initialData?.source || 'Website',
    status: initialData?.status || 'New',
    assigned_to: initialData?.assigned_to || '',
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.filter((u: User) => ['Agent', 'Team Leader', 'Manager'].includes(u.role))));
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Full Name is required';
    if (!formData.email.trim() && !formData.phone.trim()) {
      newErrors.contact = 'At least one contact field (Email or Phone) is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          assigned_to: formData.assigned_to ? parseInt(formData.assigned_to as string) : null,
          user_id: 1 // Hardcoded admin user for now
        })
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setErrors({ submit: data.error || 'Failed to create lead' });
      }
    } catch (error) {
      setErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-xl font-semibold text-white tracking-tight">
            {initialData ? 'Edit Lead' : 'Create New Lead'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {errors.submit && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 flex items-center space-x-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errors.submit}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Full Name *</label>
              <input 
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className={`w-full bg-white/5 border ${errors.name ? 'border-rose-500/50' : 'border-white/10'} rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all`}
                placeholder="John Doe"
              />
              {errors.name && <p className="text-xs text-rose-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Country</label>
              <input 
                type="text"
                value={formData.country}
                onChange={e => setFormData({...formData, country: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="United States"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email Address</label>
              <input 
                type="email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className={`w-full bg-white/5 border ${errors.contact ? 'border-rose-500/50' : 'border-white/10'} rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all`}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Phone Number</label>
              <input 
                type="text"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className={`w-full bg-white/5 border ${errors.contact ? 'border-rose-500/50' : 'border-white/10'} rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all`}
                placeholder="+1 234 567 890"
              />
            </div>

            {errors.contact && <p className="text-xs text-rose-500 md:col-span-2">{errors.contact}</p>}

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source</label>
              <select 
                value={formData.source}
                onChange={e => setFormData({...formData, source: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
              >
                <option value="Website">Website</option>
                <option value="Referral">Referral</option>
                <option value="Cold Call">Cold Call</option>
                <option value="Social Media">Social Media</option>
                <option value="Partner">Partner</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
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
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Assign To Agent</label>
              <select 
                value={formData.assigned_to}
                onChange={e => setFormData({...formData, assigned_to: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
              >
                <option value="">Unassigned</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Initial Note</label>
              <textarea 
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none h-24"
                placeholder="Add any initial details or context..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/5">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{initialData ? 'Update Lead' : 'Create Lead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
