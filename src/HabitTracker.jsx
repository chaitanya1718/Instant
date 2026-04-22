import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, addYears, eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth, subMonths, subYears } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Check, Copy, Palette, Pencil, Plus, Save, Target, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { apiUrl } from './lib/api';
import { useToast } from './ToastContext';

const DEFAULT_PALETTES = [
  ['#F59E0B', '#FDE68A', '#92400E'],
  ['#10B981', '#A7F3D0', '#065F46'],
  ['#3B82F6', '#BFDBFE', '#1D4ED8'],
  ['#EC4899', '#FBCFE8', '#9D174D'],
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;

function normalizeHexColor(value) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return '';
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_REGEX.test(prefixed)) return '';
  if (prefixed.length === 4) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`;
  }
  return prefixed;
}

function getMonthKey(date) {
  return format(date, 'yyyy-MM');
}

function getContrastTextColor(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) return '#111827';
  const value = normalized.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 186 ? '#111827' : '#FFFFFF';
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function HabitTracker() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => startOfMonth(new Date()));
  const [habits, setHabits] = useState([]);
  const [entries, setEntries] = useState([]);
  const [paletteInputs, setPaletteInputs] = useState(() => [...DEFAULT_PALETTES[0]]);
  const [previousMonthHabits, setPreviousMonthHabits] = useState([]);
  const [draftHabit, setDraftHabit] = useState({ name: '', targetDays: '20' });
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editingHabit, setEditingHabit] = useState({ name: '', targetDays: '20' });
  const [error, setError] = useState('');
  const [savingPalette, setSavingPalette] = useState(false);
  const [copyingHabits, setCopyingHabits] = useState(false);
  const [isAddHabitOpen, setIsAddHabitOpen] = useState(false);
  const [isPaletteEditorOpen, setIsPaletteEditorOpen] = useState(false);
  const monthGridRef = useRef(null);

  const selectedMonthKey = getMonthKey(selectedMonthDate);
  const previousMonthKey = getMonthKey(startOfMonth(subMonths(selectedMonthDate, 1)));
  const today = new Date();

  const fetchHabits = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/habits?month=${selectedMonthKey}`), { headers: { Authorization: `Bearer ${token}` } });
      const data = await readApiResponse(response);
      setHabits(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setHabits([]);
    }
  }, [selectedMonthKey, token]);

  const fetchPreviousMonthHabits = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/habits?month=${previousMonthKey}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiResponse(response);
      setPreviousMonthHabits(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setPreviousMonthHabits([]);
    }
  }, [previousMonthKey, token]);

  const fetchMonthEntries = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/habit-entries?month=${selectedMonthKey}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiResponse(response);
      setEntries(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setEntries([]);
    }
  }, [selectedMonthKey, token]);

  const fetchPalette = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/habit-palettes/${selectedMonthKey}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiResponse(response);
      if (Array.isArray(data?.colors) && data.colors.length === 3) {
        setPaletteInputs(data.colors.map((color) => normalizeHexColor(color) || color));
      } else {
        setPaletteInputs([...DEFAULT_PALETTES[0]]);
      }
    } catch (fetchError) {
      console.error(fetchError);
      setPaletteInputs([...DEFAULT_PALETTES[0]]);
    }
  }, [selectedMonthKey, token]);

  useEffect(() => {
    fetchHabits();
    fetchPreviousMonthHabits();
  }, [fetchHabits, fetchPreviousMonthHabits]);

  useEffect(() => {
    fetchMonthEntries();
    fetchPalette();
  }, [fetchMonthEntries, fetchPalette]);

  useEffect(() => {
    setIsAddHabitOpen(false);
    setIsPaletteEditorOpen(false);
    setEditingHabitId(null);
    setError('');
  }, [selectedMonthKey]);

  useEffect(() => {
    const monthGrid = monthGridRef.current;
    if (!monthGrid) return;

    const todayColumn = monthGrid.querySelector('[data-today-column="true"]');
    if (!todayColumn) return;

    todayColumn.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedMonthKey, habits.length]);

  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(selectedMonthDate), end: endOfMonth(selectedMonthDate) }),
    [selectedMonthDate],
  );
  const maxTargetDays = daysInMonth.length;

  const entryMap = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      map.set(`${entry.habitId}:${entry.date}`, Boolean(entry.completed));
    });
    return map;
  }, [entries]);

  const palette = useMemo(() => {
    const normalized = paletteInputs.map((color) => normalizeHexColor(color));
    return normalized.every(Boolean) ? normalized : DEFAULT_PALETTES[0];
  }, [paletteInputs]);

  const habitRows = useMemo(() => habits.map((habit) => {
    const completedDays = daysInMonth.filter((day) => entryMap.get(`${habit.id}:${format(day, 'yyyy-MM-dd')}`)).length;
    const percent = habit.targetDays > 0 ? Math.round((completedDays / habit.targetDays) * 100) : 0;
    return { ...habit, completedDays, percent };
  }), [daysInMonth, entryMap, habits]);

  const chartData = useMemo(() => habitRows.map((habit) => ({
    name: habit.name.length > 14 ? `${habit.name.slice(0, 14)}...` : habit.name,
    fullName: habit.name,
    percent: habit.percent,
    completedDays: habit.completedDays,
    targetDays: habit.targetDays,
  })), [habitRows]);

  const showWarningToast = (message) => {
    showToast(message, 'warning');
  };

  const handleTargetDaysInput = (value, mode = 'draft') => {
    const applyValue = (nextValue) => {
      if (mode === 'edit') {
        setEditingHabit((prev) => ({ ...prev, targetDays: nextValue }));
        return;
      }

      setDraftHabit((prev) => ({ ...prev, targetDays: nextValue }));
    };

    if (value === '') {
      applyValue('');
      return;
    }

    if (/[.,]/.test(value)) {
      showWarningToast('Target days must be a whole number.');
      return;
    }

    if (!/^\d+$/.test(value)) {
      showWarningToast('Only integer numbers are allowed for target days.');
      return;
    }

    const parsedValue = Number(value);
    if (parsedValue > maxTargetDays) {
      showWarningToast(`This month allows target days from 0 to ${maxTargetDays}.`);
      applyValue(String(maxTargetDays));
      return;
    }

    applyValue(String(parsedValue));
  };

  const handleSaveHabit = async (event) => {
    event.preventDefault();
    if (!token) return;
    const targetDays = Number(draftHabit.targetDays);
    if (!draftHabit.name.trim() || draftHabit.targetDays === '' || !Number.isInteger(targetDays) || targetDays < 0 || targetDays > maxTargetDays) {
      setError(`Enter a habit name and a whole-number target between 0 and ${maxTargetDays} days.`);
      return;
    }
    setError('');
    try {
      const response = await fetch(apiUrl('/api/habits'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: draftHabit.name.trim(), targetDays, month: selectedMonthKey }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Failed to create habit');
      setHabits((prev) => [...prev, data]);
      setDraftHabit({ name: '', targetDays: '20' });
      setIsAddHabitOpen(false);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to create habit');
    }
  };

  const startEditingHabit = (habit) => {
    setEditingHabitId(habit.id);
    setEditingHabit({ name: habit.name, targetDays: String(habit.targetDays) });
  };

  const saveEditedHabit = async () => {
    if (!token || !editingHabitId) return;
    const targetDays = Number(editingHabit.targetDays);
    if (!editingHabit.name.trim() || editingHabit.targetDays === '' || !Number.isInteger(targetDays) || targetDays < 0 || targetDays > maxTargetDays) {
      setError(`Habit edit needs a name and a whole-number target between 0 and ${maxTargetDays}.`);
      return;
    }
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/habits/${editingHabitId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editingHabit.name.trim(), targetDays }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Failed to update habit');
      setHabits((prev) => prev.map((habit) => (habit.id === editingHabitId ? data : habit)));
      setEditingHabitId(null);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to update habit');
    }
  };

  const deleteHabit = async (habitId) => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl(`/api/habits/${habitId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete habit');
      setHabits((prev) => prev.filter((habit) => habit.id !== habitId));
      setEntries((prev) => prev.filter((entry) => entry.habitId !== habitId));
      if (editingHabitId === habitId) setEditingHabitId(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError('Failed to delete habit');
    }
  };

  const toggleHabitDay = async (habitId, date) => {
    if (!token) return;
    const entryKey = `${habitId}:${date}`;
    const nextCompleted = !entryMap.get(entryKey);
    try {
      const response = await fetch(apiUrl('/api/habit-entries'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ habitId, date, completed: nextCompleted }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Failed to update habit day');
      setEntries((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.habitId === habitId && entry.date === date);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = data;
          return next;
        }
        return [...prev, data];
      });
    } catch (toggleError) {
      console.error(toggleError);
      setError('Failed to update habit progress');
    }
  };

  const applyPalettePreset = (preset) => setPaletteInputs([...preset]);

  const copyHabitsFromPreviousMonth = async () => {
    if (!token || previousMonthHabits.length === 0) return;

    setCopyingHabits(true);
    setError('');

    try {
      const response = await fetch(apiUrl('/api/habits/copy-from-month'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fromMonth: previousMonthKey, toMonth: selectedMonthKey }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data?.error || 'Failed to copy habits');
      setHabits(Array.isArray(data) ? data : []);
    } catch (copyError) {
      console.error(copyError);
      setError(copyError instanceof Error ? copyError.message : 'Failed to copy habits');
    } finally {
      setCopyingHabits(false);
    }
  };

  const savePalette = async () => {
    if (!token) return;
    const normalized = paletteInputs.map((color) => normalizeHexColor(color));
    if (!normalized.every(Boolean)) {
      setError('Palette needs exactly three valid hex colors.');
      return;
    }
    setSavingPalette(true);
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/habit-palettes/${selectedMonthKey}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ colors: normalized }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Failed to save palette');
      setPaletteInputs(data.colors);
      setIsPaletteEditorOpen(false);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save palette');
    } finally {
      setSavingPalette(false);
    }
  };

  const primaryColor = palette[0];
  const secondaryColor = palette[1];
  const accentColor = palette[2];
  const accentTextColor = getContrastTextColor(primaryColor);
  const canCopyPreviousMonth = previousMonthHabits.length > 0 && habits.length === 0;

  return (
    <div className="max-w-[90rem] mx-auto p-4 pb-12 space-y-8">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]" style={{ backgroundColor: `${secondaryColor}55`, color: accentColor }}>
          <CalendarDays className="w-3.5 h-3.5" />
          Habit Tracker
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          
          <div className="flex flex-col gap-3 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedMonthDate((prev) => startOfMonth(subYears(prev, 1)))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Prev year
              </button>
              <p className="text-2xl font-black text-gray-900 dark:text-zinc-100">{format(selectedMonthDate, 'yyyy')}</p>
              <button
                type="button"
                onClick={() => setSelectedMonthDate((prev) => startOfMonth(addYears(prev, 1)))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Next year
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {MONTH_NAMES.map((monthName, monthIndex) => {
                const isActive = selectedMonthDate.getMonth() === monthIndex;

                return (
                  <button
                    key={monthName}
                    type="button"
                    onClick={() => setSelectedMonthDate(new Date(selectedMonthDate.getFullYear(), monthIndex, 1))}
                    className="shrink-0 rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-colors"
                    style={isActive
                      ? { backgroundColor: primaryColor, color: accentTextColor }
                      : { backgroundColor: `${secondaryColor}33`, color: accentColor }}
                  >
                    {monthName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Habits Stack</p>
              <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">{habitRows.length} active habits</h2>
            </div>

            {habitRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm font-medium text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
                Add your first habit to start building the monthly stack.
              </div>
            ) : (
              habitRows.map((habit) => (
                <div key={habit.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/70">
                  {editingHabitId === habit.id ? (
                    <div className="space-y-3">
                      <input type="text" value={editingHabit.name} onChange={(event) => setEditingHabit((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                      <input type="text" inputMode="numeric" value={editingHabit.targetDays} onChange={(event) => handleTargetDaysInput(event.target.value, 'edit')} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEditedHabit} className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: primaryColor }}>
                          <Save className="w-4 h-4" />
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingHabitId(null)} className="inline-flex items-center gap-2 rounded-2xl bg-gray-200 px-4 py-2 text-sm font-black text-gray-900 dark:bg-zinc-700 dark:text-zinc-100">
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-gray-900 dark:text-zinc-100">{habit.name}</p>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{habit.completedDays}/{habit.targetDays} days • {habit.percent}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEditingHabit(habit)} className="rounded-2xl p-2 text-gray-500 hover:bg-white dark:hover:bg-zinc-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => deleteHabit(habit.id)} className="rounded-2xl p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          ) : null}

        </section>

        <section className="space-y-6">
          <div className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-gray-100 px-6 py-5 dark:border-zinc-800">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Monthly Grid</p>
                  <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">{format(selectedMonthDate, 'MMMM yyyy')} habit stack</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canCopyPreviousMonth ? (
                    <button
                      type="button"
                      onClick={copyHabitsFromPreviousMonth}
                      disabled={copyingHabits}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <Copy className="w-4 h-4" />
                      {copyingHabits ? 'Copying...' : `Add From ${format(startOfMonth(subMonths(selectedMonthDate, 1)), 'MMM')}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsPaletteEditorOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <Palette className="w-4 h-4" />
                    Edit Palette
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddHabitOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Plus className="w-4 h-4" />
                    Add Habit
                  </button>
                </div>
              </div>
            </div>

            {(isAddHabitOpen || isPaletteEditorOpen) && (
              <div className="space-y-4 border-b border-gray-100 bg-gray-50/70 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950/30">
                {isAddHabitOpen ? (
                  <form onSubmit={handleSaveHabit} className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Add Habit</p>
                        <h3 className="text-lg font-black text-gray-900 dark:text-zinc-100">Create a monthly target</h3>
                      </div>
                      <button type="button" onClick={() => setIsAddHabitOpen(false)} className="rounded-2xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={draftHabit.name}
                      onChange={(event) => setDraftHabit((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="DSA, Journal, Workout..."
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
                    />
                    <label className="block space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Target Days For This Month</span>
                      <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
                        <Target className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draftHabit.targetDays}
                          onChange={(event) => handleTargetDaysInput(event.target.value, 'draft')}
                          placeholder={`0 to ${maxTargetDays}`}
                          className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-zinc-100"
                        />
                      </div>
                    </label>
                    <button type="submit" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-90" style={{ backgroundColor: primaryColor }}>
                      <Plus className="w-4 h-4" />
                      Add Habit
                    </button>
                  </form>
                ) : null}

                {isPaletteEditorOpen ? (
                  <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Monthly Palette</p>
                        <h3 className="text-lg font-black text-gray-900 dark:text-zinc-100">{format(selectedMonthDate, 'MMMM yyyy')}</h3>
                      </div>
                      <button type="button" onClick={() => setIsPaletteEditorOpen(false)} className="rounded-2xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {DEFAULT_PALETTES.map((preset) => {
                        const isSelected = preset.every((color, index) => normalizeHexColor(paletteInputs[index]) === color);
                        return (
                          <button
                            key={preset.join('-')}
                            type="button"
                            onClick={() => applyPalettePreset(preset)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${
                              isSelected ? 'border-gray-900 bg-gray-50 dark:border-zinc-200 dark:bg-zinc-800' : 'border-gray-100 bg-white dark:border-zinc-800 dark:bg-zinc-950'
                            }`}
                          >
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">Preset</span>
                            <span className="flex items-center gap-2">
                              {preset.map((color) => (
                                <span key={color} className="h-5 w-5 rounded-full border border-white/60" style={{ backgroundColor: color }} />
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {paletteInputs.map((color, index) => (
                        <div key={index} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
                          <span className="h-8 w-8 rounded-full border border-white/60 shadow-sm" style={{ backgroundColor: normalizeHexColor(color) || '#E5E7EB' }} />
                          <input
                            type="text"
                            value={color}
                            onChange={(event) => setPaletteInputs((prev) => prev.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
                            placeholder="#F59E0B"
                            className="w-full bg-transparent text-sm font-bold uppercase tracking-[0.18em] text-gray-900 outline-none dark:text-zinc-100"
                          />
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={savePalette} disabled={savingPalette} className="w-full rounded-2xl px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accentColor }}>
                      Save This Month&apos;s Palette
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <div ref={monthGridRef} className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid border-b border-gray-100 dark:border-zinc-800" style={{ gridTemplateColumns: `260px repeat(${daysInMonth.length}, minmax(38px, 1fr))` }}>
                  <div className="sticky left-0 z-10 border-r border-gray-100 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">Habits</p>
                  </div>
                  {daysInMonth.map((day) => {
                    const isToday = isSameDay(day, today);

                    return (
                    <div
                      key={format(day, 'yyyy-MM-dd')}
                      data-today-column={isToday ? 'true' : 'false'}
                      className="flex flex-col items-center justify-center px-1 py-3 text-center"
                    >
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{format(day, 'EEE')}</span>
                      <span
                        className="mt-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-black text-gray-900 dark:text-zinc-100"
                        style={isToday ? { backgroundColor: `${secondaryColor}66`, color: accentColor } : undefined}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                  )})}
                </div>

                {habitRows.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm font-medium text-gray-400 dark:text-zinc-500">
                    Your habit table will appear here after you add at least one habit.
                  </div>
                ) : (
                  habitRows.map((habit) => (
                    <div key={habit.id} className="grid border-b border-gray-100 last:border-b-0 dark:border-zinc-800" style={{ gridTemplateColumns: `260px repeat(${daysInMonth.length}, minmax(38px, 1fr))` }}>
                      <div className="sticky left-0 z-10 flex items-center border-r border-gray-100 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-gray-900 dark:text-zinc-100">{habit.name}</p>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                            {habit.completedDays}/{habit.targetDays} days • {habit.percent}%
                          </p>
                        </div>
                      </div>

                      {daysInMonth.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const isCompleted = entryMap.get(`${habit.id}:${dateKey}`);
                        const isToday = isSameDay(day, today);
                        const baseBorderColor = accentColor;
                        const todayBackground = `${secondaryColor}44`;
                        return (
                          <div key={dateKey} className="flex items-center justify-center px-1 py-3">
                            <button
                              type="button"
                              onClick={() => toggleHabitDay(habit.id, dateKey)}
                              className="flex h-7 w-7 items-center justify-center rounded-[10px] border-2 transition-all"
                              style={isCompleted
                                ? { backgroundColor: primaryColor, borderColor: primaryColor, color: accentTextColor, boxShadow: isToday ? `0 0 0 4px ${secondaryColor}66` : 'none' }
                                : { borderColor: baseBorderColor, color: accentColor, backgroundColor: 'transparent', boxShadow: isToday ? `0 0 0 4px ${todayBackground}` : 'none' }}
                            >
                              {isCompleted ? <Check className="w-4 h-4" /> : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Progress Graph</p>
                <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">{format(selectedMonthDate, 'MMMM')}</h2>
              </div>
              <div className="rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em]" style={{ backgroundColor: `${secondaryColor}55`, color: accentColor }}>
                0 - 100%
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 700 }} />
                  <YAxis domain={[0, 100]} tickCount={6} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '18px', border: 'none', boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)' }}
                    formatter={(value, _name, context) => [`${value}%`, `${context?.payload?.completedDays}/${context?.payload?.targetDays} days`]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  />
                  <Line type="linear" dataKey="percent" stroke={accentColor} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: primaryColor }} activeDot={{ r: 6, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
