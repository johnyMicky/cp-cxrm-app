import { useEffect, useState } from 'react';
import { Activity as ActivityIcon, Clock, User, MessageSquare, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Activity() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('/api/history');
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server returned non-JSON response');
        }
        const data = await res.json();
        setHistory(data);
        setLoading(false);
      } catch (err) {
        console.error('Activity Page Load Error:', err);
      }
    };

    loadData();
  }, []);

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Loading activity log...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">System Activity</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time log of all actions and changes in the CRM.</p>
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <h3 className="text-sm font-medium text-white flex items-center space-x-2">
            <ActivityIcon className="w-4 h-4 text-blue-500" />
            <span>Recent Activity</span>
          </h3>
        </div>

        <div className="divide-y divide-white/5">
          {history.map((item) => (
            <div key={item.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mt-1">
                    <Clock className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-white">{item.user_name}</span>
                      <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">{item.action}</span>
                    </div>
                    <p className="text-sm text-slate-300 mt-1">{item.details}</p>
                    <div className="flex items-center space-x-4 mt-3">
                      <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{format(new Date(item.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                        <User className="w-3.5 h-3.5" />
                        <Link to={`/leads/${item.lead_id}`} className="hover:text-blue-400 transition-colors">
                          Lead #{item.lead_id}
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <Link 
                  to={`/leads/${item.lead_id}`}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No activity recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
