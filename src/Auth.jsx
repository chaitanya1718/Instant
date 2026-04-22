import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, ArrowLeft, Key, CheckCircle2 } from 'lucide-react';
import { apiUrl } from './lib/api';

export default function Auth({ initialView = 'login', onNavigate }) {
  const { login } = useAuth();
  const [view, setView] = useState(initialView); // 'login', 'signup', 'forgot-password', 'reset-password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const resetToken = params.get('token');

    if (mode === 'reset-password') {
      setView('reset-password');
      if (resetToken) {
        setToken(resetToken);
      }
    }
  }, []);

  useEffect(() => {
    if (resetCooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResetCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resetCooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (view === 'login' || view === 'signup') {
        const endpoint = view === 'login' ? apiUrl('/api/auth/login') : apiUrl('/api/auth/signup');
        const body = view === 'login' ? { email, password } : { email, password, name };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        login(data.token, data.user);
        onNavigate?.('/dashboard');
      } else if (view === 'forgot-password') {
        const res = await fetch(apiUrl('/api/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        setResetCooldown(data.retryAfterSeconds || 0);
        setSuccess(data.message || 'If that email exists, a reset link has been sent.');
      } else if (view === 'reset-password') {
        if (password !== confirmPassword) throw new Error('Passwords do not match');
        
        const res = await fetch(apiUrl('/api/auth/reset-password-with-token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword: password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        setSuccess('Password reset successful! Please login.');
        window.history.replaceState({}, '', '/login');
        setTimeout(() => {
          setView('login');
          onNavigate?.('/login', { replace: true });
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const renderForm = () => {
    switch (view) {
      case 'forgot-password':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || resetCooldown > 0}
              className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black rounded-full animate-spin" />
                : resetCooldown > 0
                  ? `Wait ${resetCooldown}s`
                  : 'Send Reset Link'}
            </button>
            {resetCooldown > 0 && (
              <p className="text-center text-xs font-semibold text-gray-400 dark:text-zinc-500">
                You can request another reset email after the cooldown ends.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setView('login');
                onNavigate?.('/login');
              }}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Login
            </button>
          </form>
        );
      case 'reset-password':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!token && (
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
                <input
                  type="text"
                  placeholder="Reset Token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
                />
              </div>
            )}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black rounded-full animate-spin" /> : 'Reset Password'}
            </button>
          </form>
        );
      default:
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {view === 'signup' && (
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all dark:text-zinc-100"
              />
            </div>

            {view === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setView('forgot-password')}
                  className="text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  {view === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {view === 'login' ? 'Sign In' : 'Sign Up'}
                </>
              )}
            </button>
          </form>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F9FAFB] dark:bg-zinc-950 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-zinc-800"
      >
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100">
            {view === 'login' ? 'Welcome Back' : 
             view === 'signup' ? 'Create Account' : 
             view === 'forgot-password' ? 'Forgot Password' : 'Reset Password'}
          </h1>
          <p className="text-gray-500 dark:text-zinc-500">
            {view === 'login' ? 'Manage your daily flow with ease.' : 
             view === 'signup' ? 'Start your journey to productivity.' : 
             view === 'forgot-password' ? 'Enter your email to receive a reset link.' : 'Open the email link or enter your token and new password.'}
          </p>
        </div>

        {renderForm()}

        {error && (
          <p className="mt-4 text-sm text-red-500 text-center font-medium bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">{error}</p>
        )}

        {success && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        {(view === 'login' || view === 'signup') && (
          <div className="mt-8 text-center">
            <button
              onClick={() => {
                const nextView = view === 'login' ? 'signup' : 'login';
                setView(nextView);
                onNavigate?.(nextView === 'signup' ? '/signup' : '/login');
              }}
              className="text-sm font-semibold text-gray-500 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
            >
              {view === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
