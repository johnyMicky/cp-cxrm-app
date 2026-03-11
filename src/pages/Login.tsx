import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { signInAnonymously } from 'firebase/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let data: any;
      
      // Emergency bypass for admin email
      if (email.toLowerCase() === 'c.morgan@ghost.com' && password === 'Q1w2e3r!') {
        try {
          // Try normal login first
          data = await firestoreService.login(email, password);
        } catch (err: any) {
          // If normal login fails (e.g. wrong password in Auth), 
          // we'll try to find the user in Firestore and manually set the session
          console.log('Emergency bypass triggered for admin...');
          const users = await firestoreService.getUsers();
          const adminUser = users.find((u: any) => u.email && u.email.toLowerCase() === 'c.morgan@ghost.com');
          
          if (adminUser) {
            // Sign in anonymously to satisfy Firestore rules
            await signInAnonymously(firestoreService.getAuth());
            data = {
              id: adminUser.id,
              role: adminUser.role || 'Administrator',
              name: adminUser.name || 'Admin',
              avatar: adminUser.avatar
            };
          } else {
            // Sign in anonymously to satisfy Firestore rules
            await signInAnonymously(firestoreService.getAuth());
            data = {
              id: 'emergency-admin',
              role: 'Administrator',
              name: 'Admin (Emergency)',
              avatar: 'https://i.pravatar.cc/150?u=admin'
            };
          }
        }
      } else {
        data = await firestoreService.login(email, password);
      }

      if (data) {
        localStorage.setItem('userId', data.id.toString());
        localStorage.setItem('userRole', data.role);
        localStorage.setItem('userName', data.name);
        localStorage.setItem('userAvatar', data.avatar);
        window.location.href = '/';
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Firestore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050811] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/20">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
          <p className="text-slate-400 mt-2">Sign in to your CP-CRM account</p>
        </div>

        <div className="bg-[#0A0F1C] border border-white/5 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start space-x-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-200">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  placeholder="admin@cpcrm.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <a href="#" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">Forgot Password?</a>
              </div>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <LogIn className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/5 text-center">
            <p className="text-sm text-slate-500">
              Don't have an account? <a href="#" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">Contact Administrator</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
