import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Minimize2,
  Trash2,
  User,
  CheckCircle2,
  Loader2,
  FileText,
  Activity,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { askTrinay } from '../services/mlService';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'trinay';
  timestamp: string;
  sources?: string[];
}

export const AiChatbotDrawer: React.FC = () => {
  const { t, currentUser, activeCase } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll message container
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isMinimized]);

  const handleSendMessage = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const query = customQuery || inputMessage.trim();
    if (!query || loading) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      text: query,
      sender: 'user',
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customQuery) setInputMessage('');
    setLoading(true);

    try {
      const resp = await askTrinay(query, activeCase, selectedLanguage);

      const trinayMsg: ChatMessage = {
        id: `trinay-${Date.now()}`,
        text: resp.answer,
        sender: 'trinay',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: resp.sources,
      };

      setMessages((prev) => [...prev, trinayMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        text: `TRINAY Error: ${err.message || 'Could not connect to local AI RAG backend.'}`,
        sender: 'trinay',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-6 right-6 z-40 animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            id="retina-ai-chat-trigger"
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="group relative flex items-center gap-3 px-4.5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-xl hover:shadow-2xl border border-slate-700/70 transition-all duration-200 focus:outline-hidden focus:ring-3 focus:ring-sky-500/40"
            aria-label={t.aiAssistant}
          >
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[#0284C7] text-white shadow-xs group-hover:scale-105 transition-transform">
              <Bot className="w-4.5 h-4.5" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-slate-900" />
              </span>
            </div>
            <div className="flex flex-col items-start pr-1">
              <span className="text-xs font-bold tracking-wide text-white flex items-center gap-1.5">
                TRINAY AI Assistant
                <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {activeCase ? 'Active Case Context Attached' : 'Ophthalmic Knowledge RAG Ready'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Floating Chat Panel */}
      {isOpen && !isMinimized && (
        <div
          id="retina-ai-chat-panel"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[440px] h-[620px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-labelledby="chatbot-heading"
        >
          {/* Header */}
          <header className="px-4.5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shadow-xs select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex items-center justify-center w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-[#0284C7] to-sky-700 text-white shadow-xs shrink-0">
                <Bot className="w-5 h-5" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2
                  id="chatbot-heading"
                  className="text-xs font-bold text-white flex items-center gap-1.5 truncate"
                >
                    TRINAY AI RAG
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                    Ophthalmic AI
                  </span>
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 inline-block" />
                  <span className="truncate">
                    {activeCase ? 'Screening Evidence Context Loaded' : 'Clinical Knowledge Loaded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions & Language Selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-slate-800 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-700 px-2 py-1 focus:outline-hidden focus:border-sky-500"
              >
                <option value="English">English</option>
                <option value="Hindi">हिंदी (Hindi)</option>
                <option value="Marathi">मराठी (Marathi)</option>
                <option value="Telugu">తెలుగు (Telugu)</option>
              </select>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Clear Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Active Case Context Bar */}
          {activeCase && (
            <div className="px-3.5 py-2 bg-sky-50/90 border-b border-sky-100 flex items-center justify-between text-[11px] text-sky-900 font-medium">
              <div className="flex items-center gap-2 truncate">
                <Activity className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                <span className="truncate">
                  Active Case: <strong className="text-slate-900">{activeCase.severity?.drSeverity || activeCase.quality?.quality || 'Retinal Scan'}</strong>
                </span>
              </div>
              <span className="text-[10px] text-sky-700 font-semibold bg-sky-100/90 px-2 py-0.5 rounded-full shrink-0 border border-sky-200">
                Live Evidence
              </span>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50/70 space-y-3 text-xs">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-3.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 text-[#0284C7] border border-sky-100 flex items-center justify-center shadow-xs">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-slate-900">Ask TRINAY About Diagnostics & Evidence</h3>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    TRINAY answers queries using local ophthalmic guideline embeddings and your active case predictions.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap gap-1.5 justify-center max-w-xs mx-auto">
                  {[
                    'What does this image show?',
                    'Explain the DR severity result',
                    'Are there exudates or hemorrhages?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSendMessage(undefined, q)}
                      className="px-3 py-1.5 text-[11px] font-medium bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-700 hover:text-sky-800 rounded-full transition-all shadow-2xs cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium px-1">
                    {msg.sender === 'user' ? (
                      <>
                        <User className="w-3 h-3 text-slate-400" />
                        <span>You ({currentUser?.name?.split(' ')[0] || 'Clinician'})</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-[#0284C7]" />
                        <span className="text-sky-700 font-bold">TRINAY Assistant</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[88%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-2xs break-words ${
                      msg.sender === 'user'
                        ? 'bg-[#0284C7] text-white rounded-tr-xs font-medium'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs space-y-2'
                    }`}
                  >
                    <div>{msg.text}</div>

                    {msg.sender === 'trinay' && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-400 flex items-center gap-1 font-medium">
                          <FileText className="w-3 h-3" /> Clinical Knowledge Base
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center gap-2.5 p-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 shadow-xs">
                <Loader2 className="w-4 h-4 text-[#0284C7] animate-spin shrink-0" />
                <span className="font-medium">TRINAY is synthesizing clinical inference...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

            {/* Message Input Footer */}
            <footer className="p-3 bg-white border-t border-slate-200">
              <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask TRINAY about this case..."
                  disabled={loading}
                  className="flex-1 px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-[#0284C7] transition-colors"
                />

                <button
                  type="submit"
                  disabled={!inputMessage.trim() || loading}
                className="flex items-center justify-center p-2.5 bg-[#0284C7] hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
                title="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </footer>
        </div>
      )}
    </>
  );
};

