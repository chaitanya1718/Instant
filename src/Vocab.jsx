import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Flame, Plus, Search, Sparkles, Trash2, Trophy, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';
import { apiUrl } from './lib/api';

const PAGE_SIZE = 5;

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }

  return next;
}

function normalizeText(value) {
  return value.trim().toLowerCase();
}

export default function Vocab() {
  const { token } = useAuth();
  const [vocabulary, setVocabulary] = useState([]);
  const [challengeStats, setChallengeStats] = useState({
    completedDates: [],
    totalDaysCompleted: 0,
    currentStreak: 0,
    todayCompleted: false,
  });
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [saveError, setSaveError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [challengeQuestions, setChallengeQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [score, setScore] = useState(0);
  const [challengeFinished, setChallengeFinished] = useState(false);
  const [recordingChallenge, setRecordingChallenge] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState(null);

  const fetchVocabulary = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(apiUrl('/api/vocabulary'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setVocabulary(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setVocabulary([]);
    }
  }, [token]);

  const fetchChallengeStats = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(apiUrl('/api/vocabulary/challenge'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setChallengeStats(data);
    } catch (error) {
      console.error(error);
    }
  }, [token]);

  useEffect(() => {
    fetchVocabulary();
    fetchChallengeStats();
  }, [fetchVocabulary, fetchChallengeStats]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, vocabulary.length]);

  const sortedVocabulary = useMemo(
    () => [...vocabulary].sort((a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' })),
    [vocabulary],
  );

  const filteredVocabulary = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) return sortedVocabulary;

    return sortedVocabulary.filter((entry) =>
      normalizeText(entry.word).includes(query) || normalizeText(entry.meaning).includes(query),
    );
  }, [searchTerm, sortedVocabulary]);

  const totalPages = Math.max(1, Math.ceil(filteredVocabulary.length / PAGE_SIZE));
  const pageStartIndex = (page - 1) * PAGE_SIZE;
  const pagedVocabulary = filteredVocabulary.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const currentQuestion = challengeQuestions[currentQuestionIndex] ?? null;

  const buildChallengeQuestions = useCallback(() => {
    if (sortedVocabulary.length < 3) {
      return [];
    }

    return shuffle(sortedVocabulary)
      .slice(0, 3)
      .map((entry) => {
        const distractors = shuffle(
          sortedVocabulary
            .filter((candidate) => candidate.id !== entry.id)
            .map((candidate) => candidate.meaning),
        )
          .filter((candidateMeaning, index, allMeanings) => allMeanings.indexOf(candidateMeaning) === index)
          .slice(0, 3);

        return {
          id: entry.id,
          word: entry.word,
          correctMeaning: entry.meaning,
          options: shuffle([entry.meaning, ...distractors]),
        };
      });
  }, [sortedVocabulary]);

  const startChallenge = () => {
    const nextQuestions = buildChallengeQuestions();
    if (nextQuestions.length < 3) return;

    setChallengeQuestions(nextQuestions);
    setCurrentQuestionIndex(0);
    setSelectedOption('');
    setScore(0);
    setChallengeFinished(false);
    setActiveFeedback(null);
  };

  const saveVocabulary = async (event) => {
    event.preventDefault();
    if (!token || !word.trim() || !meaning.trim()) return;

    setSaveError('');

    try {
      const response = await fetch(apiUrl('/api/vocabulary'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ word, meaning }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save vocabulary');
      }

      setVocabulary((prev) => [...prev, data]);
      setWord('');
      setMeaning('');
    } catch (error) {
      console.error(error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save vocabulary');
    }
  };

  const deleteVocabulary = async (id) => {
    if (!token) return;

    try {
      const response = await fetch(apiUrl(`/api/vocabulary/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete vocabulary');
      }

      setVocabulary((prev) => prev.filter((entry) => entry.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const completeChallenge = useCallback(async () => {
    if (!token || challengeStats.todayCompleted) return;

    setRecordingChallenge(true);

    try {
      const response = await fetch(apiUrl('/api/vocabulary/challenge/complete'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (response.ok) {
        setChallengeStats(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setRecordingChallenge(false);
    }
  }, [challengeStats.todayCompleted, token]);

  const submitAnswer = async () => {
    if (!currentQuestion || !selectedOption) return;

    const isCorrect = selectedOption === currentQuestion.correctMeaning;
    const nextScore = isCorrect ? score + 1 : score;

    setActiveFeedback({
      isCorrect,
      correctMeaning: currentQuestion.correctMeaning,
    });

    if (currentQuestionIndex === challengeQuestions.length - 1) {
      setScore(nextScore);
      setChallengeFinished(true);
      await completeChallenge();
      return;
    }

    window.setTimeout(() => {
      setScore(nextScore);
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption('');
      setActiveFeedback(null);
    }, 500);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 pb-12 space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <BookOpen className="w-3.5 h-3.5" />
            Word Vault
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-zinc-100">Vocabulary Challenge</h1>
          <p className="max-w-2xl text-sm text-gray-500 dark:text-zinc-500">
            Save useful words, review them in dictionary order, and take a quick daily challenge to keep the streak alive.
          </p>
        </div>
      </header>

      <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Daily Challenge</p>
            <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Take challenge</h2>
          </div>

          <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-3xl bg-gray-50 p-4 dark:bg-zinc-800/70">
          <p className="text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            The challenge picks 3 saved words and asks you to match each one with the right meaning.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/70">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-orange-50 p-3 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Streak</p>
                <p className="text-2xl font-black text-gray-900 dark:text-zinc-100">{challengeStats.currentStreak}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/70">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Days Taken</p>
                <p className="text-2xl font-black text-gray-900 dark:text-zinc-100">{challengeStats.totalDaysCompleted}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <motion.button
            type="button"
            onClick={startChallenge}
            disabled={sortedVocabulary.length < 3}
            animate={sortedVocabulary.length >= 3 ? { scale: [1, 1.03, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
            transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 text-sm font-black text-white shadow-[0_12px_30px_rgba(17,24,39,0.22)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:shadow-[0_12px_30px_rgba(255,255,255,0.12)]"
          >
            <Sparkles className="w-4 h-4" />
            Take Challenge
          </motion.button>

          <div className="flex flex-wrap gap-2">
            {challengeStats.todayCompleted ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Today&apos;s challenge completed
              </div>
            ) : null}

            {sortedVocabulary.length < 3 ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                Add 3 words to unlock
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="order-2 space-y-6 xl:order-1">
          <form
            onSubmit={saveVocabulary}
            className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Add Vocabulary</p>
                <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">Save a new word</h2>
              </div>
              <div className="rounded-2xl bg-gray-100 p-3 text-gray-700 dark:bg-zinc-800 dark:text-zinc-200">
                <Plus className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={word}
                onChange={(event) => setWord(event.target.value)}
                placeholder="Word"
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
              />
              <input
                type="text"
                value={meaning}
                onChange={(event) => setMeaning(event.target.value)}
                placeholder="Meaning"
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-black dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-white"
              />
            </div>

            {saveError ? <p className="text-sm font-bold text-red-500">{saveError}</p> : null}

            <button
              type="submit"
              disabled={!word.trim() || !meaning.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
            >
              <Plus className="w-4 h-4" />
              Save Word
            </button>
          </form>

          <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Dictionary View</p>
                <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">Saved words</h2>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
                <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search word or meaning"
                  className="w-full min-w-[180px] bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="space-y-3">
              {pagedVocabulary.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-200 px-4 py-12 text-center text-sm font-medium text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
                  {filteredVocabulary.length === 0 && vocabulary.length > 0 ? 'No words match this search.' : 'No vocabulary saved yet.'}
                </div>
              ) : (
                pagedVocabulary.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-4 rounded-3xl border border-gray-100 bg-gray-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-800/70"
                  >
                    <div className="min-w-0">
                      <p className="text-lg font-black text-gray-900 dark:text-zinc-100">{entry.word}</p>
                      <p className="text-sm text-gray-500 dark:text-zinc-400">{entry.meaning}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteVocabulary(entry.id)}
                      className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                Page {Math.min(page, totalPages)} of {totalPages}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="rounded-2xl border border-gray-100 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="rounded-2xl border border-gray-100 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 space-y-6 xl:order-2">
          <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 min-h-[360px]">
            {challengeQuestions.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col justify-center space-y-5">
                <div className="rounded-3xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm font-medium text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
                  Challenge questions will appear here after you start the daily round.
                </div>
              </div>
            ) : challengeFinished ? (
              <div className="flex h-full min-h-[300px] flex-col justify-center space-y-5 text-center">
                <div className="mx-auto rounded-3xl bg-emerald-50 p-4 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Trophy className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">Challenge Complete</p>
                  <h3 className="mt-2 text-3xl font-black text-gray-900 dark:text-zinc-100">{score}/{challengeQuestions.length}</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                    {recordingChallenge ? 'Saving today\'s challenge progress...' : 'Your streak has been updated if this was your first challenge today.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startChallenge}
                  className="mx-auto inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
                >
                  <Sparkles className="w-4 h-4" />
                  Try Another Round
                </button>
              </div>
            ) : currentQuestion ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                    Question {currentQuestionIndex + 1} of {challengeQuestions.length}
                  </p>
                  <p className="text-sm font-black text-gray-900 dark:text-zinc-100">Score: {score}</p>
                </div>

                <div className="rounded-3xl bg-gray-50 p-5 dark:bg-zinc-800/70">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Choose the correct meaning</p>
                  <h3 className="mt-3 text-3xl font-black tracking-tight text-gray-900 dark:text-zinc-100">{currentQuestion.word}</h3>
                </div>

                <div className="space-y-3">
                  {currentQuestion.options.map((option) => {
                    const isSelected = selectedOption === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSelectedOption(option)}
                        className={`w-full rounded-3xl border px-4 py-4 text-left text-sm font-bold transition-all ${
                          isSelected
                            ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                            : 'border-gray-100 bg-white text-gray-700 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {activeFeedback ? (
                    <motion.div
                      key={activeFeedback.correctMeaning}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className={`rounded-3xl px-4 py-3 text-sm font-bold ${
                        activeFeedback.isCorrect
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {activeFeedback.isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {activeFeedback.isCorrect ? 'Correct answer.' : `Correct answer: ${activeFeedback.correctMeaning}`}
                      </span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={!selectedOption || Boolean(activeFeedback)}
                  className="w-full rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {currentQuestionIndex === challengeQuestions.length - 1 ? 'Finish Challenge' : 'Next Question'}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
