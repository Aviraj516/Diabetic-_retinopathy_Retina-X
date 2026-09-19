import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Shield,
  Stethoscope,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Lock,
  Mail,
  Phone,
  User,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserAccount, UserRole } from '../types';

export const AdminUsersPage: React.FC = () => {
  const { users, addUser, toggleUserStatus, deleteUser, refreshUsers, currentRole, currentUser, t } = useApp();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Synchronize users from database when viewing Admin Users page
  useEffect(() => {
    refreshUsers();
  }, []);

  // Delete user state
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pageAlert, setPageAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // New user form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('nurse');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentRole !== 'admin') {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-800">Access Denied</p>
        <p className="text-xs text-slate-500 mt-1">Only system administrators can access User Management.</p>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim()) {
      setError('Please provide full name and email / user ID');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (users.some((u) => u.email.toLowerCase() === trimmedEmail)) {
      setError('A user account with this email / user ID already exists');
      return;
    }

    const userPassword = password.trim() || 'password';
    if (userPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    let title = 'Primary Healthcare Worker';
    if (role === 'admin') title = 'Hospital System Administrator';
    if (role === 'specialist') title = 'Consultant Ophthalmologist';

    setIsSubmitting(true);
    try {
      const result = await addUser({
        name: fullName.trim(),
        email: trimmedEmail,
        phone: phone.trim() || '+91 98200 00000',
        role: role,
        title: title,
        password: userPassword,
      });

      if (result.success) {
        setSuccessMessage(`User account for ${fullName.trim()} created successfully!`);
        setTimeout(() => {
          setSuccessMessage(null);
          setIsAddModalOpen(false);
          setFullName('');
          setEmail('');
          setPhone('');
          setPassword('');
          setRole('nurse');
        }, 1200);
      } else {
        setError(result.error || 'Failed to create user.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while creating user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    if (
      currentUser &&
      (currentUser.id?.toLowerCase() === userToDelete.id?.toLowerCase() ||
        currentUser.email?.toLowerCase() === userToDelete.email?.toLowerCase())
    ) {
      setDeleteError('You cannot delete your own account.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteUser(userToDelete.id);
      if (res.success) {
        const successMsg = res.message || `User ${userToDelete.name} deleted successfully.`;
        setPageAlert({
          type: 'success',
          message: successMsg,
        });
        setUserToDelete(null);
        await refreshUsers();
        setTimeout(() => {
          setPageAlert(null);
        }, 4000);
      } else {
        setDeleteError(res.error || 'Failed to delete user.');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'An unexpected error occurred while deleting user.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-600" />
            <span>{t.roleAdmin}</span>
          </span>
        );
      case 'specialist':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Stethoscope className="w-3 h-3 text-indigo-600" />
            <span>{t.roleSpecialist}</span>
          </span>
        );
      case 'nurse':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck className="w-3 h-3 text-blue-600" />
            <span>{t.roleNurse}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{t.userManagement}</span>
            <Shield className="w-5 h-5 text-purple-600" />
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.userManagementDesc}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E60D5] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addNewUser}</span>
        </button>
      </div>

      {/* Page Alert Banner */}
      {pageAlert && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold animate-in fade-in duration-150 ${
            pageAlert.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {pageAlert.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{pageAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageAlert(null)}
            className="text-slate-400 hover:text-slate-600 ml-4 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">{t.role}:</span>
          {(['all', 'admin', 'nurse', 'specialist'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                roleFilter === r
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r === 'all' ? t.allStatus : r === 'admin' ? t.roleAdmin : r === 'specialist' ? t.roleSpecialist : t.roleNurse}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">{t.name}</th>
                <th className="px-6 py-3.5">{t.userIdEmail}</th>
                <th className="px-6 py-3.5">{t.role}</th>
                <th className="px-6 py-3.5">{t.phone}</th>
                <th className="px-6 py-3.5">{t.status}</th>
                <th className="px-6 py-3.5">{t.dateAdded}</th>
                <th className="px-6 py-3.5 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                        {u.avatarLetter || u.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{u.name}</span>
                        <span className="text-[11px] text-slate-400">{u.title}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-xs font-mono text-slate-600">{u.email}</td>
                  <td className="px-6 py-3.5">{getRoleBadge(u.role)}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">{u.phone || '—'}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        u.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {u.status === 'Active' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-600" />
                      )}
                      <span>{u.status === 'Active' ? t.active : t.inactive}</span>
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">{u.createdAt}</td>
                  <td className="px-6 py-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleUserStatus(u.id)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                        u.status === 'Active'
                          ? 'text-amber-600 hover:bg-amber-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {u.status === 'Active' ? t.deactivate : t.activate}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const isSelf =
                          currentUser &&
                          (currentUser.id?.toLowerCase() === u.id?.toLowerCase() ||
                            currentUser.email?.toLowerCase() === u.email?.toLowerCase());

                        if (isSelf) {
                          setPageAlert({
                            type: 'error',
                            message: 'You cannot delete your own account.',
                          });
                          return;
                        }

                        setPageAlert(null);
                        setDeleteError(null);
                        setUserToDelete(u);
                      }}
                      className="text-xs font-semibold px-2.5 py-1 rounded text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title={t.deleteUser}
                    >
                      {t.deleteUser}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD NEW USER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">{t.addNewUser}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold">
                ✓ {successMessage}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.fullName}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sister Ananya Roy"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.userIdEmail}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ananya@retinax.demo"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.phone}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98200 44004"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.role}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { r: 'nurse', label: t.roleNurse },
                      { r: 'specialist', label: t.roleSpecialist },
                      { r: 'admin', label: t.roleAdmin },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.r}
                      type="button"
                      onClick={() => setRole(item.r)}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        role === item.r
                          ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank for default: 'password'"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#1E60D5] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors"
                >
                  {isSubmitting ? 'Creating...' : t.savePatient}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE USER MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t.deleteUser}?</h3>
                  <p className="text-xs text-slate-500">{t.permanentDeletion}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete this user and their associated RETINA-X data. This action cannot be undone.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-xs font-bold text-slate-800">{userToDelete.name}</div>
              <div className="text-xs text-slate-500">{userToDelete.email}</div>
              <div className="text-xs text-slate-400 capitalize">{t.role}: {userToDelete.role}</div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id="cancel-delete-user-btn"
                disabled={isDeleting}
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                id="confirm-delete-user-btn"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <span>{t.deleteUser}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
