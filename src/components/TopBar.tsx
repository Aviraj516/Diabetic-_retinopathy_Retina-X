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
  Plus,
  User,
  CheckCircle2,
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
    setIsAddPatientModalOpen,
    setActivePage,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');

  const currentLangObj = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActivePage('patients');
    }
  };

  const displayName = currentUser?.name
    ? currentUser.name.toLowerCase() === 'avi' || currentUser.name.includes('Arvind') || currentUser.name.includes('Kulkarni')
      ? 'Dr. Aviraj Murkute'
      : currentUser.name.startsWith('Dr.')
      ? currentUser.name
      : `Dr. ${currentUser.name.charAt(0).toUpperCase() + currentUser.name.slice(1)}`
    : 'Dr. Aviraj Murkute';

  const displayTitle =
    currentUser?.title &&
    !currentUser.title.toLowerCase().includes('primary healthcare') &&
    !currentUser.title.toLowerCase().includes('optometrist')
      ? currentUser.title
      : currentRole === 'admin'
      ? 'System Administrator'
      : 'Ophthalmologist';

  const initials =
    displayName
      ? displayName
          .replace(/^Dr\.\s*/i, '')
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : 'AM';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-[68px] px-4 md:px-7 bg-white border-b border-slate-300 shadow-xs">
      {/* Left side: Mobile menu toggle + TRINAY branding */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Open sidebar"
          className="p-2 -ml-1 text-slate-600 rounded-lg md:hidden hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          onClick={() => setActivePage('dashboard')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className="w-12 h-12 rounded-full bg-[#0284C7] flex items-center justify-center p-2.5 text-white shadow-xs shrink-0 group-hover:bg-sky-700 transition-colors">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[21px] font-black tracking-tight text-[#0F172A] leading-tight">
              TRINAY
            </span>
            <span className="text-[12px] font-bold text-slate-400 tracking-wider uppercase leading-none mt-0.5">
              MEDICAL HEALTH SYSTEM
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Patient Search Bar */}
      <div className="flex-1 max-w-lg mx-4 lg:mx-8 hidden sm:block">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient by name, Phone or Patient ID..."
            className="w-full pl-9.5 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 bg-[#F8FAFC] border border-slate-200/90 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]/20 focus:border-[#0284C7] focus:bg-white transition-all font-normal"
          />
        </form>
      </div>

      {/* Right controls: Language, Notification Bell, Doctor Profile, Logout */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        {/* Language Selector Pill */}
        <button
          type="button"
          onClick={() => setIsLanguageModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          title="Select Language"
        >
          <span>{currentLangObj.name}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Notification Bell with red indicator badge */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
        >
          <Bell className="w-5 h-5 text-slate-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
        </button>

        {/* Doctor Profile Info */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#0284C7] text-white font-bold text-xs shrink-0 shadow-2xs">
            {initials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-sm font-bold text-[#0F172A] leading-tight">
              {displayName}
            </span>
            <span className="text-[11px] text-slate-400 font-medium leading-tight mt-0.5">
              {displayTitle}
            </span>
          </div>
        </div>

        {/* Dedicated Logout Action Button */}
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/50 hover:bg-rose-100 hover:text-rose-700 border border-rose-200 rounded-xl transition-colors cursor-pointer ml-1"
          title="Logout"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-500" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

