import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  UserPlus,
  Mail,
  Shield,
  Trash2,
  Edit2,
  AlertCircle,
  Users,
  Crown,
  FolderPlus,
  UserCog
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { safeLower } from '../utils/stringUtils';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  teamId?: string;
  teamName?: string;
}

interface TeamRecord {
  id: string;
  name: string;
  teamLeaderId?: string;
  teamLeaderName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export default function Team() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentUserRole = localStorage.getItem('userRole') || 'Administrator';
  const currentUserId = localStorage.getItem('userId') || '';

  const isAdministrator = currentUserRole === 'Administrator';
  const isTeamLeader = currentUserRole === 'Team Leader';

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isAdministrator) {
        const [usersData, teamsData] = await Promise.all([
          firestoreService.getUsers(),
          firestoreService.getTeams()
        ]);

        setUsers(usersData as User[]);
        setTeams(teamsData as TeamRecord[]);
      } else if (isTeamLeader) {
        const currentUser = await firestoreService.getUser(currentUserId);

        if (!currentUser?.teamId) {
          setUsers(currentUser ? [currentUser as User] : []);
          setTeams([]);
          setError('Your Team Leader account is not assigned to a team yet.');
        } else {
          const [teamMembers, team] = await Promise.all([
            firestoreService.getUsersByTeam(currentUser.teamId),
            firestoreService.getTeam(currentUser.teamId)
          ]);

          setUsers(teamMembers as User[]);
          setTeams(team ? [team as TeamRecord] : []);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch team data:', err);
      setError(err.message || 'Failed to fetch team data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUserId, currentUserRole]);

  const handleDeleteUser = async (id: string) => {
    if (!isAdministrator) return;

    if (id === currentUserId) {
      alert('You cannot delete your own account while logged in.');
      return;
    }

    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await firestoreService.deleteUser(id);
      await fetchData();
    } catch (err: any) {
      console.error('Delete user error:', err);
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleDeleteTeam = async (team: TeamRecord) => {
    if (!isAdministrator) return;

    if (
      !confirm(
        `Are you sure you want to delete "${team.name}"? Team members will be unassigned from this team, but their user accounts will not be deleted.`
      )
    ) {
      return;
    }

    try {
      await firestoreService.deleteTeam(team.id);
      await fetchData();
    } catch (err: any) {
      console.error('Delete team error:', err);
      alert(err.message || 'Failed to delete team');
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = safeLower(searchQuery);

    return (
      safeLower(user.name).includes(query) ||
      safeLower(user.email).includes(query) ||
      safeLower(user.role).includes(query) ||
      safeLower(user.teamName).includes(query)
    );
  });

  const getRoleBadgeColor = (role: string) => {
    switch (safeLower(role)) {
      case 'admin':
      case 'administrator':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'manager':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'team leader':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'agent':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  if (!isAdministrator && !isTeamLeader) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl text-white">Access Denied</h1>
        <p className="text-slate-400">Only Administrators and Team Leaders can view the team area.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            {isTeamLeader ? 'My Team' : 'Team Management'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isTeamLeader
              ? 'View your team and the agents assigned to you.'
              : "Manage your organization's teams, team leaders, users and access levels."}
          </p>
        </div>

        {isAdministrator && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setEditingTeam(null);
                setIsTeamModalOpen(true);
              }}
              className="shimmer-btn bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 border border-white/10"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Team</span>
            </button>

            <button
              onClick={() => {
                setEditingUser(null);
                setIsModalOpen(true);
              }}
              className="shimmer-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Team Member</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full bg-[#0A0F1C] border border-white/5 rounded-xl p-8 text-center text-slate-500 italic">
            Loading teams...
          </div>
        ) : teams.length > 0 ? (
          teams.map((team) => {
            const members = users.filter((user) => user.teamId === team.id);
            const teamLeader =
              members.find((user) => user.id === team.teamLeaderId) ||
              members.find((user) => user.role === 'Team Leader');

            const agents = members.filter((user) => user.role === 'Agent');

            return (
              <div
                key={team.id}
                className="bg-[#0A0F1C] border border-white/5 rounded-xl p-5 shadow-sm hover:border-white/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white truncate">{team.name}</h2>
                        <p className="text-xs text-slate-500">
                          {agents.length} {agents.length === 1 ? 'Agent' : 'Agents'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isAdministrator && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          setEditingTeam(team);
                          setIsTeamModalOpen(true);
                        }}
                        className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-colors"
                        title="Edit Team"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team)}
                        className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Team Leader
                    </span>
                  </div>

                  {teamLeader ? (
                    <div className="flex items-center space-x-3">
                      <img
                        src={teamLeader.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full border border-white/10 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <p className="text-sm font-medium text-white truncate">{teamLeader.name}</p>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{teamLeader.email}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      No Team Leader assigned
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Members
                  </span>
                  <div className="mt-2 flex -space-x-2">
                    {agents.slice(0, 6).map((agent) => (
                      <img
                        key={agent.id}
                        src={agent.avatar}
                        alt={agent.name}
                        title={agent.name}
                        className="w-8 h-8 rounded-full border-2 border-[#0A0F1C] object-cover"
                      />
                    ))}
                    {agents.length > 6 && (
                      <div className="w-8 h-8 rounded-full border-2 border-[#0A0F1C] bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center font-semibold">
                        +{agents.length - 6}
                      </div>
                    )}
                    {agents.length === 0 && (
                      <span className="text-xs text-slate-500 italic">No agents assigned yet.</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full bg-[#0A0F1C] border border-white/5 rounded-xl p-8 text-center">
            <Users className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500 italic">
              {isTeamLeader ? 'No team assigned to your account.' : 'No teams created yet.'}
            </p>
            {isAdministrator && (
              <button
                onClick={() => {
                  setEditingTeam(null);
                  setIsTeamModalOpen(true);
                }}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Create your first team
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-[#0A0F1C] border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, email, role or team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                    Loading team members...
                  </td>
                </tr>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const isSelf = user.id === currentUserId;

                  return (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={user.avatar}
                            alt=""
                            className="w-9 h-9 rounded-full border border-white/10 object-cover"
                          />
                          <div>
                            <p className="text-sm font-medium text-white">
                              {user.name} {isSelf ? '(You)' : ''}
                            </p>
                            <p className="text-xs text-slate-500">ID: #{user.id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                            user.role
                          )}`}
                        >
                          <Shield className="w-3 h-3 mr-1" />
                          {user.role}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {user.teamName ? (
                          <div className="inline-flex items-center space-x-2 text-sm text-slate-300">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            <span>{user.teamName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Unassigned</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-slate-400">
                          <Mail className="w-3.5 h-3.5 mr-2 text-slate-500" />
                          {user.email}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isAdministrator ? (
                          <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingUser(user);
                                setIsModalOpen(true);
                              }}
                              className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-colors"
                              title="Edit User"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={isSelf}
                              className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isSelf ? 'You cannot delete your own account' : 'Delete User'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end text-xs text-slate-600">
                            <UserCog className="w-3.5 h-3.5 mr-1.5" />
                            View only
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                    No team members found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdministrator && isModalOpen && (
        <UserModal
          user={editingUser}
          currentUserId={currentUserId}
          teams={teams}
          onClose={() => setIsModalOpen(false)}
          onSuccess={async () => {
            setIsModalOpen(false);
            await fetchData();
          }}
        />
      )}

      {isAdministrator && isTeamModalOpen && (
        <TeamModal
          team={editingTeam}
          users={users}
          onClose={() => setIsTeamModalOpen(false)}
          onSuccess={async () => {
            setIsTeamModalOpen(false);
            await fetchData();
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  user,
  currentUserId,
  teams,
  onClose,
  onSuccess
}: {
  user: User | null;
  currentUserId: string;
  teams: TeamRecord[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'Agent',
    avatar: user?.avatar || '',
    teamId: user?.teamId || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditingSelf = !!user && user.id === currentUserId;

  const selectedTeam = teams.find((team) => team.id === formData.teamId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const cleanName = formData.name.trim();
    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanAvatar = formData.avatar.trim();
    const cleanPassword = formData.password;

    if (!cleanName) {
      setError('Full name is required.');
      setIsSubmitting(false);
      return;
    }

    if (!cleanEmail) {
      setError('Email is required.');
      setIsSubmitting(false);
      return;
    }

    if (!user && cleanPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      setIsSubmitting(false);
      return;
    }

    try {
      const teamPayload = {
        teamId: formData.teamId || '',
        teamName: selectedTeam?.name || ''
      };

      if (user) {
        const updatePayload: any = {
          name: cleanName,
          email: cleanEmail,
          role: formData.role,
          avatar: cleanAvatar,
          ...teamPayload
        };

        if (cleanPassword.trim()) {
          updatePayload.password = cleanPassword;
        }

        await firestoreService.updateUser(user.id, updatePayload);
      } else {
        await firestoreService.createUser({
          name: cleanName,
          email: cleanEmail,
          password: cleanPassword,
          role: formData.role,
          avatar: cleanAvatar,
          ...teamPayload
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err?.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSaveLabel = () => {
    if (isSubmitting) return user ? 'Saving...' : 'Creating...';
    return user ? 'Update User' : 'Create User';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-xl font-semibold text-white tracking-tight">
            {user ? 'Edit Team Member' : 'Add Team Member'}
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 flex items-center space-x-3 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isEditingSelf && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-300 text-sm">
              You are editing your own account. Be careful when changing your role or email.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Full Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="jane@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {user ? 'Password (Leave blank to keep current)' : 'Password'}
            </label>
            <input
              type="password"
              required={!user}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="••••••••"
            />
            {!user && <p className="text-xs text-slate-500">Minimum 6 characters.</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
            >
              <option value="Administrator">Administrator</option>
              <option value="Manager">Manager</option>
              <option value="Team Leader">Team Leader</option>
              <option value="Agent">Agent</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Team
            </label>
            <select
              value={formData.teamId}
              onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
            >
              <option value="">Unassigned</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {formData.role === 'Team Leader' && (
              <p className="text-xs text-amber-400">
                Assigning a Team Leader to a team will make this user that team's active Team Leader.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Avatar URL (Optional)
            </label>
            <input
              type="text"
              value={formData.avatar}
              onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="https://i.pravatar.cc/150?u=..."
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="shimmer-btn bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
            >
              {getSaveLabel()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamModal({
  team,
  users,
  onClose,
  onSuccess
}: {
  team: TeamRecord | null;
  users: User[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(team?.name || '');
  const [teamLeaderId, setTeamLeaderId] = useState(team?.teamLeaderId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaderCandidates = users.filter(
    (user) => !['Administrator', 'Manager'].includes(user.role) || user.id === teamLeaderId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();

    if (!cleanName) {
      setError('Team name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (team) {
        await firestoreService.updateTeam(team.id, {
          name: cleanName
        });

        if (teamLeaderId) {
          await firestoreService.setTeamLeader(team.id, teamLeaderId);
        } else {
          await firestoreService.clearTeamLeader(team.id);
        }
      } else {
        const createdTeam = await firestoreService.createTeam({
          name: cleanName
        });

        if (teamLeaderId) {
          await firestoreService.setTeamLeader(createdTeam.id, teamLeaderId);
        }
      }

      onSuccess();
    } catch (err: any) {
      console.error('Team save error:', err);
      setError(err?.message || 'Failed to save team');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A0F1C] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-xl font-semibold text-white tracking-tight">
            {team ? 'Edit Team' : 'Create Team'}
          </h2>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 flex items-center space-x-3 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Team Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              placeholder="Alfa Team"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Team Leader
            </label>
            <select
              value={teamLeaderId}
              onChange={(e) => setTeamLeaderId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
            >
              <option value="">No Team Leader</option>
              {leaderCandidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {user.role}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              The selected user will automatically receive the Team Leader role and be assigned to this team.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="shimmer-btn bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
            >
              {isSubmitting ? 'Saving...' : team ? 'Update Team' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
