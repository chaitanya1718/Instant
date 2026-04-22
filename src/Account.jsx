import { useAuth } from './AuthContext';
import { BarChart2, LogOut, User, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { AiFillHome } from "react-icons/ai";

export default function Account({ onNavigateHome, onNavigateAnalytics }) {
  const { user, logout } = useAuth();

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateHome}
            className="md:hidden p-3 bg-gray-100 dark:bg-zinc-800 rounded-2xl text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all"
          >
            {/* <LayoutDashboard className="w-6 h-6" /> */}
            <AiFillHome className="w-6 h-6" />
          </button>
          <div className="w-16 h-16 bg-black dark:bg-white rounded-3xl flex items-center justify-center text-white dark:text-black shadow-xl">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">{user?.name}</h1>
            <p className="text-gray-500 dark:text-zinc-500 font-bold">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-red-50 dark:bg-red-950/20 text-red-500 dark:text-red-400 font-black rounded-2xl hover:bg-red-100 dark:hover:bg-red-950/40 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <section className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-zinc-800 shadow-sm">
            <button
              type="button"
              onClick={onNavigateAnalytics}
              className="w-full flex items-center justify-between gap-4 rounded-[2rem] border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 px-6 py-5 text-left transition-all hover:border-gray-300 hover:bg-gray-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-sm">
                  <BarChart2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500">review</p>
                  <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-zinc-100">Analytics</h2>
                </div>
              </div>
              <span className="text-sm font-black text-gray-500 dark:text-zinc-400">Open</span>
            </button>
          </section>
        </div>

        <div className="space-y-8">
          {/* <section className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-zinc-800 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-gray-900 dark:text-zinc-100">
              <ShieldCheck className="w-6 h-6" />
              <h2 className="text-xl font-black tracking-tight">Security</h2>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
              <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed font-bold">
                Your account is protected with industry-standard encryption. To reset your password, please use the &quot;Forgot Password&quot; link on the login page.
              </p>
            </div>
          </section> */}

          {/* <div className="bg-orange-50 dark:bg-orange-950/20 p-6 rounded-3xl border border-orange-100 dark:border-orange-900/30">
            <p className="text-xs text-orange-800 dark:text-orange-300 font-bold leading-relaxed">
              Tip: Regular password updates and consistent task completion help maintain a secure and productive DailyFlow experience.
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
}
