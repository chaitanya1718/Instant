import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  format, 
  startOfToday, 
  isSameDay, 
  addDays,
  addMonths, 
  addYears,
  subDays,
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval
} from 'date-fns';
import { 
  Plus, 
  Check, 
  Clock, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Tag,
  Briefcase,
  Home as HomeIcon,
  Heart,
  ShoppingBag,
  Book,
  Coffee,
  Dumbbell,
  Music,
  Code,
  Palette,
  AlertCircle,
  X,
  FolderPlus,
  BookOpen,
  Repeat
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiUrl } from './lib/api';
import { useAuth } from './AuthContext';
import { cn } from './lib/utils';
import { useToast } from './ToastContext';

const DEFAULT_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280'
];

const CUSTOM_COLORS_STORAGE_KEY = 'dailyflow-custom-colors';
const TASK_LAYOUT_STORAGE_KEY = 'dailyflow-task-layout';
const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;
const REPEAT_DAY_OPTIONS = [
  { value: 1, shortLabel: 'Mon', fullLabel: 'Monday' },
  { value: 2, shortLabel: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', fullLabel: 'Thursday' },
  { value: 5, shortLabel: 'Fri', fullLabel: 'Friday' },
  { value: 6, shortLabel: 'Sat', fullLabel: 'Saturday' },
  { value: 0, shortLabel: 'Sun', fullLabel: 'Sunday' },
];

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

function getRgbFromHex(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) {
    return null;
  }

  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function getContrastTextColor(hexColor) {
  const rgb = getRgbFromHex(hexColor);
  if (!rgb) {
    return '#FFFFFF';
  }

  const luminance = (0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b);
  return luminance > 186 ? '#111827' : '#FFFFFF';
}

function getOverlayColor(hexColor, alpha) {
  const rgb = getRgbFromHex(hexColor);
  if (!rgb) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function timeStringToMinutes(value) {
  if (!value || !value.includes(':')) return null;

  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return (hours * 60) + minutes;
}

function formatTimelineHour(hour) {
  const normalizedHour = hour % 24;
  if (normalizedHour === 0) return '12 AM';
  if (normalizedHour < 12) return `${normalizedHour} AM`;
  if (normalizedHour === 12) return '12 PM';
  return `${normalizedHour - 12} PM`;
}

export default function Home() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [selectedRepeatDays, setSelectedRepeatDays] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [isTaskComposerOpen, setIsTaskComposerOpen] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState(null);
  const [taskDeleteChoice, setTaskDeleteChoice] = useState(null);
  const [taskMoveChoice, setTaskMoveChoice] = useState(null);
  const [moveTaskDate, setMoveTaskDate] = useState('');
  const [moveTaskStartTime, setMoveTaskStartTime] = useState('');
  const [moveTaskEndTime, setMoveTaskEndTime] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [taskLayout, setTaskLayout] = useState(() => {
    if (typeof window === 'undefined') return 'list';

    const savedLayout = window.localStorage.getItem(TASK_LAYOUT_STORAGE_KEY);
    return savedLayout === 'timeline' ? 'timeline' : 'list';
  });

  // Category creation state
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3B82F6');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
  const [customColorInput, setCustomColorInput] = useState('');
  const [colorOptions, setColorOptions] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_COLORS;

    try {
      const stored = JSON.parse(window.localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY) || '[]');
      const customColors = Array.isArray(stored)
        ? stored.map(normalizeHexColor).filter(Boolean)
        : [];

      return [...new Set([...DEFAULT_COLORS, ...customColors])];
    } catch {
      return DEFAULT_COLORS;
    }
  });

  const carouselRef = useRef(null);

  const iconMap = {
    Tag, Briefcase, HomeIcon, Heart, ShoppingBag, Book, Coffee, Dumbbell, Music, Code, Palette
  };

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/tasks'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      } else {
        console.error('Expected array for tasks, got:', data);
        setTasks([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      // Done
    }
  }, [token]);

  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/categories'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setCategories(data);
      } else {
        console.error('Expected array for categories, got:', data);
        setCategories([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    fetchTasks();
    fetchCategories();
    
    // Scroll to today's date on mount
    setTimeout(() => {
      const todayBtn = carouselRef.current?.querySelector('.is-today');
      if (todayBtn) {
        todayBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 500);
  }, [fetchTasks, fetchCategories]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const customColors = colorOptions.filter((color) => !DEFAULT_COLORS.includes(color));
    window.localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(customColors));
  }, [colorOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(TASK_LAYOUT_STORAGE_KEY, taskLayout);
  }, [taskLayout]);

  const saveCustomColor = () => {
    const normalizedColor = normalizeHexColor(customColorInput);
    if (!normalizedColor) return;

    setColorOptions((prev) => (prev.includes(normalizedColor) ? prev : [...prev, normalizedColor]));
    setNewCatColor(normalizedColor);
    setCustomColorInput('');
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim() || !token) return;

    const normalizedColor = normalizeHexColor(newCatColor);
    if (!normalizedColor) {
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/categories'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCatName,
          color: normalizedColor,
          icon: newCatIcon,
        }),
      });
      const newCat = await res.json();
      if (!res.ok) {
        throw new Error(newCat.error || 'Failed to create category');
      }
      setColorOptions((prev) => (prev.includes(normalizedColor) ? prev : [...prev, normalizedColor]));
      setCategories([...categories, newCat]);
      setNewCatName('');
      setNewCatColor('#3B82F6');
      setCustomColorInput('');
      setShowCategoryModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteCategory = async (id) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/categories/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Failed to delete category');
      }
      setCategories(categories.filter((c) => c.id !== id));
      if (selectedCategoryId === id) setSelectedCategoryId('');
    } catch (err) {
      console.error(err);
    }
  };

  const checkOverlap = (startTime, endTime, date, ignoredTaskId = null) => {
    if (!startTime || !endTime) return null;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayTasks = tasks.filter(
      (t) => t.id !== ignoredTaskId && t.date === dateStr && t.startTime && t.endTime,
    );
    
    const overlap = dayTasks.find(t => {
      return (startTime >= t.startTime && startTime < t.endTime) ||
             (endTime > t.startTime && endTime <= t.endTime) ||
             (startTime <= t.startTime && endTime >= t.endTime);
    });
    
    return overlap;
  };

  const getScheduledDates = useCallback((date, repeatDays) => {
    if (repeatDays.length === 0) {
      return [date];
    }

    return eachDayOfInterval({
      start: date,
      end: subDays(addYears(date, 1), 1),
    }).filter((day) => repeatDays.includes(day.getDay()));
  }, []);

  const toggleRepeatDay = (dayValue) => {
    setSelectedRepeatDays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((value) => value !== dayValue)
        : [...prev, dayValue].sort((a, b) => a - b)
    );
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !token) return;

    if (newTaskStartTime && newTaskEndTime && newTaskStartTime >= newTaskEndTime) {
      showToast('End time must be after start time.', 'warning');
      return;
    }

    const scheduledDates = getScheduledDates(selectedDate, selectedRepeatDays);
    if (scheduledDates.length === 0) {
      showToast('No matching recurring dates were found.', 'warning');
      return;
    }

    const overlap = scheduledDates
      .map((date) => ({
        date,
        conflict: checkOverlap(newTaskStartTime, newTaskEndTime, date),
      }))
      .find((entry) => entry.conflict);

    if (overlap) {
      setOverlapWarning({
        title: overlap.conflict.title,
        startTime: overlap.conflict.startTime,
        endTime: overlap.conflict.endTime,
        dateLabel: format(overlap.date, 'EEE, dd MMM yyyy'),
      });
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/tasks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTaskTitle,
          date: format(selectedDate, 'yyyy-MM-dd'),
          startTime: newTaskStartTime || null,
          endTime: newTaskEndTime || null,
          categoryId: selectedCategoryId || null,
          repeatDays: selectedRepeatDays,
        }),
      });
      const createdTasks = await res.json();
      if (!res.ok) {
        throw new Error(createdTasks.error || 'Failed to create task');
      }
      const nextTasks = Array.isArray(createdTasks) ? createdTasks : [createdTasks];
      setTasks((prev) => [...prev, ...nextTasks]);
      setNewTaskTitle('');
      setNewTaskStartTime('');
      setNewTaskEndTime('');
      setSelectedRepeatDays([]);
      setSelectedCategoryId('');
      setIsTaskComposerOpen(false);
      setOverlapWarning(null);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTask = async (task) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/tasks/${task.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ completed: !task.completed }),
      });
      const updatedTask = await res.json();
      if (!res.ok) {
        throw new Error(updatedTask.error || 'Failed to update task');
      }
      setTasks(tasks.map((t) => (t.id === task.id ? updatedTask : t)));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteTask = async (task, scope = 'single') => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/tasks/${task.id}?scope=${scope}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await res.json();
      if (!res.ok) {
        throw new Error('Failed to delete task');
      }

      if (scope === 'series' && task.seriesId) {
        setTasks((prev) => prev.filter((t) => t.seriesId !== task.seriesId));
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }

      setTaskDeleteChoice(null);
    } catch (err) {
      console.error(err);
    }
  };

  const openMoveTaskModal = (task) => {
    if (task.completed) {
      return;
    }

    setTaskMoveChoice(task);
    setMoveTaskDate(task.date);
    setMoveTaskStartTime(task.startTime || '');
    setMoveTaskEndTime(task.endTime || '');
  };

  const closeMoveTaskModal = () => {
    setTaskMoveChoice(null);
    setMoveTaskDate('');
    setMoveTaskStartTime('');
    setMoveTaskEndTime('');
  };

  const moveTask = async () => {
    if (!token || !taskMoveChoice) return;

    if (!moveTaskDate) {
      showToast('Choose a future date for this task.', 'warning');
      return;
    }

    const todayIso = format(startOfToday(), 'yyyy-MM-dd');
    if (moveTaskDate <= todayIso) {
      showToast('You can only move incomplete tasks to a future date.', 'warning');
      return;
    }

    if ((moveTaskStartTime && !moveTaskEndTime) || (!moveTaskStartTime && moveTaskEndTime)) {
      showToast('Choose both start and end time, or leave both empty.', 'warning');
      return;
    }

    if (moveTaskStartTime && moveTaskEndTime && moveTaskStartTime >= moveTaskEndTime) {
      showToast('End time must be after start time.', 'warning');
      return;
    }

    const overlap = checkOverlap(
      moveTaskStartTime,
      moveTaskEndTime,
      new Date(`${moveTaskDate}T00:00:00`),
      taskMoveChoice.id,
    );

    if (overlap) {
      showToast('That time slot is not empty on the selected date.', 'warning');
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/tasks/${taskMoveChoice.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: moveTaskDate,
          startTime: moveTaskStartTime || null,
          endTime: moveTaskEndTime || null,
        }),
      });
      const updatedTask = await res.json();

      if (!res.ok) {
        throw new Error(updatedTask.error || 'Failed to move task');
      }

      setTasks((prev) => prev.map((task) => (task.id === taskMoveChoice.id ? updatedTask : task)));
      setSelectedDate(new Date(`${moveTaskDate}T00:00:00`));
      closeMoveTaskModal();
      showToast('Task moved successfully.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to move task.', 'error');
    }
  };

  const filteredTasks = tasks
    .filter((t) => t.date === format(selectedDate, 'yyyy-MM-dd'))
    .sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  const datesInMonth = eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end: endOfMonth(viewMonth)
  });

  const currentTime = format(now, 'HH:mm');
  const todayStr = format(startOfToday(), 'yyyy-MM-dd');
  const timelineStartHour = 5;
  const timelineEndHour = 24;
  const timelineHourHeight = 72;
  const timelineHours = Array.from(
    { length: timelineEndHour - timelineStartHour + 1 },
    (_, index) => timelineStartHour + index
  );
  const timedTimelineTasks = filteredTasks
    .filter((task) => task.startTime && task.endTime)
    .map((task) => ({
      task,
      startMinutes: timeStringToMinutes(task.startTime),
      endMinutes: timeStringToMinutes(task.endTime),
    }))
    .filter((entry) => entry.startMinutes !== null && entry.endMinutes !== null && entry.endMinutes > entry.startMinutes);
  const anytimeTasks = filteredTasks.filter((task) => !task.startTime || !task.endTime);
  const currentMinutes = timeStringToMinutes(currentTime);
  const nowLineOffset =
    currentMinutes === null
      ? null
      : ((currentMinutes - (timelineStartHour * 60)) / 60) * timelineHourHeight;

  const renderTaskListCard = (task) => {
    const taskDateStr = task.date;
    const isToday = taskDateStr === todayStr;
    const isPastDate = taskDateStr < todayStr;
    const isFutureDate = taskDateStr > todayStr;
    const isTimePassed = isToday && task.startTime && task.startTime < currentTime;
    const isCurrentTask =
      !task.completed &&
      isToday &&
      Boolean(task.startTime) &&
      Boolean(task.endTime) &&
      task.startTime <= currentTime &&
      currentTime < task.endTime;

    const isMissed = !task.completed && (isPastDate || isTimePassed);
    const isUpcoming = !task.completed && (isFutureDate || (isToday && !isTimePassed));

    const category = categories.find((c) => c.id === task.categoryId);
    const categoryTextColor = category ? getContrastTextColor(category.color) : '#FFFFFF';
    const categorySoftBadgeColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.18 : 0.12)
      : undefined;
    const categoryBorderColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.18 : 0.16)
      : undefined;
    const categoryMutedTextColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.8 : 0.72)
      : undefined;
    const categoryActionColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.55 : 0.6)
      : undefined;

    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={() => openMoveTaskModal(task)}
        className={cn(
          "group flex flex-col gap-2 p-4 rounded-2xl transition-all border shadow-sm",
          task.completed
            ? "bg-gray-50 dark:bg-zinc-900/50 border-transparent opacity-60"
            : category
              ? "border-transparent"
              : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800"
        )}
        style={!task.completed && category ? {
          backgroundColor: category.color,
          color: categoryTextColor
        } : {}}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleTask(task);
              }}
              className={cn(
                "w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors",
                task.completed
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : category
                    ? ""
                    : "border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500"
              )}
              style={!task.completed && category ? {
                borderColor: categoryBorderColor,
                color: categoryTextColor,
              } : undefined}
            >
              {task.completed && <Check className="w-4 h-4" />}
            </button>
            <p className={cn(
              "text-lg font-black truncate",
              task.completed
                ? "line-through text-gray-400 dark:text-zinc-600"
                : category
                  ? ""
                  : "text-gray-900 dark:text-zinc-100"
            )}>
              {task.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCurrentTask && (
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                  category ? "" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                )}
                style={category ? {
                  backgroundColor: categorySoftBadgeColor,
                  color: categoryTextColor,
                } : undefined}
              >
                <span className="live-dot" />
                Now
              </span>
            )}
            {category && (
              <span className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                task.completed
                  ? "bg-gray-200 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300"
                  : ""
              )}
              style={!task.completed ? {
                backgroundColor: categorySoftBadgeColor,
                color: categoryTextColor,
              } : undefined}>
                {category.name}
              </span>
            )}
            {task.seriesId && (
              <span className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                task.completed
                  ? "bg-gray-200 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300"
                  : category
                    ? ""
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              )}
              style={!task.completed && category ? {
                backgroundColor: categorySoftBadgeColor,
                color: categoryTextColor,
              } : undefined}>
                Repeats
              </span>
            )}
          </div>
        </div>

        <div className={cn(
          "flex items-center justify-between pt-1 border-t",
          !task.completed && category ? "" : "border-gray-100 dark:border-zinc-800"
        )}>
          <div className={cn(
            "flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider",
            !task.completed && category ? "" : "text-gray-500 dark:text-zinc-500"
          )}
          style={!task.completed && category ? {
            color: categoryMutedTextColor,
          } : undefined}>
            {task.startTime ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>{task.startTime} {task.endTime ? `- ${task.endTime}` : ''}</span>
              </>
            ) : (
              <span>Anytime</span>
            )}
            {isMissed && !task.completed && (
              <span className={cn(
                "ml-2 font-black px-1.5 rounded",
                category ? "" : "text-red-500 bg-red-50 dark:bg-red-950/20"
              )}
              style={category ? {
                color: categoryTextColor,
                backgroundColor: 'rgba(239, 68, 68, 0.45)',
              } : undefined}>MISSED</span>
            )}
            {isUpcoming && !task.completed && (
              <span className={cn(
                "ml-2 font-black px-1.5 rounded",
                category ? "" : "text-orange-500 bg-orange-50 dark:bg-orange-950/20"
              )}
              style={category ? {
                color: categoryTextColor,
                backgroundColor: 'rgba(249, 115, 22, 0.42)',
              } : undefined}>UPCOMING</span>
            )}
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              if (task.seriesId) {
                setTaskDeleteChoice(task);
                return;
              }

              deleteTask(task);
            }}
            className={cn(
              "p-2 transition-all",
              !task.completed && category ? "" : "text-gray-400 hover:text-red-500"
            )}
            style={!task.completed && category ? {
              color: categoryActionColor,
            } : undefined}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  };

  const renderTimelineAnytimeCard = (task) => {
    const category = categories.find((c) => c.id === task.categoryId);
    const categoryTextColor = category ? getContrastTextColor(category.color) : '#FFFFFF';
    const categorySoftBadgeColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.18 : 0.12)
      : undefined;

    return (
      <div
        key={task.id}
        onClick={() => openMoveTaskModal(task)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3",
          task.completed
            ? "border-transparent bg-gray-100 opacity-60 dark:bg-zinc-900"
            : category
              ? "border-transparent"
              : "border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        )}
        style={!task.completed && category ? {
          backgroundColor: category.color,
          color: categoryTextColor,
        } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleTask(task);
            }}
            className={cn(
              "w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors",
              task.completed
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-gray-300 dark:border-zinc-700"
            )}
          >
            {task.completed && <Check className="w-3.5 h-3.5" />}
          </button>
          <div className="min-w-0">
            <p className={cn(
              "truncate text-sm font-black",
              task.completed ? "line-through text-gray-400 dark:text-zinc-600" : ""
            )}>
              {task.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              {category && (
                <span
                  className="rounded-lg px-2 py-1"
                  style={!task.completed ? {
                    backgroundColor: categorySoftBadgeColor,
                    color: categoryTextColor,
                  } : undefined}
                >
                  {category.name}
                </span>
              )}
              {task.seriesId && (
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Repeats
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={(event) => {
            event.stopPropagation();
            if (task.seriesId) {
              setTaskDeleteChoice(task);
              return;
            }

            deleteTask(task);
          }}
          className="p-2 text-gray-400 transition-colors hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const renderTimelineTimedCard = ({ task, startMinutes, endMinutes }) => {
    const taskDateStr = task.date;
    const isToday = taskDateStr === todayStr;
    const isPastDate = taskDateStr < todayStr;
    const isFutureDate = taskDateStr > todayStr;
    const isTimePassed = isToday && task.startTime && task.startTime < currentTime;
    const isCurrentTask =
      !task.completed &&
      isToday &&
      Boolean(task.startTime) &&
      Boolean(task.endTime) &&
      task.startTime <= currentTime &&
      currentTime < task.endTime;
    const isMissed = !task.completed && (isPastDate || isTimePassed);
    const isUpcoming = !task.completed && (isFutureDate || (isToday && !isTimePassed));
    const category = categories.find((c) => c.id === task.categoryId);
    const categoryTextColor = category ? getContrastTextColor(category.color) : '#FFFFFF';
    const categorySoftBadgeColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.18 : 0.12)
      : undefined;
    const categoryBorderColor = category
      ? getOverlayColor(categoryTextColor, categoryTextColor === '#FFFFFF' ? 0.18 : 0.16)
      : undefined;
    const top = ((startMinutes - (timelineStartHour * 60)) / 60) * timelineHourHeight;
    const height = Math.max(((endMinutes - startMinutes) / 60) * timelineHourHeight, 52);

    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={() => openMoveTaskModal(task)}
        className={cn(
          "absolute left-0 right-0 rounded-2xl border px-3 py-2 shadow-sm",
          task.completed
            ? "border-transparent bg-gray-100 opacity-60 dark:bg-zinc-900"
            : category
              ? "border-transparent"
              : "border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        )}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          ...(!task.completed && category ? {
            backgroundColor: category.color,
            color: categoryTextColor,
            boxShadow: `0 18px 34px ${getOverlayColor(category.color, 0.22)}`,
          } : {}),
        }}
      >
        <div className="flex h-full flex-col justify-between gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleTask(task);
                  }}
                  className={cn(
                    "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                    task.completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : category
                        ? ""
                        : "border-gray-300 dark:border-zinc-700"
                  )}
                  style={!task.completed && category ? {
                    borderColor: categoryBorderColor,
                    color: categoryTextColor,
                  } : undefined}
                >
                  {task.completed && <Check className="w-3.5 h-3.5" />}
                </button>
                <p className={cn(
                  "truncate text-sm font-black",
                  task.completed ? "line-through text-gray-400 dark:text-zinc-600" : ""
                )}>
                  {task.title}
                </p>
              </div>

              <p className={cn(
                "mt-1 text-xs font-bold",
                category ? "" : "text-gray-500 dark:text-zinc-400"
              )}>
                {task.startTime} - {task.endTime}
              </p>
            </div>

            <button
              onClick={(event) => {
                event.stopPropagation();
                if (task.seriesId) {
                  setTaskDeleteChoice(task);
                  return;
                }

                deleteTask(task);
              }}
              className={cn(
                "p-1.5 transition-colors",
                category ? "" : "text-gray-400 hover:text-red-500"
              )}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            {isCurrentTask && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1",
                  category ? "" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                )}
                style={category ? {
                  backgroundColor: categorySoftBadgeColor,
                  color: categoryTextColor,
                } : undefined}
              >
                <span className="live-dot" />
                Now
              </span>
            )}
            {category && (
              <span
                className="rounded-lg px-2 py-1"
                style={{
                  backgroundColor: task.completed ? undefined : categorySoftBadgeColor,
                  color: task.completed ? undefined : categoryTextColor,
                }}
              >
                {category.name}
              </span>
            )}
            {task.seriesId && (
              <span className={cn(
                "rounded-lg px-2 py-1",
                category
                  ? ""
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              )}
              style={category && !task.completed ? {
                backgroundColor: categorySoftBadgeColor,
                color: categoryTextColor,
              } : undefined}>
                Repeats
              </span>
            )}
            {isMissed && !task.completed && (
              <span className="rounded-lg bg-red-500/15 px-2 py-1 text-red-600 dark:text-red-300">
                Missed
              </span>
            )}
            {isUpcoming && !task.completed && (
              <span className="rounded-lg bg-orange-500/15 px-2 py-1 text-orange-600 dark:text-orange-300">
                Upcoming
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-12 space-y-6">
      {/* Date Carousel & Month Navigator */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{format(viewMonth, 'MMMM yyyy')}</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-600 dark:text-zinc-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-600 dark:text-zinc-400"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative group">
          <div 
            ref={carouselRef}
            className="flex overflow-x-auto gap-3 py-2 px-1 no-scrollbar scroll-smooth"
          >
            {datesInMonth.map((date) => {
              const isTodayDate = isSameDay(date, startOfToday());
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    "flex-shrink-0 w-14 h-18 rounded-2xl flex flex-col items-center justify-center transition-all relative",
                    isTodayDate && "is-today",
                    isSelected
                      ? "bg-black dark:bg-white text-white dark:text-black shadow-lg scale-105"
                      : "bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-gray-100 dark:border-zinc-800"
                  )}
                >
                  {isTodayDate && !isSelected && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-950" />
                  )}
                  <span className="text-[10px] uppercase font-bold opacity-70">{format(date, 'EEE')}</span>
                  <span className="text-lg font-black">{format(date, 'd')}</span>
                  {isTodayDate && isSelected && (
                    <span className="text-[8px] font-black mt-0.5">TODAY</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={() => setIsTaskComposerOpen((prev) => !prev)}
          aria-expanded={isTaskComposerOpen}
          aria-label={isTaskComposerOpen ? 'Hide task form' : 'Show task form'}
          className={cn(
            "group flex w-full items-center gap-4 rounded-[2rem] border px-4 py-4 shadow-sm transition-all",
            isTaskComposerOpen
              ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
              : "bg-white text-gray-900 border-gray-100 hover:-translate-y-0.5 hover:shadow-lg dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-gray-100 text-gray-900 dark:bg-zinc-800 dark:text-zinc-100">
            <Plus className={cn("h-6 w-6 transition-transform", isTaskComposerOpen && "rotate-45")} />
          </div>
          <div className="text-left leading-tight">
            <p className={cn(
              "text-[10px] font-black uppercase tracking-[0.22em]",
              isTaskComposerOpen ? "text-white/70 dark:text-black/60" : "text-gray-400 dark:text-zinc-500"
            )}>
              Quick Add
            </p>
            <p className={cn(
              "text-lg font-black tracking-tight",
              isTaskComposerOpen ? "text-white dark:text-black" : "text-gray-700 dark:text-zinc-200"
            )}>
              What needs to be done?
            </p>
          </div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isTaskComposerOpen && (
          <motion.form
            key="task-composer"
            onSubmit={addTask}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-zinc-800 space-y-4"
          >
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full bg-gray-50 dark:bg-zinc-800 px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-black dark:focus:ring-white text-base placeholder:text-gray-400 dark:text-zinc-100"
              />
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[120px] flex items-center gap-2 bg-gray-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
                  <div className="relative flex flex-1 flex-col pr-5">
                    <span className="text-[8px] font-black text-gray-400 uppercase">Start</span>
                    <input
                      type="time"
                      value={newTaskStartTime}
                      onChange={(e) => setNewTaskStartTime(e.target.value)}
                      className="time-input bg-transparent border-none focus:ring-0 text-xs font-bold p-0 text-gray-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-[120px] flex items-center gap-2 bg-gray-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
                  <div className="relative flex flex-1 flex-col pr-5">
                    <span className="text-[8px] font-black text-gray-400 uppercase">End</span>
                    <input
                      type="time"
                      value={newTaskEndTime}
                      onChange={(e) => setNewTaskEndTime(e.target.value)}
                      className="time-input bg-transparent border-none focus:ring-0 text-xs font-bold p-0 text-gray-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-[150px] flex items-center gap-2 bg-gray-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <div className="flex flex-col w-full">
                    <span className="text-[8px] font-black text-gray-400 uppercase">Category</span>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-xs font-bold p-0 w-full dark:text-zinc-100 appearance-none"
                    >
                      <option value="" className="dark:bg-zinc-900">None</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id} className="dark:bg-zinc-900">{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="p-2 text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                  title="Manage Categories"
                >
                  <FolderPlus className="w-5 h-5" />
                </button>

                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="ml-auto flex min-w-[78px] flex-col items-center justify-center gap-1 rounded-2xl bg-black px-3 py-2.5 text-white shadow-lg transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  title="Add Task"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px] font-black uppercase tracking-wider leading-none">
                    Add Task
                  </span>
                </button>
              </div>

              <div className="space-y-2 rounded-2xl bg-gray-50 dark:bg-zinc-800/70 px-4 py-3 border border-gray-100 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Repeat Weekly</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      Leave empty for a one-time task. Select days to repeat for the next 12 months.
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Optional
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {REPEAT_DAY_OPTIONS.map((day) => {
                    const isSelected = selectedRepeatDays.includes(day.value);

                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleRepeatDay(day.value)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-black tracking-wide border transition-colors",
                          isSelected
                            ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
                        )}
                      >
                        {day.shortLabel}
                      </button>
                    );
                  })}
                </div>

                {selectedRepeatDays.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    This task will be created on{' '}
                    {REPEAT_DAY_OPTIONS
                      .filter((day) => selectedRepeatDays.includes(day.value))
                      .map((day) => day.fullLabel)
                      .join(', ')}
                    {' '}starting {format(selectedDate, 'dd MMM yyyy')}.
                  </p>
                )}
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Overlap Warning Popup */}
      <AnimatePresence>
        {taskMoveChoice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm"
          >
            <div className="max-w-md w-full rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                    Move Task
                  </p>
                  <h3 className="text-xl font-black tracking-tight text-gray-900 dark:text-zinc-100">
                    Move this task
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeMoveTaskModal}
                  className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-800/70">
                <p className="text-base font-black text-gray-900 dark:text-zinc-100">{taskMoveChoice.title}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                  Pick a future date and a free slot
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                    Move To Date
                  </label>
                  <input
                    type="date"
                    value={moveTaskDate}
                    min={format(addDays(startOfToday(), 1), 'yyyy-MM-dd')}
                    onChange={(event) => setMoveTaskDate(event.target.value)}
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={moveTaskStartTime}
                      onChange={(event) => setMoveTaskStartTime(event.target.value)}
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={moveTaskEndTime}
                      onChange={(event) => setMoveTaskEndTime(event.target.value)}
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Leave both time fields empty if you want to move it as an anytime task.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeMoveTaskModal}
                  className="flex-1 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-900 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={moveTask}
                  className="flex-1 rounded-2xl bg-black px-4 py-3 text-sm font-black text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Move Task
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {taskDeleteChoice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm"
          >
            <div className="max-w-sm w-full rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
              <div className="flex items-center gap-3 text-gray-900 dark:text-zinc-100">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Delete repetitive task</h3>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                    {taskDeleteChoice.title}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
                This task belongs to a repeating series. Choose whether you want to remove only this day or the entire series.
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => deleteTask(taskDeleteChoice, 'single')}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="block text-sm font-black">Delete only for today</span>
                  <span className="block text-xs text-gray-500 dark:text-zinc-400">Keeps the rest of the repetitive schedule.</span>
                </button>

                <button
                  type="button"
                  onClick={() => deleteTask(taskDeleteChoice, 'series')}
                  className="w-full rounded-2xl bg-red-500 px-4 py-3 text-left text-white transition-colors hover:bg-red-600"
                >
                  <span className="block text-sm font-black">Delete entirely</span>
                  <span className="block text-xs text-red-100">Removes every upcoming and past occurrence in this series.</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTaskDeleteChoice(null)}
                className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {overlapWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/20 backdrop-blur-sm"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-zinc-800 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3 text-orange-500">
                <AlertCircle className="w-8 h-8" />
                <h3 className="text-lg font-black tracking-tight">Time Slot Conflict</h3>
              </div>
              <p className="text-gray-600 dark:text-zinc-400 text-sm leading-relaxed">
                This time slot overlaps with <span className="font-bold text-gray-900 dark:text-zinc-100">&quot;{overlapWarning.title}&quot;</span> scheduled from <span className="font-bold">{overlapWarning.startTime}</span> to <span className="font-bold">{overlapWarning.endTime}</span>{overlapWarning.dateLabel ? <> on <span className="font-bold">{overlapWarning.dateLabel}</span></> : null}.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setOverlapWarning(null)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-bold rounded-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Adjust Time
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Management Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-2xl border border-gray-100 dark:border-zinc-800 max-w-md w-full space-y-6 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">Categories</h3>
                <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <form onSubmit={addCategory} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category Name</label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Work, Health, Personal..."
                    className="w-full bg-gray-50 dark:bg-zinc-800 px-5 py-4 rounded-2xl border-none focus:ring-2 focus:ring-black dark:focus:ring-white text-gray-900 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pick Color</label>
                  <div className="flex flex-wrap gap-2">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCatColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full transition-all",
                          newCatColor === color ? "ring-2 ring-offset-2 ring-black dark:ring-white scale-110" : "opacity-70 hover:opacity-100"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customColorInput}
                      onChange={(e) => setCustomColorInput(e.target.value)}
                      placeholder="#14B8A6"
                      className="flex-1 bg-gray-50 dark:bg-zinc-800 px-4 py-3 rounded-2xl border border-gray-100 dark:border-zinc-800 focus:ring-2 focus:ring-black dark:focus:ring-white text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={saveCustomColor}
                      disabled={!normalizeHexColor(customColorInput)}
                      className="px-4 py-3 rounded-2xl bg-gray-900 text-white dark:bg-zinc-100 dark:text-black text-sm font-black disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Paste a hex code to save it for future categories.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pick Icon</label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.keys(iconMap).map(iconName => {
                      const IconComp = iconMap[iconName];
                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => setNewCatIcon(iconName)}
                          className={cn(
                            "p-3 rounded-xl flex items-center justify-center transition-all",
                            newCatIcon === iconName 
                              ? "bg-black dark:bg-white text-white dark:text-black shadow-lg" 
                              : "bg-gray-50 dark:bg-zinc-800 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
                          )}
                        >
                          <IconComp className="w-5 h-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black rounded-2xl hover:opacity-90 transition-all shadow-xl disabled:opacity-50"
                >
                  Create Category
                </button>
              </form>

              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-zinc-800">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Existing Categories</label>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-4">No categories created yet.</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map(cat => {
                      const IconComp = iconMap[cat.icon] || Tag;
                      return (
                        <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800 rounded-2xl group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: cat.color }}>
                              <IconComp className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-gray-900 dark:text-zinc-100">{cat.name}</span>
                          </div>
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-2">
          <h2 className="text-xs font-black text-gray-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
            {isSameDay(selectedDate, startOfToday()) ? "Today's Schedule" : format(selectedDate, 'MMMM do')}
          </h2>

          <div className="inline-flex items-center rounded-2xl border border-gray-200 bg-white/80 p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            {['list', 'timeline'].map((layoutOption) => (
              <button
                key={layoutOption}
                type="button"
                onClick={() => setTaskLayout(layoutOption)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all",
                  taskLayout === layoutOption
                    ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                    : "text-gray-500 hover:text-gray-900 dark:text-zinc-500 dark:hover:text-zinc-100"
                )}
              >
                {layoutOption}
              </button>
            ))}
          </div>
        </div>
        
        <AnimatePresence mode="popLayout">
          {filteredTasks.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 text-gray-300 dark:text-zinc-700 font-medium"
            >
              No tasks scheduled for this day.
            </motion.div>
          ) : (
            taskLayout === 'list' ? (
              filteredTasks.map(renderTaskListCard)
            ) : (
              <motion.div
                key="timeline-layout"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-[28px] border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
                  <div className="pt-8">
                    {timelineHours.slice(0, -1).map((hour) => (
                      <div
                        key={hour}
                        className="flex items-start justify-end pr-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500"
                        style={{ height: `${timelineHourHeight}px` }}
                      >
                        {formatTimelineHour(hour)}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {anytimeTasks.length > 0 && (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                          Anytime
                        </p>
                        <div className="mt-3 space-y-2">
                          {anytimeTasks.map(renderTimelineAnytimeCard)}
                        </div>
                      </div>
                    )}

                    <div className="relative overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div
                        className="relative min-w-[320px]"
                        style={{ height: `${(timelineEndHour - timelineStartHour) * timelineHourHeight}px` }}
                      >
                        {timelineHours.slice(0, -1).map((hour, index) => (
                          <div
                            key={hour}
                            className="absolute inset-x-0 border-t border-gray-200/90 dark:border-zinc-800"
                            style={{ top: `${index * timelineHourHeight}px` }}
                          />
                        ))}

                        <div className="absolute inset-y-0 left-0 w-14 border-r border-gray-200/90 dark:border-zinc-800" />

                        {isSameDay(selectedDate, startOfToday()) && nowLineOffset !== null && nowLineOffset >= 0 && nowLineOffset <= ((timelineEndHour - timelineStartHour) * timelineHourHeight) && (
                          <div
                            className="absolute left-0 right-0 z-10 flex items-center"
                            style={{ top: `${nowLineOffset}px` }}
                          >
                            <div className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.16)]" />
                            <div className="h-px flex-1 bg-red-500/90" />
                          </div>
                        )}

                        <div className="absolute inset-y-0 left-16 right-3">
                          {timedTimelineTasks.map(renderTimelineTimedCard)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
