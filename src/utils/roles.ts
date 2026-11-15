// RET (retention) roles.
// "RET Team Leader" and "RET Agent" are stored as the normal roles
// ("Team Leader" / "Agent") plus department: 'RET'. Because of that every
// existing permission, desk scope, reshuffle, assign and Firestore rule keeps
// working unchanged — a RET Team Leader simply leads a RET desk.

export const RET_DEPARTMENT = 'RET';

export const RET_ROLE_CHOICES = ['RET Team Leader', 'RET Agent'] as const;

export const isRetUser = (user: any) =>
  String(user?.department || '').trim().toUpperCase() === RET_DEPARTMENT;

// Label shown in the UI ("RET Team Leader", "RET Agent", or the plain role).
export const displayRole = (user: any) => {
  const role = String(user?.role || '').trim();
  if (isRetUser(user) && (role === 'Team Leader' || role === 'Agent')) return `RET ${role}`;
  return role;
};

// Value for the role <select> in the user form.
export const roleChoiceOf = (user: any) => displayRole(user) || 'Agent';

// Converts the <select> value back to what is stored on the user document.
export const storedRoleFromChoice = (choice: string): { role: string; department: string } => {
  if (choice === 'RET Team Leader') return { role: 'Team Leader', department: RET_DEPARTMENT };
  if (choice === 'RET Agent') return { role: 'Agent', department: RET_DEPARTMENT };
  return { role: choice, department: '' };
};

export const isRetTeamLeader = (user: any) => isRetUser(user) && String(user?.role || '') === 'Team Leader';

// The status that sends a lead to the RET Team Leader of the agent's desk.
export const TRANSFER_STATUS = 'Transfer';
export const isTransferStatus = (status: any) => String(status || '').trim().toLowerCase() === 'transfer';
