import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Globe,
  Bell,
  ChevronDown,
  Menu,
  LogOut,
  Settings,
  Shield,
  UserCheck,
  Stethoscope,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LANGUAGES } from '../data/translations';

interface TopBarProps {
  onToggleMobileSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileSidebar }) => {
  const {
    currentUser,
    currentRole,
    logout,
    language,
    setIsLanguageModalOpen,
    t,
    setActivePage,
  } = useApp();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const currentLangObj = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActivePage('patients');
    }
  };

  const getRoleBadge = () => {
    switch (currentRole) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-600" />
            <span>{t.roleAdmin}</span>
          </span>
        );
      case 'specialist':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Stethoscope className="w-3 h-3 text-indigo-600" />
            <span>{t.roleSpecialist}</span>
          </span>
        );
      case 'nurse':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck className="w-3 h-3 text-blue-600" />
            <span>{t.roleNurse}</span>
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-8 bg-white border-b border-slate-200/90 shadow-2xs">
      {/* Left side: Mobile menu toggle + Global Patient Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Open sidebar"
          className="p-2 -ml-1 text-slate-600 rounded-lg md:hidden hover:bg-slate-100 hover:text-slate-900"
        >
          <Menu className="w-5 h-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
          />
        </form>
      </div>

      {/* Right controls: Language, Notifications, User Profile */}
      <div className="flex items-center gap-2 md:gap-3.5">
        {/* Working Multilingual Selector */}
        <button
          type="button"
          onClick={() => setIsLanguageModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          title="Change language"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">{currentLangObj.name}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {/* Clinical Alert Notification */}
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
          </button>
        </div>

        {/* Vertical divider */}
        <div className="w-px h-6 bg-slate-200" />

        {/* User Profile Area (Role determined strictly by login, NO switch buttons) */}
        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2.5 p-1 text-left rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0D1829] text-white font-semibold text-xs shadow-xs border border-slate-700">
              {currentUser?.avatarLetter || 'U'}
            </div>
            <div className="hidden sm:flex flex-col pr-1">
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {currentUser?.name || 'Staff User'}
              </span>
              <span className="text-[10px] text-slate-500 font-normal leading-tight">
                {currentUser?.title || currentRole}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block" />
          </button>

          {/* Profile Dropdown */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 py-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 animate-in fade-in duration-100">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{currentUser?.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{currentUser?.email}</p>
                <div className="mt-1.5">{getRoleBadge()}</div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('settings');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>{t.settings}</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 text-left transition-colors"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>{t.signOut}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
