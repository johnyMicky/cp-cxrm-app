import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Inbox, Activity, Settings, LogOut, UserCog, XCircle, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Dispatcher from './pages/Dispatcher';
import Team from './pages/Team';
import Lost from './pages/Lost';
import ActivityPage from './pages/Activity';
import Login from './pages/Login';
import { firestoreService } from './services/firestoreService';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const currentUserId = localStorage.getItem('userId') || '1';
  const userName = localStorage.getItem('userName') || 'Admin User';
  const userAvatar = localStorage.getItem('userAvatar') || 'https://i.pravatar.cc/150?u=admin';

  const fetchNotifications = async () => {
    try {
      const data = await firestoreService.getNotifications(currentUserId);
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [currentUserId]);

  // Callback reminder logic
  useEffect(() => {
    const checkCallbacks = async () => {
      try {
        const leads = await firestoreService.getLeads(currentUserRole === 'Agent' ? currentUserId : undefined);
        const now = new Date();
        const thirtyMinsLater = new Date(now.getTime() + 30 * 60000);

        for (const lead of (leads as any[])) {
          if (lead.callbackAt) {
            const callbackDate = lead.callbackAt.toDate ? lead.callbackAt.toDate() : new Date(lead.callbackAt);
            
            // If callback is within next 30 mins and we haven't notified yet
            if (callbackDate > now && callbackDate <= thirtyMinsLater) {
              const notificationId = `callback_${lead.id}_${callbackDate.getTime()}`;
              // We'd need a way to check if this specific notification was already created
              // For simplicity, let's just create it if it's not in the current unread list
              const alreadyNotified = notifications.some(n => n.type === 'callback' && n.lead_id === lead.id);
              
              if (!alreadyNotified) {
                await firestoreService.createNotification({
                  user_id: currentUserId,
                  lead_id: lead.id,
                  type: 'callback',
                  title: 'Upcoming Callback',
                  message: `You have a scheduled call with ${lead.name} in less than 30 minutes.`,
                });
                fetchNotifications();
              }
            }
          }
        }
      } catch (err) {
        console.error('Callback check failed:', err);
      }
    };

    const interval = setInterval(checkCallbacks, 60000); // Check every minute
    checkCallbacks();
    return () => clearInterval(interval);
  }, [currentUserId, currentUserRole, notifications]);

  const handleMarkRead = async (id: string) => {
    await firestoreService.markNotificationRead(id);
    fetchNotifications();
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Leads', path: '/leads', icon: Users, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Lost', path: '/lost', icon: XCircle, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Team', path: '/team', icon: UserCog, roles: ['Administrator'] },
    { name: 'Dispatcher', path: '/dispatcher', icon: Inbox, roles: ['Administrator', 'Manager'] },
    { name: 'Activity', path: '/activity', icon: Activity, roles: ['Administrator', 'Manager'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Administrator'] },
  ];

  const [dbStatus, setDbStatus] = useState<{ 
    db: string; 
    userCount: number; 
    leadCount: number; 
    dbError?: string | null;
    isServerless?: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(err => console.error('Health check failed:', err));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userAvatar');
    window.location.href = '/login';
  };

  return (
    <div className="w-64 bg-[#0A0F1C] border-r border-white/5 flex flex-col h-screen">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">CM</span>
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">CamptainM-CRM</span>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0A0F1C]">
                {notifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 mt-2 w-80 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{notifications.length} Unread</span>
              </div>
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">{n.title}</h4>
                        <button 
                          onClick={() => handleMarkRead(n.id)}
                          className="text-[10px] text-slate-500 hover:text-white transition-colors"
                        >
                          Mark as read
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed mb-2">{n.message}</p>
                      <div className="flex items-center justify-between">
                        {n.lead_id && (
                          <Link 
                            to={`/leads/${n.lead_id}`}
                            onClick={() => setShowNotifications(false)}
                            className="text-[10px] text-blue-500 hover:underline font-medium"
                          >
                            View Lead
                          </Link>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {n.createdAt?.toDate ? format(n.createdAt.toDate(), 'h:mm a') : 'Just now'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 text-slate-700 mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-slate-500 italic">No new notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(dbStatus?.db === 'memory' || dbStatus?.isServerless) && (
        <div className={cn(
          "mx-4 mb-4 p-2 rounded-lg border",
          dbStatus?.db === 'memory' ? "bg-rose-500/10 border-rose-500/20" : "bg-amber-500/10 border-amber-500/20"
        )}>
          <p className={cn(
            "text-[10px] font-medium leading-tight",
            dbStatus?.db === 'memory' ? "text-rose-400" : "text-amber-400"
          )}>
            {dbStatus?.db === 'memory' 
              ? "⚠️ Database in Memory Mode. Data will be lost!" 
              : "ℹ️ Running on Vercel. Data is ephemeral (lost on restart)."}
          </p>
          {dbStatus?.dbError && (
            <p className="text-[8px] text-rose-300 mt-1 font-mono break-all">
              Error: {dbStatus.dbError}
            </p>
          )}
        </div>
      )}
      
      <nav className="flex-1 px-4 space-y-1 mt-4">
        {navItems.filter(item => item.roles.includes(currentUserRole)).map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                "shimmer-item flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-blue-600/10 text-blue-500" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-blue-500" : "text-slate-400")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center space-x-3 px-3 py-2">
          <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400 truncate">{currentUserRole}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthenticated = !!localStorage.getItem('userId');

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <div className="flex h-screen bg-[#050811] text-slate-300 font-sans selection:bg-blue-500/30">
                <Sidebar />
                <main className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/leads/:id" element={<LeadDetail />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/dispatcher" element={<Dispatcher />} />
                    <Route path="/lost" element={<Lost />} />
                    <Route path="/activity" element={<ActivityPage />} />
                  </Routes>
                </main>
              </div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}
