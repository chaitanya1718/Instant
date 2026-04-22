import "dotenv/config";
import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import path from "path";
import { createServer as createViteServer } from "vite";

mongoose.set("bufferCommands", false);

const JWT_SECRET = process.env.JWT_SECRET || "daily-flow-secret-key-123";
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "DailyFlow";
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || SMTP_FROM_EMAIL;
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || SMTP_FROM_NAME;
const RESET_TOKEN_EXPIRY_MINUTES = Number(process.env.RESET_TOKEN_EXPIRY_MINUTES || 60);
const RESET_REQUEST_COOLDOWN_SECONDS = Number(process.env.RESET_REQUEST_COOLDOWN_SECONDS || 60);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

type JwtUser = {
  id: string;
  email: string;
};

type UserRecord = {
  id: string;
  email: string;
  password: string;
  name: string;
  resetToken?: string;
  resetTokenExpiry?: Date;
  isVerified: boolean;
  verificationToken?: string;
};

type CategoryRecord = {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: Date;
};

type TaskRecord = {
  id: string;
  userId: string;
  categoryId?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  seriesId?: string;
  repeatDays?: number[];
  completed: boolean;
  createdAt: Date;
};

type VocabularyRecord = {
  id: string;
  userId: string;
  word: string;
  meaning: string;
  createdAt: Date;
};

type VocabularyChallengeRecord = {
  id: string;
  userId: string;
  date: string;
  createdAt: Date;
};

type HabitRecord = {
  id: string;
  userId: string;
  month: string;
  name: string;
  targetDays: number;
  createdAt: Date;
  updatedAt: Date;
};

type HabitEntryRecord = {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type HabitPaletteRecord = {
  id: string;
  userId: string;
  month: string;
  colors: string[];
  createdAt: Date;
  updatedAt: Date;
};

const REPEAT_DAY_VALUES = new Set([0, 1, 2, 3, 4, 5, 6]);

type AuthenticatedRequest = Request & {
  user?: JwtUser;
};

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  resetToken: String,
  resetTokenExpiry: Date,
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
});

const categorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  color: { type: String, required: true },
  icon: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  title: { type: String, required: true },
  date: { type: String, required: true },
  startTime: String,
  endTime: String,
  seriesId: String,
  repeatDays: { type: [Number], default: [] },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const vocabularySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  word: { type: String, required: true },
  meaning: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const vocabularyChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const habitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  month: { type: String, required: true },
  name: { type: String, required: true },
  targetDays: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const habitEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  habitId: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", required: true },
  date: { type: String, required: true },
  completed: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const habitPaletteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  month: { type: String, required: true },
  colors: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

vocabularyChallengeSchema.index({ userId: 1, date: 1 }, { unique: true });
habitSchema.index({ userId: 1, month: 1, createdAt: 1 });
habitEntrySchema.index({ userId: 1, habitId: 1, date: 1 }, { unique: true });
habitPaletteSchema.index({ userId: 1, month: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);
const Category = mongoose.model("Category", categorySchema);
const Task = mongoose.model("Task", taskSchema);
const Vocabulary = mongoose.model("Vocabulary", vocabularySchema);
const VocabularyChallenge = mongoose.model("VocabularyChallenge", vocabularyChallengeSchema);
const Habit = mongoose.model("Habit", habitSchema);
const HabitEntry = mongoose.model("HabitEntry", habitEntrySchema);
const HabitPalette = mongoose.model("HabitPalette", habitPaletteSchema);

const memoryUsers = new Map<string, UserRecord>();
const memoryCategories = new Map<string, CategoryRecord>();
const memoryTasks = new Map<string, TaskRecord>();
const memoryVocabulary = new Map<string, VocabularyRecord>();
const memoryVocabularyChallenges = new Map<string, VocabularyChallengeRecord>();
const memoryHabits = new Map<string, HabitRecord>();
const memoryHabitEntries = new Map<string, HabitEntryRecord>();
const memoryHabitPalettes = new Map<string, HabitPaletteRecord>();
const passwordResetCooldowns = new Map<string, number>();

const toId = (value: unknown) => String(value);

const serializeUser = (user: UserRecord) => ({
  id: user.id,
  email: user.email,
  name: user.name,
});

async function connectToMongo() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI not provided. Falling back to in-memory storage.");
    return false;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Connected to MongoDB");
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    console.warn("Falling back to in-memory storage.");

    if (error instanceof Error && error.name === "MongoParseError") {
      console.error("TIP: URL-encode special characters in your MongoDB password.");
    }

    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sendBadRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

function normalizeRepeatDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && REPEAT_DAY_VALUES.has(day)),
  )].sort((a, b) => a - b);
}

function parseIsoDateToUtc(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildRecurringDates(startDate: string, repeatDays: number[]) {
  const parsedStartDate = parseIsoDateToUtc(startDate);
  if (!parsedStartDate) {
    return null;
  }

  if (repeatDays.length === 0) {
    return [startDate];
  }

  const endDate = new Date(parsedStartDate);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  const dates: string[] = [];
  const cursor = new Date(parsedStartDate);

  while (cursor <= endDate) {
    if (repeatDays.includes(cursor.getUTCDay())) {
      dates.push(formatUtcDate(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getTodayUtcDateString() {
  return formatUtcDate(new Date());
}

function compareIsoDatesAsc(a: string, b: string) {
  return a.localeCompare(b);
}

function buildChallengeStats(dates: string[]) {
  const uniqueDates = [...new Set(dates)].sort(compareIsoDatesAsc);
  const today = getTodayUtcDateString();
  const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = formatUtcDate(yesterdayDate);
  const dateSet = new Set(uniqueDates);

  let streakCursor = dateSet.has(today) ? today : dateSet.has(yesterday) ? yesterday : null;
  let currentStreak = 0;

  while (streakCursor && dateSet.has(streakCursor)) {
    currentStreak += 1;
    const previous = new Date(`${streakCursor}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    streakCursor = formatUtcDate(previous);
  }

  return {
    completedDates: uniqueDates,
    totalDaysCompleted: uniqueDates.length,
    currentStreak,
    todayCompleted: dateSet.has(today),
  };
}

type AssistantAction = {
  type: "save_vocabulary";
  word: string;
  meaning: string;
};

type AssistantHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type AssistantResponsePayload = {
  reply: string;
  suggestions: string[];
  action?: AssistantAction;
};

const ASSISTANT_SUGGESTIONS = [
  "What does my day look like tomorrow?",
  "Do I have any unfinished tasks?",
  "Show my recent saved words",
];

const MONTH_LOOKUP = new Map<string, number>([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11],
]);

const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return "";
  }

  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_REGEX.test(prefixed)) {
    return "";
  }

  if (prefixed.length === 4) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`;
  }

  return prefixed;
}

function normalizeHabitMonth(value: unknown) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}`;
}

function getDaysInHabitMonth(month: string) {
  const normalizedMonth = normalizeHabitMonth(month);
  if (!normalizedMonth) {
    return null;
  }

  const [year, monthValue] = normalizedMonth.split("-").map(Number);
  return new Date(Date.UTC(year, monthValue, 0)).getUTCDate();
}

function normalizeHabitPaletteColors(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? normalizeHexColor(item) : ""))
    .filter(Boolean);

  if (normalized.length !== 3) {
    return null;
  }

  return normalized;
}

function formatLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatFriendlyDate(dateIso: string) {
  const parsed = parseIsoDateToUtc(dateIso);
  if (!parsed) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatTaskTime(task: TaskRecord) {
  if (task.startTime && task.endTime) {
    return `${task.startTime} - ${task.endTime}`;
  }

  if (task.startTime) {
    return `Starts at ${task.startTime}`;
  }

  if (task.endTime) {
    return `Ends at ${task.endTime}`;
  }

  return "Any time";
}

function sortTasksForAssistant(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    if (!left.startTime && !right.startTime) {
      return left.title.localeCompare(right.title);
    }

    if (!left.startTime) {
      return 1;
    }

    if (!right.startTime) {
      return -1;
    }

    return left.startTime.localeCompare(right.startTime);
  });
}

function parseAssistantDate(message: string, now = new Date()) {
  const normalized = message.toLowerCase().replace(/[,?]/g, " ").replace(/\s+/g, " ").trim();

  if (normalized.includes("tomorrow")) {
    return formatLocalIsoDate(addLocalDays(now, 1));
  }

  if (normalized.includes("today")) {
    return formatLocalIsoDate(now);
  }

  const isoMatch = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1] && parseIsoDateToUtc(isoMatch[1])) {
    return isoMatch[1];
  }

  const dayMonthMatch = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?\b/);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const month = MONTH_LOOKUP.get(dayMonthMatch[2]);
    const year = dayMonthMatch[3] ? Number(dayMonthMatch[3]) : now.getFullYear();

    if (month !== undefined) {
      const parsed = new Date(year, month, day);
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return formatLocalIsoDate(parsed);
      }
    }
  }

  const monthDayMatch = normalized.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/);
  if (monthDayMatch) {
    const month = MONTH_LOOKUP.get(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    const year = monthDayMatch[3] ? Number(monthDayMatch[3]) : now.getFullYear();

    if (month !== undefined) {
      const parsed = new Date(year, month, day);
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return formatLocalIsoDate(parsed);
      }
    }
  }

  return null;
}

function buildScheduleReply(tasks: TaskRecord[], dateIso: string) {
  const dayTasks = sortTasksForAssistant(tasks.filter((task) => task.date === dateIso));

  if (dayTasks.length === 0) {
    return `You have no tasks scheduled for ${formatFriendlyDate(dateIso)}.`;
  }

  const lines = dayTasks.slice(0, 8).map((task) => {
    const status = task.completed ? "completed" : "pending";
    return `- ${task.title} (${formatTaskTime(task)}, ${status})`;
  });

  const extraCount = dayTasks.length - lines.length;
  if (extraCount > 0) {
    lines.push(`- ${extraCount} more task${extraCount === 1 ? "" : "s"} on that day.`);
  }

  return [`Here is your schedule for ${formatFriendlyDate(dateIso)}:`, ...lines].join("\n");
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${pad2(Math.floor(safeMinutes / 60))}:${pad2(safeMinutes % 60)}`;
}

function buildFreeSlotsReply(tasks: TaskRecord[], dateIso: string) {
  const dayTasks = tasks.filter((task) => task.date === dateIso);
  const timedTasks = dayTasks
    .filter((task) => task.startTime && task.endTime)
    .sort((left, right) => left.startTime!.localeCompare(right.startTime!));
  const untimedTasks = dayTasks.filter((task) => !task.startTime || !task.endTime);

  if (timedTasks.length === 0) {
    const untimedNote = untimedTasks.length > 0
      ? ` You still have ${untimedTasks.length} untimed task${untimedTasks.length === 1 ? "" : "s"} that day.`
      : "";
    return `Your full day looks open on ${formatFriendlyDate(dateIso)} based on timed tasks.${untimedNote}`;
  }

  const merged: Array<{ start: number; end: number }> = [];
  for (const task of timedTasks) {
    const start = toMinutes(task.startTime!);
    const end = toMinutes(task.endTime!);
    const previous = merged[merged.length - 1];

    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      continue;
    }

    merged.push({ start, end });
  }

  const gaps: string[] = [];
  let cursor = 0;

  for (const block of merged) {
    if (block.start > cursor) {
      gaps.push(`${formatMinutes(cursor)} - ${formatMinutes(block.start)}`);
    }
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < (23 * 60 + 59)) {
    gaps.push(`${formatMinutes(cursor)} - 23:59`);
  }

  if (gaps.length === 0) {
    return `You do not have any free timed slot on ${formatFriendlyDate(dateIso)}.`;
  }

  const lines = gaps.map((gap) => `- ${gap}`);
  if (untimedTasks.length > 0) {
    lines.push(`- Note: ${untimedTasks.length} task${untimedTasks.length === 1 ? "" : "s"} on that day do not have a full time range.`);
  }

  return [`Free slots for ${formatFriendlyDate(dateIso)}:`, ...lines].join("\n");
}

function isTaskMissed(task: TaskRecord, now = new Date()) {
  if (task.completed) {
    return false;
  }

  const todayIso = formatLocalIsoDate(now);
  if (task.date < todayIso) {
    return true;
  }

  if (task.date > todayIso) {
    return false;
  }

  const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  if (task.endTime) {
    return task.endTime < nowTime;
  }

  if (task.startTime) {
    return task.startTime < nowTime;
  }

  return false;
}

function buildMissedTasksReply(tasks: TaskRecord[]) {
  const missedTasks = sortTasksForAssistant(tasks.filter((task) => isTaskMissed(task))).slice(-8).reverse();

  if (missedTasks.length === 0) {
    return "You do not have any missed tasks right now.";
  }

  const lines = missedTasks.map((task) => `- ${task.title} on ${formatFriendlyDate(task.date)} (${formatTaskTime(task)})`);
  return ["These tasks look missed:", ...lines].join("\n");
}

function buildRecentWordsReply(vocabulary: VocabularyRecord[]) {
  if (vocabulary.length === 0) {
    return "You have not saved any vocabulary words yet.";
  }

  const recentWords = [...vocabulary]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  const lines = recentWords.map((entry) => `- ${entry.word}: ${entry.meaning}`);
  return ["Your recently saved words are:", ...lines].join("\n");
}

function buildSavedWordMeaningsReply(vocabulary: VocabularyRecord[]) {
  if (vocabulary.length === 0) {
    return "You have not saved any vocabulary words yet.";
  }

  const recentWords = [...vocabulary]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8);

  const lines = recentWords.map((entry) => `- ${entry.word}: ${entry.meaning}`);
  return ["Here are meanings for your saved words:", ...lines].join("\n");
}

function findSavedVocabularyWord(vocabulary: VocabularyRecord[], word: string) {
  const normalizedWord = word.trim().toLowerCase();
  return vocabulary.find((entry) => entry.word.trim().toLowerCase() === normalizedWord) || null;
}

function sanitizeLookupWord(word: string) {
  return word
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[^a-zA-Z-]/g, "");
}

function extractWordFromMessage(message: string) {
  const patterns = [
    /(?:meaning of|define)\s+(?:the\s+word\s+)?["']?([a-zA-Z-]+)["']?(?:\s+mean)?/i,
    /what does\s+(?:the\s+word\s+)?["']?([a-zA-Z-]+)["']?\s+mean\b/i,
    /["']?([a-zA-Z-]+)["']?\s+(?:means?|mean)\b/i,
    /(?:what is|what's)\s+the\s+meaning\s+of\s+["']?([a-zA-Z-]+)["']?\b/i,
    /(?:add|save)\s+(?:a\s+new\s+)?word\s+["']?([a-zA-Z-]+)["']?/i,
    /(?:add|save)\s+["']?([a-zA-Z-]+)["']?\s+(?:word|to vocabulary)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const cleaned = sanitizeLookupWord(match[1]);
      if (cleaned) {
        return cleaned;
      }
    }
  }

  const singleWordMatch = message.trim().match(/^["']?([a-zA-Z-]+)["']?[?.!]?$/i);
  if (singleWordMatch?.[1]) {
    const cleaned = sanitizeLookupWord(singleWordMatch[1]);
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

async function lookupWordMeaning(word: string) {
  if (!GROQ_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You provide concise dictionary-style meanings in plain English.",
        },
        {
          role: "user",
          content: `Give a short plain-English dictionary meaning for the word "${word}". Keep it under 35 words, no markdown, no bullets, no extra commentary.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq word lookup failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return data.choices?.[0]?.message?.content?.trim() || null;
}

function buildAssistantContext(tasks: TaskRecord[], vocabulary: VocabularyRecord[]) {
  const today = new Date();
  const todayIso = formatLocalIsoDate(today);
  const tomorrowIso = formatLocalIsoDate(addLocalDays(today, 1));
  const sortedTasks = sortTasksForAssistant(tasks).slice(-40);
  const taskSummary = sortedTasks.map((task) => ({
    title: task.title,
    date: task.date,
    startTime: task.startTime || null,
    endTime: task.endTime || null,
    completed: task.completed,
  }));

  const recentVocabulary = [...vocabulary]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 30)
    .map((entry) => ({
      word: entry.word,
      meaning: entry.meaning,
      createdAt: entry.createdAt,
    }));

  return JSON.stringify({
    today: todayIso,
    tomorrow: tomorrowIso,
    taskCount: tasks.length,
    tasks: taskSummary,
    recentVocabulary,
  });
}

function buildAssistantQueryContext(message: string, tasks: TaskRecord[], vocabulary: VocabularyRecord[]) {
  const requestedDate = parseAssistantDate(message);
  const normalizedMessage = message.toLowerCase();

  return JSON.stringify({
    userMessage: message,
    resolvedDate: requestedDate,
    scheduleReply:
      requestedDate && (normalizedMessage.includes("schedule") || normalizedMessage.includes("task") || normalizedMessage.includes("day"))
        ? buildScheduleReply(tasks, requestedDate)
        : null,
    freeSlotsReply:
      requestedDate && (normalizedMessage.includes("free") || normalizedMessage.includes("available"))
        ? buildFreeSlotsReply(tasks, requestedDate)
        : null,
    missedTasksReply: normalizedMessage.includes("missed") ? buildMissedTasksReply(tasks) : null,
    recentWordsReply:
      normalizedMessage.includes("recent") || normalizedMessage.includes("saved words")
        ? buildRecentWordsReply(vocabulary)
        : null,
    savedWordMeaningsReply:
      normalizedMessage.includes("meanings of my saved words") || normalizedMessage.includes("meaning of the words i have saved")
        ? buildSavedWordMeaningsReply(vocabulary)
        : null,
  });
}

function sanitizeAssistantSuggestions(value: unknown) {
  if (!Array.isArray(value)) {
    return ASSISTANT_SUGGESTIONS;
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : ASSISTANT_SUGGESTIONS;
}

async function buildConversationalAssistantReply(
  message: string,
  tasks: TaskRecord[],
  vocabulary: VocabularyRecord[],
  history: AssistantHistoryMessage[],
) {
  if (!GROQ_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are the DailyFlow assistant inside a productivity app.",
            "Be conversational and helpful, but never invent tasks, dates, or saved words.",
            "Answer only from the provided DailyFlow context and recent chat history.",
            "If the user asks for something not present in the data, say that clearly and suggest only DailyFlow-related follow-ups.",
            "Use exact dates when useful, especially for relative dates like today and tomorrow.",
            "If query context provides a resolvedDate or prepared reply, rely on that instead of guessing.",
            "Never suggest features outside this app such as checking another calendar or creating a task unless the user explicitly asks for that workflow.",
            "Return strict JSON with keys: reply (string), suggestions (array of 1 to 3 short strings).",
          ].join(" "),
        },
        {
          role: "system",
          content: `DailyFlow context JSON: ${buildAssistantContext(tasks, vocabulary)}`,
        },
        {
          role: "system",
          content: `Query context JSON: ${buildAssistantQueryContext(message, tasks, vocabulary)}`,
        },
        ...history.slice(-6).map((entry) => ({
          role: entry.role,
          content: entry.text,
        })),
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq assistant chat failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return null;
  }

  const parsed = JSON.parse(content) as {
    reply?: unknown;
    suggestions?: unknown;
  };

  if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
    return null;
  }

  return {
    reply: parsed.reply.trim(),
    suggestions: sanitizeAssistantSuggestions(parsed.suggestions),
  } satisfies AssistantResponsePayload;
}

async function buildAssistantReply(
  message: string,
  tasks: TaskRecord[],
  vocabulary: VocabularyRecord[],
  history: AssistantHistoryMessage[],
) {
  const requestedWord = extractWordFromMessage(message);
  if (requestedWord) {
    const savedWord = findSavedVocabularyWord(vocabulary, requestedWord);
    if (savedWord) {
      return {
        reply: `${savedWord.word}: ${savedWord.meaning}`,
        suggestions: ASSISTANT_SUGGESTIONS,
      } satisfies AssistantResponsePayload;
    }

    try {
      const meaning = await lookupWordMeaning(requestedWord);
      if (meaning) {
        return {
          reply: `${requestedWord}: ${meaning}`,
          suggestions: ASSISTANT_SUGGESTIONS,
          action: {
            type: "save_vocabulary",
            word: requestedWord,
            meaning,
          },
        } satisfies AssistantResponsePayload;
      }
    } catch (error) {
      console.error("Assistant word lookup error:", error);
    }

    return {
      reply: "I can look up and save new words when GROQ_API_KEY is configured. Your task and saved-word questions still work right now.",
      suggestions: ASSISTANT_SUGGESTIONS,
    } satisfies AssistantResponsePayload;
  }

  try {
    const conversationalReply = await buildConversationalAssistantReply(message, tasks, vocabulary, history);
    if (conversationalReply) {
      return conversationalReply;
    }
  } catch (error) {
    console.error("Assistant chat error:", error);
  }

  return {
    reply: "I can help with your DailyFlow tasks and saved vocabulary, but I could not generate a full assistant reply right now. Try asking about your schedule, free time, missed tasks, or a word meaning.",
    suggestions: ASSISTANT_SUGGESTIONS,
  } satisfies AssistantResponsePayload;
}

function getPasswordResetRetryAfterSeconds(email: string) {
  const nextAllowedAt = passwordResetCooldowns.get(email);
  if (!nextAllowedAt) {
    return 0;
  }

  const retryAfterMs = nextAllowedAt - Date.now();
  if (retryAfterMs <= 0) {
    passwordResetCooldowns.delete(email);
    return 0;
  }

  return Math.ceil(retryAfterMs / 1000);
}

function markPasswordResetCooldown(email: string) {
  passwordResetCooldowns.set(email, Date.now() + RESET_REQUEST_COOLDOWN_SECONDS * 1000);
}

function createMailTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM_EMAIL) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function buildResetPasswordUrl(token: string) {
  const url = new URL(APP_BASE_URL);
  url.searchParams.set("mode", "reset-password");
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendResetPasswordEmail(email: string, token: string) {
  const resetUrl = buildResetPasswordUrl(token);
  const subject = "Reset your DailyFlow password";
  const text = [
    "You requested a password reset for DailyFlow.",
    "",
    `Open this link to reset your password: ${resetUrl}`,
    "",
    `If the link does not open the reset screen automatically, use this token: ${token}`,
    `This token expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">Reset your DailyFlow password</h2>
      <p>You requested a password reset for DailyFlow.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 18px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 10px;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, open this URL:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If needed, you can also paste this reset token manually:</p>
      <p style="font-family: monospace; font-size: 14px; background: #f3f4f6; padding: 10px 12px; border-radius: 8px;">${token}</p>
      <p>This token expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  if (EMAIL_PROVIDER === "resend") {
    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
      throw new Error(
        "Resend is not configured. Set EMAIL_PROVIDER=resend, RESEND_API_KEY, and RESEND_FROM_EMAIL in .env.",
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `"${RESEND_FROM_NAME}" <${RESEND_FROM_EMAIL}>`,
        to: [email],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend email failed: ${response.status} ${errorText}`);
    }

    return;
  }

  const transporter = createMailTransport();

  if (!transporter) {
    throw new Error(
      "Email is not configured. Use SMTP settings, or set EMAIL_PROVIDER=resend with RESEND_API_KEY and RESEND_FROM_EMAIL in .env.",
    );
  }

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
    to: email,
    subject,
    text,
    html,
  });
}

function isMongoConnectivityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    error.message.includes("ENOTFOUND") ||
    error.message.includes("ReplicaSetNoPrimary") ||
    error.message.includes("buffering timed out")
  );
}

function getOperationalErrorMessage(error: unknown) {
  if (!isMongoConnectivityError(error)) {
    return null;
  }

  return "MongoDB is currently unreachable. Check your internet connection, DNS, Atlas cluster status, and MONGODB_URI.";
}

function logOperationalError(context: string, error: unknown) {
  const operationalMessage = getOperationalErrorMessage(error);

  if (operationalMessage) {
    console.error(`${context}: ${operationalMessage}`);
    return;
  }

  console.error(`${context}:`, error);
}

function getAllowedOrigins() {
  return [FRONTEND_URL, APP_BASE_URL]
    .filter(Boolean)
    .map((value) => value!.replace(/\/+$/, ""));
}

function sendOperationalError(
  res: Response,
  error: unknown,
  fallbackMessage = "Internal server error",
) {
  const operationalMessage = getOperationalErrorMessage(error);

  if (operationalMessage) {
    return res.status(503).json({ error: operationalMessage });
  }

  return res.status(500).json({ error: fallbackMessage });
}

async function startServer() {
  const useMongo = await connectToMongo();
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }

    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });

  app.use(express.json());

  const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!token) {
      res.sendStatus(401);
      return;
    }

    try {
      req.user = jwt.verify(token, JWT_SECRET) as JwtUser;
      next();
    } catch {
      res.sendStatus(403);
    }
  };

  const repository = {
    async findUserByEmail(email: string) {
      if (useMongo) {
        const user = await User.findOne({ email }).lean();
        return user
          ? {
              id: toId(user._id),
              email: user.email,
              password: user.password,
              name: user.name,
              resetToken: user.resetToken,
              resetTokenExpiry: user.resetTokenExpiry,
              isVerified: Boolean(user.isVerified),
              verificationToken: user.verificationToken,
            }
          : null;
      }

      return [...memoryUsers.values()].find((user) => user.email === email) || null;
    },

    async createUser(input: Pick<UserRecord, "email" | "password" | "name" | "verificationToken">) {
      if (useMongo) {
        const user = await User.create({
          email: input.email,
          password: input.password,
          name: input.name,
          verificationToken: input.verificationToken,
        });

        return {
          id: toId(user._id),
          email: user.email,
          password: user.password,
          name: user.name,
          resetToken: user.resetToken,
          resetTokenExpiry: user.resetTokenExpiry,
          isVerified: Boolean(user.isVerified),
          verificationToken: user.verificationToken,
        } satisfies UserRecord;
      }

      const user: UserRecord = {
        id: crypto.randomUUID(),
        email: input.email,
        password: input.password,
        name: input.name,
        verificationToken: input.verificationToken,
        isVerified: false,
      };
      memoryUsers.set(user.id, user);
      return user;
    },

    async updateUser(user: UserRecord) {
      if (useMongo) {
        await User.updateOne(
          { _id: user.id },
          {
            password: user.password,
            resetToken: user.resetToken,
            resetTokenExpiry: user.resetTokenExpiry,
            verificationToken: user.verificationToken,
            isVerified: user.isVerified,
          },
        );
        return;
      }

      memoryUsers.set(user.id, user);
    },

    async findUserByResetToken(token: string) {
      if (useMongo) {
        const user = await User.findOne({
          resetToken: token,
          resetTokenExpiry: { $gt: new Date() },
        }).lean();

        return user
          ? {
              id: toId(user._id),
              email: user.email,
              password: user.password,
              name: user.name,
              resetToken: user.resetToken,
              resetTokenExpiry: user.resetTokenExpiry,
              isVerified: Boolean(user.isVerified),
              verificationToken: user.verificationToken,
            }
          : null;
      }

      const now = Date.now();
      return (
        [...memoryUsers.values()].find(
          (user) =>
            user.resetToken === token &&
            user.resetTokenExpiry instanceof Date &&
            user.resetTokenExpiry.getTime() > now,
        ) || null
      );
    },

    async getTasks(userId: string) {
      if (useMongo) {
        const tasks = await Task.find({ userId }).lean();
        return tasks.map((task) => ({
          id: toId(task._id),
          userId: toId(task.userId),
          categoryId: task.categoryId ? toId(task.categoryId) : undefined,
          title: task.title,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          seriesId: task.seriesId,
          repeatDays: normalizeRepeatDays(task.repeatDays),
          completed: Boolean(task.completed),
          createdAt: task.createdAt ?? new Date(),
        }));
      }

      return [...memoryTasks.values()].filter((task) => task.userId === userId);
    },

    async createTask(input: Omit<TaskRecord, "id" | "createdAt">) {
      if (useMongo) {
        const task = await Task.create(input);
        return {
          id: toId(task._id),
          userId: toId(task.userId),
          categoryId: task.categoryId ? toId(task.categoryId) : undefined,
          title: task.title,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          seriesId: task.seriesId,
          repeatDays: normalizeRepeatDays(task.repeatDays),
          completed: Boolean(task.completed),
          createdAt: task.createdAt ?? new Date(),
        } satisfies TaskRecord;
      }

      const task: TaskRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...input,
      };
      memoryTasks.set(task.id, task);
      return task;
    },

    async createTasks(inputs: Array<Omit<TaskRecord, "id" | "createdAt">>) {
      if (inputs.length === 0) {
        return [];
      }

      if (useMongo) {
        const tasks = await Task.insertMany(inputs);
        return tasks.map((task) => ({
          id: toId(task._id),
          userId: toId(task.userId),
          categoryId: task.categoryId ? toId(task.categoryId) : undefined,
          title: task.title,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          seriesId: task.seriesId,
          repeatDays: normalizeRepeatDays(task.repeatDays),
          completed: Boolean(task.completed),
          createdAt: task.createdAt ?? new Date(),
        })) satisfies TaskRecord[];
      }

      const createdTasks = inputs.map((input) => {
        const task: TaskRecord = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          ...input,
        };
        memoryTasks.set(task.id, task);
        return task;
      });

      return createdTasks;
    },

    async updateTask(id: string, userId: string, updates: Partial<TaskRecord>) {
      if (useMongo) {
        const task = await Task.findOneAndUpdate(
          { _id: id, userId },
          updates,
          { returnDocument: "after" },
        ).lean();
        return task
          ? {
              id: toId(task._id),
              userId: toId(task.userId),
              categoryId: task.categoryId ? toId(task.categoryId) : undefined,
              title: task.title,
              date: task.date,
              startTime: task.startTime,
              endTime: task.endTime,
              seriesId: task.seriesId,
              repeatDays: normalizeRepeatDays(task.repeatDays),
              completed: Boolean(task.completed),
              createdAt: task.createdAt ?? new Date(),
            }
          : null;
      }

      const existing = memoryTasks.get(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const updated: TaskRecord = {
        ...existing,
        ...updates,
        id: existing.id,
        userId: existing.userId,
      };
      memoryTasks.set(id, updated);
      return updated;
    },

    async findTask(id: string, userId: string) {
      if (useMongo) {
        const task = await Task.findOne({ _id: id, userId }).lean();
        return task
          ? {
              id: toId(task._id),
              userId: toId(task.userId),
              categoryId: task.categoryId ? toId(task.categoryId) : undefined,
              title: task.title,
              date: task.date,
              startTime: task.startTime,
              endTime: task.endTime,
              seriesId: task.seriesId,
              repeatDays: normalizeRepeatDays(task.repeatDays),
              completed: Boolean(task.completed),
              createdAt: task.createdAt ?? new Date(),
            }
          : null;
      }

      const existing = memoryTasks.get(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      return existing;
    },

    async deleteTask(id: string, userId: string) {
      if (useMongo) {
        const result = await Task.deleteOne({ _id: id, userId });
        return result.deletedCount > 0;
      }

      const existing = memoryTasks.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }

      memoryTasks.delete(id);
      return true;
    },

    async deleteTaskSeries(seriesId: string, userId: string) {
      if (useMongo) {
        const result = await Task.deleteMany({ userId, seriesId });
        return result.deletedCount;
      }

      let deletedCount = 0;
      for (const [id, task] of memoryTasks.entries()) {
        if (task.userId === userId && task.seriesId === seriesId) {
          memoryTasks.delete(id);
          deletedCount += 1;
        }
      }

      return deletedCount;
    },

    async getCategories(userId: string) {
      if (useMongo) {
        const categories = await Category.find({ userId }).lean();
        return categories.map((category) => ({
          id: toId(category._id),
          userId: toId(category.userId),
          name: category.name,
          color: category.color,
          icon: category.icon,
          createdAt: category.createdAt ?? new Date(),
        }));
      }

      return [...memoryCategories.values()].filter((category) => category.userId === userId);
    },

    async createCategory(input: Omit<CategoryRecord, "id" | "createdAt">) {
      if (useMongo) {
        const category = await Category.create(input);
        return {
          id: toId(category._id),
          userId: toId(category.userId),
          name: category.name,
          color: category.color,
          icon: category.icon,
          createdAt: category.createdAt ?? new Date(),
        } satisfies CategoryRecord;
      }

      const category: CategoryRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...input,
      };
      memoryCategories.set(category.id, category);
      return category;
    },

    async updateCategory(id: string, userId: string, updates: Partial<CategoryRecord>) {
      if (useMongo) {
        const category = await Category.findOneAndUpdate({ _id: id, userId }, updates, {
          returnDocument: "after",
        }).lean();

        return category
          ? {
              id: toId(category._id),
              userId: toId(category.userId),
              name: category.name,
              color: category.color,
              icon: category.icon,
              createdAt: category.createdAt ?? new Date(),
            }
          : null;
      }

      const existing = memoryCategories.get(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const updated: CategoryRecord = {
        ...existing,
        ...updates,
        id: existing.id,
        userId: existing.userId,
      };
      memoryCategories.set(id, updated);
      return updated;
    },

    async deleteCategory(id: string, userId: string) {
      if (useMongo) {
        const result = await Category.deleteOne({ _id: id, userId });
        return result.deletedCount > 0;
      }

      const existing = memoryCategories.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }

      memoryCategories.delete(id);
      return true;
    },

    async getHabits(userId: string, month?: string) {
      if (useMongo) {
        const query: Record<string, unknown> = { userId };
        if (month) {
          query.month = month;
        }

        const habits = await Habit.find(query).sort({ createdAt: 1 }).lean();
        return habits.map((habit) => ({
          id: toId(habit._id),
          userId: toId(habit.userId),
          month: habit.month,
          name: habit.name,
          targetDays: Number(habit.targetDays),
          createdAt: habit.createdAt ?? new Date(),
          updatedAt: habit.updatedAt ?? habit.createdAt ?? new Date(),
        })) satisfies HabitRecord[];
      }

      return [...memoryHabits.values()]
        .filter((habit) => habit.userId === userId && (!month || habit.month === month))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    },

    async createHabit(input: Omit<HabitRecord, "id" | "createdAt" | "updatedAt">) {
      if (useMongo) {
        const now = new Date();
        const habit = await Habit.create({
          ...input,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id: toId(habit._id),
          userId: toId(habit.userId),
          month: habit.month,
          name: habit.name,
          targetDays: Number(habit.targetDays),
          createdAt: habit.createdAt ?? now,
          updatedAt: habit.updatedAt ?? now,
        } satisfies HabitRecord;
      }

      const now = new Date();
      const habit: HabitRecord = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      memoryHabits.set(habit.id, habit);
      return habit;
    },

    async updateHabit(id: string, userId: string, updates: Partial<HabitRecord>) {
      if (useMongo) {
        const now = new Date();
        const habit = await Habit.findOneAndUpdate(
          { _id: id, userId },
          { ...updates, updatedAt: now },
          { returnDocument: "after" },
        ).lean();

        return habit
          ? {
              id: toId(habit._id),
              userId: toId(habit.userId),
              month: habit.month,
              name: habit.name,
              targetDays: Number(habit.targetDays),
              createdAt: habit.createdAt ?? now,
              updatedAt: habit.updatedAt ?? now,
            }
          : null;
      }

      const existing = memoryHabits.get(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const updated: HabitRecord = {
        ...existing,
        ...updates,
        id: existing.id,
        userId: existing.userId,
        updatedAt: new Date(),
      };
      memoryHabits.set(id, updated);
      return updated;
    },

    async findHabit(id: string, userId: string) {
      if (useMongo) {
        const habit = await Habit.findOne({ _id: id, userId }).lean();
        return habit
          ? {
              id: toId(habit._id),
              userId: toId(habit.userId),
              month: habit.month,
              name: habit.name,
              targetDays: Number(habit.targetDays),
              createdAt: habit.createdAt ?? new Date(),
              updatedAt: habit.updatedAt ?? habit.createdAt ?? new Date(),
            }
          : null;
      }

      const existing = memoryHabits.get(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      return existing;
    },

    async copyHabitsFromMonth(userId: string, fromMonth: string, toMonth: string) {
      const sourceHabits = await this.getHabits(userId, fromMonth);
      if (sourceHabits.length === 0) {
        return [];
      }

      const existingTargetHabits = await this.getHabits(userId, toMonth);
      if (existingTargetHabits.length > 0) {
        return existingTargetHabits;
      }

      const inputs = sourceHabits.map((habit) => ({
        userId,
        month: toMonth,
        name: habit.name,
        targetDays: habit.targetDays,
      }));

      if (useMongo) {
        const now = new Date();
        const createdHabits = await Habit.insertMany(
          inputs.map((input) => ({
            ...input,
            createdAt: now,
            updatedAt: now,
          })),
        );

        return createdHabits.map((habit) => ({
          id: toId(habit._id),
          userId: toId(habit.userId),
          month: habit.month,
          name: habit.name,
          targetDays: Number(habit.targetDays),
          createdAt: habit.createdAt ?? now,
          updatedAt: habit.updatedAt ?? now,
        })) satisfies HabitRecord[];
      }

      const now = new Date();
      const createdHabits = inputs.map((input) => {
        const habit: HabitRecord = {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...input,
        };
        memoryHabits.set(habit.id, habit);
        return habit;
      });

      return createdHabits;
    },

    async deleteHabit(id: string, userId: string) {
      if (useMongo) {
        const result = await Habit.deleteOne({ _id: id, userId });
        if (result.deletedCount > 0) {
          await HabitEntry.deleteMany({ userId, habitId: id });
        }
        return result.deletedCount > 0;
      }

      const existing = memoryHabits.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }

      memoryHabits.delete(id);
      for (const [entryId, entry] of memoryHabitEntries.entries()) {
        if (entry.userId === userId && entry.habitId === id) {
          memoryHabitEntries.delete(entryId);
        }
      }
      return true;
    },

    async getHabitEntries(userId: string, month?: string) {
      if (useMongo) {
        const query: Record<string, unknown> = { userId };
        if (month) {
          query.date = { $regex: `^${month}-` };
        }

        const entries = await HabitEntry.find(query).lean();
        return entries.map((entry) => ({
          id: toId(entry._id),
          userId: toId(entry.userId),
          habitId: toId(entry.habitId),
          date: entry.date,
          completed: Boolean(entry.completed),
          createdAt: entry.createdAt ?? new Date(),
          updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date(),
        })) satisfies HabitEntryRecord[];
      }

      return [...memoryHabitEntries.values()].filter(
        (entry) => entry.userId === userId && (!month || entry.date.startsWith(`${month}-`)),
      );
    },

    async setHabitEntry(input: Omit<HabitEntryRecord, "id" | "createdAt" | "updatedAt">) {
      if (useMongo) {
        const now = new Date();
        const entry = await HabitEntry.findOneAndUpdate(
          { userId: input.userId, habitId: input.habitId, date: input.date },
          {
            $set: {
              completed: input.completed,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: input.userId,
              habitId: input.habitId,
              date: input.date,
              createdAt: now,
            },
          },
          { upsert: true, returnDocument: "after" },
        ).lean();

        return {
          id: toId(entry!._id),
          userId: toId(entry!.userId),
          habitId: toId(entry!.habitId),
          date: entry!.date,
          completed: Boolean(entry!.completed),
          createdAt: entry!.createdAt ?? now,
          updatedAt: entry!.updatedAt ?? now,
        } satisfies HabitEntryRecord;
      }

      const existing = [...memoryHabitEntries.values()].find(
        (entry) => entry.userId === input.userId && entry.habitId === input.habitId && entry.date === input.date,
      );
      const now = new Date();

      if (existing) {
        const updated: HabitEntryRecord = {
          ...existing,
          completed: input.completed,
          updatedAt: now,
        };
        memoryHabitEntries.set(existing.id, updated);
        return updated;
      }

      const entry: HabitEntryRecord = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      memoryHabitEntries.set(entry.id, entry);
      return entry;
    },

    async getHabitPalette(userId: string, month: string) {
      if (useMongo) {
        const palette = await HabitPalette.findOne({ userId, month }).lean();
        return palette
          ? {
              id: toId(palette._id),
              userId: toId(palette.userId),
              month: palette.month,
              colors: palette.colors,
              createdAt: palette.createdAt ?? new Date(),
              updatedAt: palette.updatedAt ?? palette.createdAt ?? new Date(),
            }
          : null;
      }

      return [...memoryHabitPalettes.values()].find(
        (palette) => palette.userId === userId && palette.month === month,
      ) || null;
    },

    async upsertHabitPalette(input: Omit<HabitPaletteRecord, "id" | "createdAt" | "updatedAt">) {
      if (useMongo) {
        const now = new Date();
        const palette = await HabitPalette.findOneAndUpdate(
          { userId: input.userId, month: input.month },
          {
            $set: {
              colors: input.colors,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: input.userId,
              month: input.month,
              createdAt: now,
            },
          },
          { upsert: true, returnDocument: "after" },
        ).lean();

        return {
          id: toId(palette!._id),
          userId: toId(palette!.userId),
          month: palette!.month,
          colors: palette!.colors,
          createdAt: palette!.createdAt ?? now,
          updatedAt: palette!.updatedAt ?? now,
        } satisfies HabitPaletteRecord;
      }

      const existing = [...memoryHabitPalettes.values()].find(
        (palette) => palette.userId === input.userId && palette.month === input.month,
      );
      const now = new Date();

      if (existing) {
        const updated: HabitPaletteRecord = {
          ...existing,
          colors: input.colors,
          updatedAt: now,
        };
        memoryHabitPalettes.set(existing.id, updated);
        return updated;
      }

      const palette: HabitPaletteRecord = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      memoryHabitPalettes.set(palette.id, palette);
      return palette;
    },

    async getVocabulary(userId: string) {
      if (useMongo) {
        const words = await Vocabulary.find({ userId }).lean();
        return words.map((entry) => ({
          id: toId(entry._id),
          userId: toId(entry.userId),
          word: entry.word,
          meaning: entry.meaning,
          createdAt: entry.createdAt ?? new Date(),
        })) satisfies VocabularyRecord[];
      }

      return [...memoryVocabulary.values()].filter((entry) => entry.userId === userId);
    },

    async createVocabulary(input: Omit<VocabularyRecord, "id" | "createdAt">) {
      if (useMongo) {
        const entry = await Vocabulary.create(input);
        return {
          id: toId(entry._id),
          userId: toId(entry.userId),
          word: entry.word,
          meaning: entry.meaning,
          createdAt: entry.createdAt ?? new Date(),
        } satisfies VocabularyRecord;
      }

      const entry: VocabularyRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...input,
      };
      memoryVocabulary.set(entry.id, entry);
      return entry;
    },

    async deleteVocabulary(id: string, userId: string) {
      if (useMongo) {
        const result = await Vocabulary.deleteOne({ _id: id, userId });
        return result.deletedCount > 0;
      }

      const existing = memoryVocabulary.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }

      memoryVocabulary.delete(id);
      return true;
    },

    async getVocabularyChallengeDates(userId: string) {
      if (useMongo) {
        const entries = await VocabularyChallenge.find({ userId }).lean();
        return entries.map((entry) => entry.date);
      }

      return [...memoryVocabularyChallenges.values()]
        .filter((entry) => entry.userId === userId)
        .map((entry) => entry.date);
    },

    async completeVocabularyChallenge(userId: string, date: string) {
      if (useMongo) {
        await VocabularyChallenge.updateOne(
          { userId, date },
          { $setOnInsert: { userId, date, createdAt: new Date() } },
          { upsert: true },
        );
        return;
      }

      const existing = [...memoryVocabularyChallenges.values()].find(
        (entry) => entry.userId === userId && entry.date === date,
      );

      if (existing) {
        return;
      }

      const entry: VocabularyChallengeRecord = {
        id: crypto.randomUUID(),
        userId,
        date,
        createdAt: new Date(),
      };
      memoryVocabularyChallenges.set(entry.id, entry);
    },
  };

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body ?? {};

      if (!isNonEmptyString(email) || !isNonEmptyString(password) || !isNonEmptyString(name)) {
        return sendBadRequest(res, "Name, email, and password are required");
      }

      const existingUser = await repository.findUserByEmail(email.trim().toLowerCase());
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const newUser = await repository.createUser({
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        name: name.trim(),
        verificationToken,
      });

      console.log(`Verification token for ${newUser.email}: ${verificationToken}`);

      const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET);
      return res.json({ token, user: serializeUser(newUser) });
    } catch (error) {
      logOperationalError("Signup error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};

      if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        return sendBadRequest(res, "Email and password are required");
      }

      const user = await repository.findUserByEmail(email.trim().toLowerCase());
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
      return res.json({ token, user: serializeUser(user) });
    } catch (error) {
      logOperationalError("Login error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body ?? {};

      if (!isNonEmptyString(email)) {
        return sendBadRequest(res, "Email is required");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const retryAfterSeconds = getPasswordResetRetryAfterSeconds(normalizedEmail);
      if (retryAfterSeconds > 0) {
        return res.status(429).json({
          error: `Please wait ${retryAfterSeconds} seconds before requesting another reset email.`,
          retryAfterSeconds,
        });
      }

      const user = await repository.findUserByEmail(normalizedEmail);
      if (!user) {
        markPasswordResetCooldown(normalizedEmail);
        return res.json({
          message: "If that email exists, a reset link has been sent.",
          retryAfterSeconds: RESET_REQUEST_COOLDOWN_SECONDS,
        });
      }

      user.resetToken = crypto.randomBytes(32).toString("hex");
      user.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
      await repository.updateUser(user);
      await sendResetPasswordEmail(user.email, user.resetToken);
      markPasswordResetCooldown(normalizedEmail);

      return res.json({
        message: "If that email exists, a reset link has been sent.",
        retryAfterSeconds: RESET_REQUEST_COOLDOWN_SECONDS,
      });
    } catch (error) {
      logOperationalError("Forgot password error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/auth/reset-password-with-token", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body ?? {};

      if (!isNonEmptyString(token) || !isNonEmptyString(newPassword)) {
        return sendBadRequest(res, "Token and new password are required");
      }

      const user = await repository.findUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await repository.updateUser(user);

      return res.json({ message: "Password reset successfully" });
    } catch (error) {
      logOperationalError("Reset password error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tasks = await repository.getTasks(req.user!.id);
      return res.json(tasks);
    } catch (error) {
      logOperationalError("Get tasks error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, date, categoryId, startTime, endTime, completed, repeatDays } = req.body ?? {};

      if (!isNonEmptyString(title) || !isNonEmptyString(date)) {
        return sendBadRequest(res, "Title and date are required");
      }

      const normalizedDate = date.trim();
      const normalizedRepeatDays = normalizeRepeatDays(repeatDays);
      const scheduledDates = buildRecurringDates(normalizedDate, normalizedRepeatDays);

      if (!scheduledDates) {
        return sendBadRequest(res, "Date must be a valid YYYY-MM-DD value");
      }

      const seriesId = normalizedRepeatDays.length > 0 ? crypto.randomUUID() : undefined;
      const taskInputs = scheduledDates.map((scheduledDate) => ({
        userId: req.user!.id,
        categoryId: isNonEmptyString(categoryId) ? categoryId : undefined,
        title: title.trim(),
        date: scheduledDate,
        startTime: isNonEmptyString(startTime) ? startTime : undefined,
        endTime: isNonEmptyString(endTime) ? endTime : undefined,
        seriesId,
        repeatDays: normalizedRepeatDays,
        completed: Boolean(completed),
      }));

      if (taskInputs.length === 1) {
        const task = await repository.createTask(taskInputs[0]);
        return res.json(task);
      }

      const tasks = await repository.createTasks(taskInputs);
      return res.json(tasks);
    } catch (error) {
      logOperationalError("Create task error", error);
      return sendOperationalError(res, error);
    }
  });

  app.put("/api/tasks/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates: Partial<TaskRecord> = {};
      const { title, date, categoryId, startTime, endTime, completed } = req.body ?? {};

      if (title !== undefined) {
        if (!isNonEmptyString(title)) {
          return sendBadRequest(res, "Title must be a non-empty string");
        }
        updates.title = title.trim();
      }

      if (date !== undefined) {
        if (!isNonEmptyString(date)) {
          return sendBadRequest(res, "Date must be a non-empty string");
        }
        updates.date = date.trim();
      }

      if (categoryId !== undefined) {
        updates.categoryId = isNonEmptyString(categoryId) ? categoryId : undefined;
      }

      if (startTime !== undefined) {
        updates.startTime = isNonEmptyString(startTime) ? startTime : undefined;
      }

      if (endTime !== undefined) {
        updates.endTime = isNonEmptyString(endTime) ? endTime : undefined;
      }

      if (completed !== undefined) {
        updates.completed = Boolean(completed);
      }

      const task = await repository.updateTask(req.params.id, req.user!.id, updates);
      if (!task) {
        return res.sendStatus(404);
      }

      return res.json(task);
    } catch (error) {
      logOperationalError("Update task error", error);
      return sendOperationalError(res, error);
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = req.query.scope === "series" ? "series" : "single";
      const task = await repository.findTask(req.params.id, req.user!.id);

      if (!task) {
        return res.sendStatus(404);
      }

      if (scope === "series" && task.seriesId) {
        const deletedCount = await repository.deleteTaskSeries(task.seriesId, req.user!.id);
        if (deletedCount === 0) {
          return res.sendStatus(404);
        }

        return res.status(200).json({ deletedIds: [], deletedCount, scope: "series", seriesId: task.seriesId });
      }

      const deleted = await repository.deleteTask(req.params.id, req.user!.id);
      if (!deleted) {
        return res.sendStatus(404);
      }

      return res.status(200).json({ deletedIds: [req.params.id], deletedCount: 1, scope: "single" });
    } catch (error) {
      logOperationalError("Delete task error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/vocabulary", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const words = await repository.getVocabulary(req.user!.id);
      return res.json(words);
    } catch (error) {
      logOperationalError("Get vocabulary error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/vocabulary", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { word, meaning } = req.body ?? {};

      if (!isNonEmptyString(word) || !isNonEmptyString(meaning)) {
        return sendBadRequest(res, "Word and meaning are required");
      }

      const normalizedWord = word.trim();
      const existingWords = await repository.getVocabulary(req.user!.id);
      const alreadyExists = existingWords.some(
        (entry) => entry.word.trim().toLowerCase() === normalizedWord.toLowerCase(),
      );

      if (alreadyExists) {
        return res.status(400).json({ error: "This vocabulary word already exists" });
      }

      const entry = await repository.createVocabulary({
        userId: req.user!.id,
        word: normalizedWord,
        meaning: meaning.trim(),
      });

      return res.json(entry);
    } catch (error) {
      logOperationalError("Create vocabulary error", error);
      return sendOperationalError(res, error);
    }
  });

  app.delete("/api/vocabulary/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const deleted = await repository.deleteVocabulary(req.params.id, req.user!.id);
      if (!deleted) {
        return res.sendStatus(404);
      }

      return res.sendStatus(204);
    } catch (error) {
      logOperationalError("Delete vocabulary error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/vocabulary/challenge", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const dates = await repository.getVocabularyChallengeDates(req.user!.id);
      return res.json(buildChallengeStats(dates));
    } catch (error) {
      logOperationalError("Get vocabulary challenge stats error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/vocabulary/challenge/complete", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedDate = req.body?.date;
      const date = isNonEmptyString(requestedDate) ? requestedDate.trim() : getTodayUtcDateString();

      if (!parseIsoDateToUtc(date)) {
        return sendBadRequest(res, "Date must be a valid YYYY-MM-DD value");
      }

      await repository.completeVocabularyChallenge(req.user!.id, date);
      const dates = await repository.getVocabularyChallengeDates(req.user!.id);
      return res.json(buildChallengeStats(dates));
    } catch (error) {
      logOperationalError("Complete vocabulary challenge error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/habits", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const month = normalizeHabitMonth(req.query.month);
      if (req.query.month !== undefined && !month) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      const habits = await repository.getHabits(req.user!.id, month ?? undefined);
      return res.json(habits);
    } catch (error) {
      logOperationalError("Get habits error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/habits", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, targetDays, month } = req.body ?? {};
      const parsedTargetDays = Number(targetDays);
      const normalizedMonth = normalizeHabitMonth(month);

      if (!isNonEmptyString(name)) {
        return sendBadRequest(res, "Habit name is required");
      }

      if (!normalizedMonth) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      const maxTargetDays = getDaysInHabitMonth(normalizedMonth);
      if (maxTargetDays === null) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      if (!Number.isInteger(parsedTargetDays) || parsedTargetDays < 0 || parsedTargetDays > maxTargetDays) {
        return sendBadRequest(res, `Target days must be an integer between 0 and ${maxTargetDays}`);
      }

      const habit = await repository.createHabit({
        userId: req.user!.id,
        month: normalizedMonth,
        name: name.trim(),
        targetDays: parsedTargetDays,
      });

      return res.json(habit);
    } catch (error) {
      logOperationalError("Create habit error", error);
      return sendOperationalError(res, error);
    }
  });

  app.put("/api/habits/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates: Partial<HabitRecord> = {};
      const { name, targetDays } = req.body ?? {};
      const existingHabit = await repository.findHabit(req.params.id, req.user!.id);

      if (!existingHabit) {
        return res.sendStatus(404);
      }

      if (name !== undefined) {
        if (!isNonEmptyString(name)) {
          return sendBadRequest(res, "Habit name must be a non-empty string");
        }
        updates.name = name.trim();
      }

      if (targetDays !== undefined) {
        const parsedTargetDays = Number(targetDays);
        const maxTargetDays = getDaysInHabitMonth(existingHabit.month);
        if (maxTargetDays === null) {
          return sendBadRequest(res, "Habit month is invalid");
        }

        if (!Number.isInteger(parsedTargetDays) || parsedTargetDays < 0 || parsedTargetDays > maxTargetDays) {
          return sendBadRequest(res, `Target days must be an integer between 0 and ${maxTargetDays}`);
        }
        updates.targetDays = parsedTargetDays;
      }

      const habit = await repository.updateHabit(req.params.id, req.user!.id, updates);
      return res.json(habit);
    } catch (error) {
      logOperationalError("Update habit error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/habits/copy-from-month", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const fromMonth = normalizeHabitMonth(req.body?.fromMonth);
      const toMonth = normalizeHabitMonth(req.body?.toMonth);

      if (!fromMonth || !toMonth) {
        return sendBadRequest(res, "Both fromMonth and toMonth must be valid YYYY-MM values");
      }

      const habits = await repository.copyHabitsFromMonth(req.user!.id, fromMonth, toMonth);
      return res.json(habits);
    } catch (error) {
      logOperationalError("Copy habits from month error", error);
      return sendOperationalError(res, error);
    }
  });

  app.delete("/api/habits/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const deleted = await repository.deleteHabit(req.params.id, req.user!.id);
      if (!deleted) {
        return res.sendStatus(404);
      }

      return res.sendStatus(204);
    } catch (error) {
      logOperationalError("Delete habit error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/habit-entries", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const month = normalizeHabitMonth(req.query.month);
      if (req.query.month !== undefined && !month) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      const entries = await repository.getHabitEntries(req.user!.id, month ?? undefined);
      return res.json(entries);
    } catch (error) {
      logOperationalError("Get habit entries error", error);
      return sendOperationalError(res, error);
    }
  });

  app.put("/api/habit-entries", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { habitId, date, completed } = req.body ?? {};

      if (!isNonEmptyString(habitId) || !isNonEmptyString(date)) {
        return sendBadRequest(res, "Habit id and date are required");
      }

      if (!parseIsoDateToUtc(date.trim())) {
        return sendBadRequest(res, "Date must be a valid YYYY-MM-DD value");
      }

      const entry = await repository.setHabitEntry({
        userId: req.user!.id,
        habitId: habitId.trim(),
        date: date.trim(),
        completed: Boolean(completed),
      });

      return res.json(entry);
    } catch (error) {
      logOperationalError("Set habit entry error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/habit-palettes/:month", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const month = normalizeHabitMonth(req.params.month);
      if (!month) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      const palette = await repository.getHabitPalette(req.user!.id, month);
      return res.json(palette ?? { month, colors: [] });
    } catch (error) {
      logOperationalError("Get habit palette error", error);
      return sendOperationalError(res, error);
    }
  });

  app.put("/api/habit-palettes/:month", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const month = normalizeHabitMonth(req.params.month);
      const colors = normalizeHabitPaletteColors(req.body?.colors);

      if (!month) {
        return sendBadRequest(res, "Month must be a valid YYYY-MM value");
      }

      if (!colors) {
        return sendBadRequest(res, "Colors must contain exactly 3 valid hex values");
      }

      const palette = await repository.upsertHabitPalette({
        userId: req.user!.id,
        month,
        colors,
      });

      return res.json(palette);
    } catch (error) {
      logOperationalError("Update habit palette error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/assistant/chat", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { message, history } = req.body ?? {};

      if (!isNonEmptyString(message)) {
        return sendBadRequest(res, "Message is required");
      }

      const parsedHistory: AssistantHistoryMessage[] = Array.isArray(history)
        ? history
            .filter((entry): entry is { role?: unknown; text?: unknown } => typeof entry === "object" && entry !== null)
            .map((entry) => ({
              role: entry.role === "assistant" ? "assistant" : "user",
              text: typeof entry.text === "string" ? entry.text.trim() : "",
            }))
            .filter((entry) => entry.text.length > 0)
            .slice(-6)
        : [];

      const [tasks, vocabulary] = await Promise.all([
        repository.getTasks(req.user!.id),
        repository.getVocabulary(req.user!.id),
      ]);

      const reply = await buildAssistantReply(message.trim(), tasks, vocabulary, parsedHistory);
      return res.json(reply);
    } catch (error) {
      logOperationalError("Assistant chat error", error);
      return sendOperationalError(res, error);
    }
  });

  app.get("/api/categories", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const categories = await repository.getCategories(req.user!.id);
      return res.json(categories);
    } catch (error) {
      logOperationalError("Get categories error", error);
      return sendOperationalError(res, error);
    }
  });

  app.post("/api/categories", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, color, icon } = req.body ?? {};

      if (!isNonEmptyString(name) || !isNonEmptyString(color) || !isNonEmptyString(icon)) {
        return sendBadRequest(res, "Name, color, and icon are required");
      }

      const category = await repository.createCategory({
        userId: req.user!.id,
        name: name.trim(),
        color: color.trim(),
        icon: icon.trim(),
      });

      return res.json(category);
    } catch (error) {
      logOperationalError("Create category error", error);
      return sendOperationalError(res, error);
    }
  });

  app.put("/api/categories/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates: Partial<CategoryRecord> = {};
      const { name, color, icon } = req.body ?? {};

      if (name !== undefined) {
        if (!isNonEmptyString(name)) {
          return sendBadRequest(res, "Name must be a non-empty string");
        }
        updates.name = name.trim();
      }

      if (color !== undefined) {
        if (!isNonEmptyString(color)) {
          return sendBadRequest(res, "Color must be a non-empty string");
        }
        updates.color = color.trim();
      }

      if (icon !== undefined) {
        if (!isNonEmptyString(icon)) {
          return sendBadRequest(res, "Icon must be a non-empty string");
        }
        updates.icon = icon.trim();
      }

      const category = await repository.updateCategory(req.params.id, req.user!.id, updates);
      if (!category) {
        return res.sendStatus(404);
      }

      return res.json(category);
    } catch (error) {
      logOperationalError("Update category error", error);
      return sendOperationalError(res, error);
    }
  });

  app.delete("/api/categories/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const deleted = await repository.deleteCategory(req.params.id, req.user!.id);
      if (!deleted) {
        return res.sendStatus(404);
      }

      return res.sendStatus(204);
    } catch (error) {
      logOperationalError("Delete category error", error);
      return sendOperationalError(res, error);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
