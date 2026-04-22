import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquare, Send, Sparkles, BookPlus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { apiUrl } from './lib/api';

const INITIAL_SUGGESTIONS = [
  'What does my day look like tomorrow?',
  'Do I have any unfinished tasks?',
  'Show my recent saved words',
];

function createAssistantMessage(text, extra = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    text,
    suggestions: INITIAL_SUGGESTIONS,
    action: null,
    ...extra,
  };
}

export default function TaskAssistant() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState(() => [
    createAssistantMessage(
      'Ask me naturally about your day, tasks, or saved words. I can also explain a word and help you save it.',
      { suggestions: [] },
    ),
  ]);
  const containerRef = useRef(null);
  const hasUserMessages = messages.some((message) => message.role === 'user');

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages, isOpen]);

  const sendMessage = async (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed || !token || isLoading) return;

    const history = messages.slice(-6).map((message) => ({
      role: message.role,
      text: message.text,
    }));

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-user`,
        role: 'user',
        text: trimmed,
      },
    ]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/api/assistant/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get assistant reply');
      }

      setMessages((prev) => [
        ...prev,
        createAssistantMessage(data.reply, {
          suggestions: Array.isArray(data.suggestions) && data.suggestions.length > 0 ? data.suggestions : INITIAL_SUGGESTIONS,
          action: data.action || null,
        }),
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        createAssistantMessage('I could not answer that right now. Please try again in a moment.'),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWord = async (messageId, action) => {
    if (!token || !action || action.type !== 'save_vocabulary') return;

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              action: {
                ...message.action,
                saving: true,
              },
            }
          : message,
      ),
    );

    try {
      const response = await fetch(apiUrl('/api/vocabulary'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          word: action.word,
          meaning: action.meaning,
        }),
      });

      if (response.status === 204) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  action: {
                    ...message.action,
                    saving: false,
                    saved: true,
                  },
                }
              : message,
          ),
        );
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save word');
      }

      setMessages((prev) => [
        ...prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                action: {
                  ...message.action,
                  saving: false,
                  saved: true,
                },
              }
            : message,
        ),
        createAssistantMessage(`Saved "${action.word}" to your vocabulary list.`),
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                action: {
                  ...message.action,
                  saving: false,
                  saved: false,
                },
              }
            : message,
        ),
        createAssistantMessage(error instanceof Error ? error.message : 'Failed to save the word.'),
      ]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-24 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-2xl transition-transform hover:scale-[1.03] dark:bg-white dark:text-black md:bottom-6 md:right-6"
        title="Open Task Assistant"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.section
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-40 right-4 z-[69] flex h-[min(72vh,640px)] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:bottom-24 md:right-6"
          >
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-950 to-gray-800 px-4 py-4 text-white dark:border-zinc-800 dark:from-zinc-100 dark:to-zinc-300 dark:text-black">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 backdrop-blur dark:bg-black/10">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-white/70 dark:text-black/60">Nexi</p>
                  <p className="mt-1 text-xs text-white/80 dark:text-black/70">
                    Your copilot for schedules, tasks, and vocabulary.
                  </p>
                </div>
              </div>
            </div>

            <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto bg-gray-50/80 px-3 py-4 dark:bg-zinc-950/70">
              {!hasUserMessages && (
                <div className="rounded-[26px] border border-gray-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">
                    <Sparkles className="h-3.5 w-3.5" />
                    Try asking
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {INITIAL_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => sendMessage(suggestion)}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-700 transition-colors hover:border-gray-300 hover:bg-white hover:text-gray-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm ${
                      message.role === 'user'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'border border-gray-100 bg-white text-gray-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm leading-6">{message.text}</p>

                    {message.action?.type === 'save_vocabulary' && (
                      <button
                        type="button"
                        disabled={message.action.saving || message.action.saved}
                        onClick={() => saveWord(message.id, message.action)}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-black px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {message.action.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
                        {message.action.saved ? 'Saved' : 'Save Word'}
                      </button>
                    )}

                    {message.role === 'assistant' && Array.isArray(message.suggestions) && message.suggestions.length > 0 && message.id === messages[messages.length - 1]?.id && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.suggestions.slice(0, 3).map((suggestion) => (
                          <button
                            key={`${message.id}-${suggestion}`}
                            type="button"
                            onClick={() => sendMessage(suggestion)}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-bold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-3xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking about your DailyFlow data...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(input);
              }}
              className="border-t border-gray-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-zinc-500">
                <Sparkles className="h-3.5 w-3.5" />
          
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask something like “What should I focus on today?” or “Incentive means?”"
                  className="min-h-[56px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  title="Send message"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
