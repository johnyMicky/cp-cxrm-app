import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecoveringAdmin, setIsRecoveringAdmin] = useState(false);
  const navigate = useNavigate();

  const getFriendlyError = (err: any) => {
    const code = err?.code || '';
    const message = err?.message || '';

    switch (code) {
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/user-not-found':
        return 'User not found.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/invalid-email':
        return 'Invalid email format.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection.';
      case 'permission-denied':
        return 'Permission denied. Check Firestore rules.';
      default:
        return message || 'Failed to sign in.';
    }
  };

  const restoreAdminFirestoreDoc = async (uid: string) => {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        email: 'c.morgan@ghost.com',
        name: 'Admin User',
        role: 'Administrator',
        avatar: `https://i.pravatar.cc/150?u=${uid}`,
        isOnline: true,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      },
      { merge: true }
    );
  };

  const handleRecoverAdmin = async () => {
    const adminEmail = 'c.morgan@ghost.com';
    const adminPassword = 'Q1w2e3r!';

    try {
      setIsRecoveringAdmin(true);
      setError('');

      // 1) ჯერ ვცდილობთ login-ს
      try {
        const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
        await restoreAdminFirestoreDoc(cred.user.uid);
        alert('Admin account restored successfully. ახლა შედი ჩვეულებრივად.');
        return;
      } catch (signInErr: any) {
        // თუ user საერთოდ არ არსებობს, შევქმნათ
        if (
          signInErr?.code === 'auth/user-not-found' ||
          signInErr?.code === 'auth/invalid-credential'
        ) {
          try {
            const created = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            await restoreAdminFirestoreDoc(created.user.uid);
            alert('Admin account created successfully. ახლა შედი ჩვეულებრივად.');
            return;
          } catch (createErr: any) {
            if (createErr?.code === 'auth/email-already-in-use') {
              setError('Admin email exists in Authentication, but the password is different.');
              return;
            }
            throw createErr;
          }
        }

        throw signInErr;
      }
    } catch (err: any) {
      console.error('ADMIN RECOVERY ERROR:', err);
      setError(err?.message || 'Failed to recover admin account.');
    } finally {
      setIsRecoveringAdmin(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    try {
      const data = await firestoreService.login(cleanEmail, cleanPassword);

      if (data && data.id) {
        localStorage.setItem('userId', String(data.id || ''));
        localStorage.setItem('userRole', data.role || 'Agent');
        localStorage.setItem('userName', data.name || 'User');
        localStorage.setItem(
          'userAvatar',
          data.avatar || `https://i.pravatar.cc/150?u=${data.id}`
        );

        navigate('/');
      } else {
        setError('Invalid credentials.');
      }
    } catch (err: any) {
      console.error('LOGIN PAGE ERROR:', err);
      setError(getFriendlyError(err));
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
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-200">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  placeholder="admin@cpcrm.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
                >
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
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
              Don't have an account?{' '}
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-blue-500 hover:text-blue-400 font-medium transition-colors"
              >
                Contact Administrator
              </a>
            </p>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleRecoverAdmin}
                disabled={isRecoveringAdmin}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
              >
                {isRecoveringAdmin ? 'Recovering admin...' : 'Recovery Access'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
