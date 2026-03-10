import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Inbox, Activity, Settings, LogOut, UserCog, XCircle } from 'lucide-react';
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

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Leads', path: '/leads', icon: Users, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Lost', path: '/lost', icon: XCircle, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Team', path: '/team', icon: UserCog, roles: ['Administrator'] },
    { name: 'Dispatcher', path: '/dispatcher', icon: Inbox, roles: ['Administrator', 'Manager'] },
    { name: 'Activity', path: '/activity', icon: Activity, roles: ['Administrator', 'Manager'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Administrator'] },
  ];

  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const userName = localStorage.getItem('userName') || 'Admin User';
  const userAvatar = localStorage.getItem('userAvatar') || 'https://i.pravatar.cc/150?u=admin';

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
