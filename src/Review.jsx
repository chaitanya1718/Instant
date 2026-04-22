import { useState, useEffect } from 'react';
import { format, startOfToday, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, startOfWeek, endOfWeek, addWeeks, isSameMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useAuth } from './AuthContext';
import { apiUrl } from './lib/api';
import { TrendingUp, CheckCircle2, XCircle, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

function getTaskStatusCounts(dayTasks, todayStr, currentTime) {
  const accomplished = dayTasks.filter((task) => task.completed).length;
  const missed = dayTasks.filter((task) => {
    if (task.completed) return false;
    const isPastDate = task.date < todayStr;
    const isToday = task.date === todayStr;
    const isTimePassed = isToday && task.startTime && task.startTime < currentTime;
    return isPastDate || isTimePassed;
  }).length;

  const upcoming = dayTasks.filter((task) => {
    if (task.completed) return false;
    const isFutureDate = task.date > todayStr;
    const isToday = task.date === todayStr;
    const isTimePassed = isToday && task.startTime && task.startTime < currentTime;
    return isFutureDate || (isToday && !isTimePassed);
  }).length;

  return { accomplished, missed, upcoming };
}

function buildWeeklyPages(activityMonthDate, activityTasks, todayStr, currentTime) {
  const monthStart = startOfMonth(activityMonthDate);
  const monthEnd = endOfMonth(activityMonthDate);
  const firstWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const pages = [];

  let cursor = firstWeekStart;
  while (cursor <= lastWeekEnd) {
    const weekStart = cursor;
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayTasks = activityTasks.filter((task) => task.date === dateStr);
      const { accomplished, missed, upcoming } = getTaskStatusCounts(dayTasks, todayStr, currentTime);

      return {
        name: format(date, 'EEE'),
        dayNumber: format(date, 'd'),
        fullDate: dateStr,
        inMonth: isSameMonth(date, activityMonthDate),
        accomplished,
        missed,
        upcoming,
        total: dayTasks.length,
      };
    });

    pages.push({
      label: `${format(weekStart, 'dd MMM')} - ${format(weekEnd, 'dd MMM')}`,
      days,
    });

    cursor = addWeeks(cursor, 1);
  }

  return pages;
}

export default function Review() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [activityMonth, setActivityMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [distributionMonth, setDistributionMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [manualWeekPage, setManualWeekPage] = useState(null);

  useEffect(() => {
    let isActive = true;

    async function loadTasks() {
      if (!token) return;

      try {
        const res = await fetch(apiUrl('/api/tasks'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (isActive) {
          setTasks(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error(error);
        if (isActive) {
          setTasks([]);
        }
      }
    }

    loadTasks();

    return () => {
      isActive = false;
    };
  }, [token]);

  const now = new Date();
  const currentTime = format(now, 'HH:mm');
  const todayStr = format(startOfToday(), 'yyyy-MM-dd');

  const monthOptions = Array.from(new Set([
    format(new Date(), 'yyyy-MM'),
    ...tasks.map((task) => task.date.slice(0, 7)),
  ]))
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      value: month,
      label: format(parseISO(`${month}-01`), 'MMMM yyyy'),
    }));

  const activityTasks = tasks.filter((task) => task.date.slice(0, 7) === activityMonth);
  const distributionTasks = tasks.filter((task) => task.date.slice(0, 7) === distributionMonth);
  const activityMonthDate = parseISO(`${activityMonth}-01`);
  const distributionMonthDate = parseISO(`${distributionMonth}-01`);
  const weeklyPages = buildWeeklyPages(activityMonthDate, activityTasks, todayStr, currentTime);

  const todayIndex = weeklyPages.findIndex((page) => page.days.some((day) => day.fullDate === todayStr));
  const defaultWeekPage = activityMonth === format(new Date(), 'yyyy-MM') && todayIndex >= 0 ? todayIndex : 0;

  const activeWeekPage = Math.min(
    manualWeekPage ?? defaultWeekPage,
    Math.max(weeklyPages.length - 1, 0),
  );
  const currentWeek = weeklyPages[activeWeekPage];

  const totalTasks = activityTasks.length;
  const activityCounts = getTaskStatusCounts(activityTasks, todayStr, currentTime);
  const completionRate = totalTasks > 0 ? Math.round((activityCounts.accomplished / totalTasks) * 100) : 0;
  const distributionCounts = getTaskStatusCounts(distributionTasks, todayStr, currentTime);

  const pieData = [
    { name: 'Accomplished', value: distributionCounts.accomplished, color: '#10b981' },
    { name: 'Missed', value: distributionCounts.missed, color: '#ef4444' },
    { name: 'Upcoming', value: distributionCounts.upcoming, color: '#f97316' },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100">Performance Review</h1>
        <p className="text-gray-500 dark:text-zinc-500">Track productivity in 7-day windows and compare month-wise distribution.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl text-emerald-500 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-black uppercase tracking-wider">Accomplished</p>
            <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{activityCounts.accomplished}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl text-red-500 dark:text-red-400">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-black uppercase tracking-wider">Missed</p>
            <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{activityCounts.missed}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-2xl text-orange-500 dark:text-orange-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-black uppercase tracking-wider">Upcoming</p>
            <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{activityCounts.upcoming}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl text-blue-500 dark:text-blue-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-black uppercase tracking-wider">Success Rate</p>
            <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{completionRate}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-zinc-100">{format(activityMonthDate, 'MMMM yyyy')} Activity</h3>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                {currentWeek?.label || 'Weekly view'}
              </p>
            </div>

            <label className="relative inline-flex cursor-pointer items-center rounded-2xl border border-gray-100 bg-gray-50 p-3 text-gray-400 transition-colors hover:text-gray-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200">
              <Calendar className="w-5 h-5" />
              <select
                value={activityMonth}
                onChange={(event) => {
                  setActivityMonth(event.target.value);
                  setManualWeekPage(null);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Select activity month"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-zinc-800/70">
            <button
              type="button"
              onClick={() => setManualWeekPage((prev) => Math.max(0, (prev ?? defaultWeekPage) - 1))}
              disabled={activeWeekPage <= 0}
              className="rounded-2xl border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500">
              Week {Math.min(activeWeekPage + 1, Math.max(weeklyPages.length, 1))} of {Math.max(weeklyPages.length, 1)}
            </p>
            <button
              type="button"
              onClick={() => setManualWeekPage((prev) => Math.min(weeklyPages.length - 1, (prev ?? defaultWeekPage) + 1))}
              disabled={activeWeekPage >= weeklyPages.length - 1}
              className="rounded-2xl border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentWeek?.days || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" className="dark:stroke-zinc-800" />
                <XAxis dataKey="dayNumber" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 700 }} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload;
                    return row ? `${row.name}, ${row.dayNumber} ${format(parseISO(row.fullDate), 'MMM')}` : '';
                  }}
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="accomplished" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="missed" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="upcoming" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-zinc-100">Overall Distribution</h3>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                {format(distributionMonthDate, 'MMMM yyyy')}
              </p>
            </div>

            <label className="relative inline-flex cursor-pointer items-center rounded-2xl border border-gray-100 bg-gray-50 p-3 text-gray-400 transition-colors hover:text-gray-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200">
              <Calendar className="w-5 h-5" />
              <select
                value={distributionMonth}
                onChange={(event) => setDistributionMonth(event.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Select distribution month"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="h-72 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData.filter((entry) => entry.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={96}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-gray-500 dark:text-zinc-500 font-black uppercase tracking-wider">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
