import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Minimize2,
  Trash2,
  Info,
  User,
  CheckCircle2,
  Mic,
  MicOff,
  Volume2,
  Loader2,
  FileText,
  Globe,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { askTrinay, transcribeSpeech, synthesizeSpeech } from '../services/mlService';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'trinay';
  timestamp: string;
  sources?: string[];
  audioB64?: string | null;
}

export const AiChatbotDrawer: React.FC = () => {
  const { t, currentUser, activeCase } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [isRecording, setIsRecording] = useState(false);
  const [audioPlayingId, setAudioPlayingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

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

  const playAudioB64 = (b64Data: string, msgId: string) => {
    try {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      const audio = new Audio(`data:audio/wav;base64,${b64Data}`);
      audioElementRef.current = audio;
      setAudioPlayingId(msgId);
      audio.onended = () => setAudioPlayingId(null);
      audio.onerror = () => setAudioPlayingId(null);
      audio.play();
    } catch (e) {
      console.error('Audio playback error:', e);
      setAudioPlayingId(null);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, customQuery?: string, speak: boolean = true) => {
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
      const resp = await askTrinay(query, activeCase, selectedLanguage, speak);

      const trinayMsg: ChatMessage = {
        id: `trinay-${Date.now()}`,
        text: resp.answer,
        sender: 'trinay',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: resp.sources,
        audioB64: resp.audio_b64,
      };

      setMessages((prev) => [...prev, trinayMsg]);

      if (resp.audio_b64) {
        playAudioB64(resp.audio_b64, trinayMsg.id);
      }
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

  const startVoiceRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 0) {
          setLoading(true);
          try {
            const transcribedText = await transcribeSpeech(audioBlob, selectedLanguage);
            if (transcribedText) {
              await handleSendMessage(undefined, transcribedText, true);
            }
          } catch (err) {
            console.error('STT Error:', err);
          } finally {
            setLoading(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
            className="group relative flex items-center gap-2.5 px-4 py-3 bg-[#0D1829] hover:bg-[#15253e] text-white rounded-full shadow-xl hover:shadow-2xl border border-slate-700/60 transition-all duration-200 focus:outline-hidden focus:ring-3 focus:ring-blue-500/40"
            aria-label={t.aiAssistant}
          >
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white shadow-xs group-hover:scale-105 transition-transform">
              <Bot className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-[#0D1829]" />
              </span>
            </div>
            <div className="flex flex-col items-start pr-1">
              <span className="text-xs font-semibold tracking-wide text-slate-100 flex items-center gap-1.5">
                TRINAY AI Voice RAG
                <Sparkles className="w-3 h-3 text-blue-400" />
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {activeCase ? 'Current Case Active ✓' : 'Local Medical RAG Ready'}
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
          <header className="px-4 py-3 bg-[#0D1829] text-white flex items-center justify-between border-b border-slate-800 shadow-xs select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-xs shrink-0">
                <Bot className="w-4.5 h-4.5" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0D1829]" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2
                  id="chatbot-heading"
                  className="text-xs font-bold text-slate-100 flex items-center gap-1.5 truncate"
                >
                  TRINAY AI Assistant
                  <span className="px-1.5 py-0.2 rounded-sm text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Local RAG
                  </span>
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span className="truncate">
                    {activeCase ? 'Using Active Screening Image Case' : 'Retinal Knowledge Base Loaded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions & Language Selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-slate-800 text-slate-200 text-[11px] rounded-md border border-slate-700 px-2 py-1 focus:outline-none"
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
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Clear Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Active Case Context Bar */}
          {activeCase && (
            <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between text-[11px] text-blue-900 font-medium">
              <div className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  Case Loaded: <strong>{activeCase.severity?.drSeverity || activeCase.quality?.quality || 'Retinal Image'}</strong>
                </span>
              </div>
              <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full shrink-0">
                Active Context
              </span>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50/60 space-y-3 text-sm">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-slate-800">Ask TRINAY about this image or screening case</h3>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    TRINAY combines local ChromaDB medical guidelines with your actual image outputs. Speak or type below!
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
                      className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 hover:border-blue-300 text-slate-700 rounded-full transition-colors"
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
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                    {msg.sender === 'user' ? (
                      <>
                        <User className="w-3 h-3 text-slate-400" />
                        <span>You ({currentUser?.name?.split(' ')[0] || 'User'})</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-blue-600" />
                        <span className="text-blue-700 font-semibold">TRINAY Assistant</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs break-words ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-xs'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs space-y-2'
                    }`}
                  >
                    <div>{msg.text}</div>

                    {msg.sender === 'trinay' && (
                      <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                        {msg.audioB64 ? (
                          <button
                            type="button"
                            onClick={() => playAudioB64(msg.audioB64!, msg.id)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold"
                          >
                            <Volume2 className={`w-3.5 h-3.5 ${audioPlayingId === msg.id ? 'animate-bounce text-emerald-600' : ''}`} />
                            <span>{audioPlayingId === msg.id ? 'Playing Voice...' : 'Listen Answer'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Medical RAG Context
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 shadow-xs">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span>TRINAY is processing query with local case & RAG...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message & Voice Input Footer */}
          <footer className="p-3 bg-white border-t border-slate-200">
            <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2">
              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                className={`p-2.5 rounded-xl transition-all shadow-xs ${
                  isRecording
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
                title={isRecording ? 'Stop Recording' : 'Speak to TRINAY (Voice STT)'}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={isRecording ? 'Listening to speech...' : 'Ask TRINAY about this image...'}
                disabled={loading || isRecording}
                className="flex-1 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || loading || isRecording}
                className="flex items-center justify-center p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-xs transition-colors shrink-0"
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
