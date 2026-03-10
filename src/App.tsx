import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Inbox, Activity, Settings, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Dispatcher from './pages/Dispatcher';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function Sidebar() {
  const location = useLocation();
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Leads', path: '/leads', icon: Users },
    { name: 'Dispatcher', path: '/dispatcher', icon: Inbox },
    { name: 'Activity', path: '/activity', icon: Activity },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-[#0A0F1C] border-r border-white/5 flex flex-col h-screen">
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">CM</span>
        </div>
        <span className="text-white font-semibold text-xl tracking-tight">CamptainM-CRM</span>
      </div>
      
      <nav className="flex-1 px-4 space-y-1 mt-4">
        {navItems.map((item) => {
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
        <div className="flex items-center space-x-3 px-3 py-2">
          <img src="https://i.pravatar.cc/150?u=admin" alt="Admin" className="w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Admin User</p>
            <p className="text-xs text-slate-400 truncate">Administrator</p>
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
            <Route path="/dispatcher" element={<Dispatcher />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
