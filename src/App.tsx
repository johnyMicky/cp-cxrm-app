import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Inbox, Activity, Settings, LogOut, UserCog } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Dispatcher from './pages/Dispatcher';
import Team from './pages/Team';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function Sidebar() {
  const location = useLocation();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Leads', path: '/leads', icon: Users, roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'] },
    { name: 'Team', path: '/team', icon: UserCog, roles: ['Administrator'] },
    { name: 'Dispatcher', path: '/dispatcher', icon: Inbox, roles: ['Administrator', 'Manager'] },
    { name: 'Activity', path: '/activity', icon: Activity, roles: ['Administrator', 'Manager'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Administrator'] },
  ];

  const currentUserRole = window.localStorage.getItem('userRole') || 'Administrator';

  return (
    <div className="w-64 bg-[#0A0F1C] border-r border-white/5 flex flex-col h-screen">
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">CM</span>
        </div>
        <span className="text-white font-semibold text-xl tracking-tight">CamptainM-CRM</span>
      </div>
      
      <nav className="flex-1 px-4 space-y-1 mt-4">
        {navItems.filter(item => item.roles.includes(currentUserRole)).map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
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
        <div className="mb-4 px-3">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">Debug: Switch Role</label>
          <select 
            className="w-full bg-white/5 border border-white/10 rounded-md text-xs text-slate-300 py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onChange={(e) => {
              // This is a hack for the demo to allow switching roles
              window.localStorage.setItem('userRole', e.target.value);
              window.location.reload();
            }}
            value={window.localStorage.getItem('userRole') || 'Administrator'}
          >
            <option value="Administrator">Administrator</option>
            <option value="Manager">Manager</option>
            <option value="Team Leader">Team Leader</option>
            <option value="Agent">Agent</option>
          </select>
        </div>
        <div className="flex items-center space-x-3 px-3 py-2">
          <img src="https://i.pravatar.cc/150?u=admin" alt="Admin" className="w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Admin User</p>
            <p className="text-xs text-slate-400 truncate">{window.localStorage.getItem('userRole') || 'Administrator'}</p>
          </div>
          <button className="text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-[#050811] text-slate-300 font-sans selection:bg-blue-500/30">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/team" element={<Team />} />
            <Route path="/dispatcher" element={<Dispatcher />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
