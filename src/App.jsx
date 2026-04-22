import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import Home from './Home';
import Review from './Review';
import Account from './Account';
import Auth from './Auth';
import Vocab from './Vocab';
import HabitTracker from './HabitTracker';
import TaskAssistant from './TaskAssistant';
import { ToastProvider } from './ToastContext';
import { BarChart2, LogOut, User, Sun, Moon, BookOpen, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AiFillHome } from "react-icons/ai";

const APP_ROUTES = {
  dashboard: '/dashboard',
  analytics: '/analytics',
  vocabulary: '/vocabulary',
  habitTracker: '/habitTracker',
  profile: '/profile',
  login: '/login',
  signup: '/signup',
};

function getPathname() {
  return window.location.pathname || APP_ROUTES.dashboard;
}

function isAuthRoute(pathname) {
  return pathname === APP_ROUTES.login || pathname === APP_ROUTES.signup;
}

function AppContent() {
  const { user, logout } = useAuth();
  const [pathname, setPathname] = useState(() => getPathname());
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const navigate = useCallback((nextPath, { replace = false } = {}) => {
    if (nextPath === window.location.pathname) {
      setPathname(nextPath);
      return;
    }

    if (replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }

    setPathname(nextPath);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (user && isAuthRoute(pathname)) {
      const timer = window.setTimeout(() => {
        navigate(APP_ROUTES.dashboard, { replace: true });
      }, 0);

      return () => window.clearTimeout(timer);
    }

    if (!user && !isAuthRoute(pathname)) {
      const timer = window.setTimeout(() => {
        navigate(APP_ROUTES.login, { replace: true });
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [navigate, pathname, user]);

  const activePage = pathname === APP_ROUTES.analytics
    ? 'analytics'
    : pathname === APP_ROUTES.vocabulary
      ? 'vocabulary'
      : pathname === APP_ROUTES.habitTracker
        ? 'habitTracker'
      : pathname === APP_ROUTES.profile
        ? 'profile'
        : pathname === APP_ROUTES.signup
          ? 'signup'
          : pathname === APP_ROUTES.login
            ? 'login'
            : 'dashboard';

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] dark:bg-zinc-950">
        <Auth
          initialView={activePage === 'signup' ? 'signup' : 'login'}
          onNavigate={navigate}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-zinc-950 pb-24 md:pb-0 md:pl-20 transition-colors duration-300">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-gray-100 dark:border-zinc-800 z-40 px-4 flex items-center justify-between md:left-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black font-black text-sm">
          I
          </div>
          <span className="font-black text-lg tracking-tight text-gray-900 dark:text-zinc-100">Instant</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-2">
            <button
              type="button"
              onClick={() => navigate(APP_ROUTES.vocabulary)}
              className={cn(
                "text-[10px] font-black uppercase tracking-[0.22em] transition-colors",
                activePage === 'vocabulary'
                  ? "text-gray-900 dark:text-zinc-100"
                  : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
              )}
            >
              Vocab
            </button>
            <button
              type="button"
              onClick={() => navigate(APP_ROUTES.habitTracker)}
              className={cn(
                "text-[10px] font-black uppercase tracking-[0.22em] transition-colors",
                activePage === 'habitTracker'
                  ? "text-gray-900 dark:text-zinc-100"
                  : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
              )}
            >
              Habits
            </button>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-all mr-2"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-bold text-gray-900 dark:text-zinc-100 leading-tight">{user.name}</span>
            <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{user.email}</span>
          </div>
          <button 
            onClick={() => navigate(APP_ROUTES.profile)}
            className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center transition-all border shadow-sm",
              activePage === 'profile'
                ? "bg-black dark:bg-white text-white dark:text-black border-transparent"
                : "bg-gray-50 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 border-gray-100 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700"
            )}
          >
            <User className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar (Desktop) / Bottom Nav (Mobile - Simplified) */}
      <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:w-20 bg-white dark:bg-zinc-900 border-t md:border-t-0 md:border-r border-gray-100 dark:border-zinc-800 z-50 flex md:flex-col items-center justify-around md:justify-center gap-8 p-4 md:p-4 sm:hidden md:flex">
        <div className="hidden md:flex flex-col items-center gap-2 mb-auto" />

        <button
          onClick={() => navigate(APP_ROUTES.dashboard)}
          className={cn(
            "p-3.5 rounded-2xl transition-all",
            activePage === 'dashboard' 
              ? "bg-black dark:bg-white text-white dark:text-black shadow-xl scale-110" 
              : "text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800"
          )}
        >
          {/* <LayoutDashboard className="w-6 h-6" /> */}
           <AiFillHome className="w-6 h-6" />
        </button>

        <button
          onClick={() => navigate(APP_ROUTES.analytics)}
          className={cn(
            "p-3.5 rounded-2xl transition-all",
            activePage === 'analytics' 
              ? "bg-black dark:bg-white text-white dark:text-black shadow-xl scale-110" 
              : "text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800"
          )}
        >
          <BarChart2 className="w-6 h-6" />
        </button>

        <button
          onClick={() => navigate(APP_ROUTES.vocabulary)}
          className={cn(
            "p-3.5 rounded-2xl transition-all",
            activePage === 'vocabulary'
              ? "bg-black dark:bg-white text-white dark:text-black shadow-xl scale-110"
              : "text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800"
          )}
        >
          <BookOpen className="w-6 h-6" />
        </button>

        <button
          onClick={() => navigate(APP_ROUTES.habitTracker)}
          className={cn(
            "p-3.5 rounded-2xl transition-all",
            activePage === 'habitTracker'
              ? "bg-black dark:bg-white text-white dark:text-black shadow-xl scale-110"
              : "text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800"
          )}
        >
          <ListTodo className="w-6 h-6" />
        </button>

        <div className="md:mt-auto flex md:flex-col items-center gap-4">
          <button
            onClick={logout}
            className="p-3.5 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-2xl transition-all hidden md:block"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </nav>

      <main className="min-h-screen pt-24 px-4 overflow-x-hidden md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activePage === 'dashboard' ? (
              <Home />
            ) : activePage === 'analytics' ? (
              <Review />
            ) : activePage === 'vocabulary' ? (
              <Vocab />
            ) : activePage === 'habitTracker' ? (
              <HabitTracker />
            ) : (
              <Account
                onNavigateHome={() => navigate(APP_ROUTES.dashboard)}
                onNavigateAnalytics={() => navigate(APP_ROUTES.analytics)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <TaskAssistant />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
