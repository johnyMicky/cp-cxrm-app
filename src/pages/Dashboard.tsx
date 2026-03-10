import { useEffect, useState } from 'react';
import { Users, UserPlus, CheckCircle, XCircle, Activity, BarChart3, PieChart, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie } from 'recharts';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard?t=' + Date.now())
      .then(async res => {
        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON response from server: ' + text.substring(0, 100));
        }
        
        if (!res.ok) {
          setData(body); // Store error body to show details
          throw new Error(body.error || 'Server returned error ' + res.status);
        }
        setData(body);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-8 max-w-2xl mx-auto text-left">
          <div className="flex items-center space-x-3 mb-4">
            <XCircle className="w-8 h-8 text-rose-500" />
            <h2 className="text-xl font-semibold text-white">Dashboard Error</h2>
          </div>
          <p className="text-slate-300 font-medium mb-2">{error}</p>
          {data?.details && (
            <div className="bg-black/40 rounded-lg p-4 mb-6 font-mono text-xs text-rose-300 overflow-auto max-h-48 border border-rose-500/10">
              {data.details}
            </div>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-slate-400 animate-pulse">Loading dashboard...</div>;

  const stats = [
    { name: 'Total Leads', value: data.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'New Today', value: data.newToday, icon: UserPlus, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'Active Leads', value: data.active, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'Converted', value: data.converted, icon: CheckCircle, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { name: 'Lost', value: data.lost, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time operational metrics and team performance.</p>
        </div>
        <button className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-blue-500/20">
          <BarChart3 className="w-4 h-4" />
          <span>Generate Report</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-semibold text-white">{stat.value}</h3>
              <p className="text-sm text-slate-400 mt-1 font-medium">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
            <PieChart className="w-5 h-5 text-blue-500" />
            <span>Leads by Status</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={data.leadsByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="status"
                >
                  {data.leadsByStatus.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff10', borderRadius: '8px', color: '#fff' }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {data.leadsByStatus.map((status: any, index: number) => (
              <div key={status.status} className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-xs text-slate-400">{status.status}: {status.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6 flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span>Team Roles</span>
          </h3>
          <div className="space-y-4">
            {data.usersByRole.map((role: any, index: number) => (
              <div key={role.role} className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white capitalize">{role.role}</p>
                    <p className="text-xs text-slate-500">Total Members</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-white">{role.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6">Top Agent Workload</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workload} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#ffffff40" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#0A0F1C', borderColor: '#ffffff10', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="new_leads" name="New" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                <Bar dataKey="in_progress" name="In Progress" stackId="a" fill="#f59e0b" />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-medium text-white mb-6">Top Lead Sources</h3>
          <div className="space-y-4">
            {data.topSources.map((source: any, i: number) => (
              <div key={source.source} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-medium text-slate-300">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-200">{source.source}</span>
                </div>
                <span className="text-sm font-semibold text-white">{source.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
