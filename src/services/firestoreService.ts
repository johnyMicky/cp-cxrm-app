import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  Timestamp,
  setDoc,
  writeBatch,
  runTransaction
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  setPersistence,
  browserSessionPersistence,
  inMemoryPersistence
} from "firebase/auth";
import { format } from 'date-fns';
import { db, auth, secondaryAuth, authPersistenceReady } from "../firebase";

// Collections
const LEADS_COL = "leads";
const USERS_COL = "users";
const ACTIVITY_COL = "activity";
const NOTIFICATIONS_COL = "notifications";
const IMPORTS_COL = "imports";
const TEAMS_COL = "teams";
const SHIFT_SESSIONS_COL = "shift_sessions";
const WORK_EVENTS_COL = "work_events";
const FINANCE_DEPOSITS_COL = "finance_deposits";
const FINANCE_AUDIT_COL = "finance_audit_logs";
const FINANCE_CELEBRATIONS_COL = "finance_celebrations";
const FINANCE_SOLUTIONS_COL = "finance_solutions";
const ADMIN_EMAIL = "c.morgan@ghost.com";

const sanitizeData = (data: any) => {
  const sanitized: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      sanitized[key] = data[key];
    }
  });
  return sanitized;
};

const normalizeEmail = (email: string) => (email || "").trim().toLowerCase();
const isAdminEmail = (email: string) => normalizeEmail(email) === ADMIN_EMAIL;
const safeTeamName = (name: string) => (name || "").trim().toLowerCase();

export const firestoreService = {
  getAuth() {
    return auth;
  },

  // Move references that still point to an old/legacy user document ID
  // onto the real Firebase Authentication UID.
  async _migrateUserReferences(oldUserId: string, newUserId: string, userName: string) {
    if (!oldUserId || !newUserId || oldUserId === newUserId) return;

    // Teams now support multiple Team Leaders. Scan teams so both legacy
    // teamLeaderId and new teamLeaderIds[] records are migrated safely.
    const allTeamsSnapshot = await getDocs(collection(db, TEAMS_COL));

    await Promise.all(
      allTeamsSnapshot.docs.map(async (teamDoc) => {
        const data = teamDoc.data() as any;
        const legacyIds = data.teamLeaderId ? [String(data.teamLeaderId)] : [];
        const currentIds = Array.isArray(data.teamLeaderIds)
          ? data.teamLeaderIds.map((value: any) => String(value))
          : legacyIds;

        if (!currentIds.includes(oldUserId)) return;

        const nextIds = Array.from(
          new Set(currentIds.map((id: string) => id === oldUserId ? newUserId : id))
        );

        const nextNames = nextIds.map((id: string) => {
          if (id === newUserId) return userName || '';
          const index = currentIds.indexOf(id);
          if (Array.isArray(data.teamLeaderNames) && index >= 0) {
            return data.teamLeaderNames[index] || '';
          }
          return id === String(data.teamLeaderId || '') ? (data.teamLeaderName || '') : '';
        });

        await updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderIds: nextIds,
          teamLeaderNames: nextNames,
          teamLeaderId: nextIds[0] || '',
          teamLeaderName: nextNames[0] || '',
          updatedAt: serverTimestamp()
        });
      })
    );

    const assignedLeads = await getDocs(
      query(collection(db, LEADS_COL), where("assigned_to", "==", oldUserId))
    );

    if (!assignedLeads.empty) {
      const commits = [];
      let batch = writeBatch(db);
      let count = 0;

      for (const leadDoc of assignedLeads.docs) {
        batch.update(doc(db, LEADS_COL, leadDoc.id), {
          assigned_to: newUserId,
          updatedAt: serverTimestamp()
        });
        count++;

        if (count === 500) {
          commits.push(batch.commit());
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        commits.push(batch.commit());
      }

      await Promise.all(commits);
    }
  },

  // Auth / Users
  async login(email: string, password: string) {
    const cleanEmail = normalizeEmail(email);

    // Make sure persistence configuration has finished before signing in.
    await authPersistenceReady;
    await setPersistence(auth, browserSessionPersistence);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      await this._handleUserMigration(user, cleanEmail);

      return await this.resolveSessionUser(user.uid, cleanEmail);
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const legacyDoc = querySnapshot.docs[0];
          const legacyData = legacyDoc.data();

          try {
            // This branch is an actual login/migration for the person who is
            // trying to sign in, therefore using the primary auth instance here
            // is correct.
            const newUserCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);

            await this._handleUserMigration(
              newUserCredential.user,
              cleanEmail,
              legacyData,
              legacyDoc.id
            );

            return await this.resolveSessionUser(
              newUserCredential.user.uid,
              cleanEmail
            );
          } catch (createError: any) {
            throw createError;
          }
        }
      }

      throw authError;
    }
  },

  async _handleUserMigration(user: any, email: string, providedLegacyData?: any, legacyId?: string) {
    const cleanEmail = normalizeEmail(email);
    const adminUser = isAdminEmail(cleanEmail);

    const userDocRef = doc(db, USERS_COL, user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      let userData: any = providedLegacyData || null;
      let sourceLegacyId = legacyId || '';

      if (!userData) {
        const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Prefer a Team Leader/team-assigned legacy record if duplicates exist.
          const ranked = [...querySnapshot.docs].sort((a, b) => {
            const ad = a.data() as any;
            const bd = b.data() as any;
            const aScore = (ad.role === 'Team Leader' ? 100 : 0) + (ad.teamId ? 50 : 0);
            const bScore = (bd.role === 'Team Leader' ? 100 : 0) + (bd.teamId ? 50 : 0);
            return bScore - aScore;
          });

          userData = ranked[0].data();
          sourceLegacyId = ranked[0].id;
        }
      }

      const finalUserData = {
        uid: user.uid,
        email: user.email || cleanEmail,
        role: adminUser ? "Administrator" : (userData?.role || "Agent"),
        name: userData?.name || (adminUser ? "Admin User" : (user.displayName || cleanEmail.split('@')[0] || 'User')),
        avatar: userData?.avatar || `https://i.pravatar.cc/150?u=${user.uid}`,
        isOnline: true,
        createdAt: userData?.createdAt || serverTimestamp(),
        lastSeen: serverTimestamp(),
        password: userData?.password || '',
        teamId: userData?.teamId || '',
        teamName: userData?.teamName || ''
      };

      await setDoc(userDocRef, finalUserData, { merge: true });

      if (sourceLegacyId && sourceLegacyId !== user.uid) {
        await this._migrateUserReferences(
          sourceLegacyId,
          user.uid,
          finalUserData.name || ''
        );
      }
    } else {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: userDocSnap.data()?.email || user.email || cleanEmail,
        isOnline: true,
        lastSeen: serverTimestamp()
      }, { merge: true });
    }

    // Do not decide role/team in this helper. resolveSessionUser() below is the
    // single canonical place that reconciles duplicates and Team Leader state.
    return await this.resolveSessionUser(user.uid, cleanEmail);
  },

  async resolveSessionUser(uid: string, email?: string) {
    if (!uid) return null;

    const cleanEmail = normalizeEmail(email || '');
    const exactRef = doc(db, USERS_COL, uid);
    const exactSnap = await getDoc(exactRef);
    const exactData = exactSnap.exists() ? (exactSnap.data() as any) : null;

    const effectiveEmail = normalizeEmail(
      exactData?.email ||
      cleanEmail ||
      auth.currentUser?.email ||
      ''
    );

    const emailSnapshot = effectiveEmail
      ? await getDocs(query(collection(db, USERS_COL), where("email", "==", effectiveEmail)))
      : null;

    const candidateDocs = emailSnapshot ? emailSnapshot.docs : [];
    const candidateIds = Array.from(
      new Set([uid, ...candidateDocs.map(d => d.id)])
    );

    // Find whether ANY UID/document belonging to this email is referenced as
    // a Team Leader. Supports both legacy single-leader fields and the new
    // teamLeaderIds[] array.
    let leadershipTeamDoc: any = null;
    let leadershipSourceId = '';

    const leadershipTeamsSnapshot = await getDocs(collection(db, TEAMS_COL));

    for (const teamDoc of leadershipTeamsSnapshot.docs) {
      const teamData = teamDoc.data() as any;
      const leaderIds = Array.isArray(teamData.teamLeaderIds)
        ? teamData.teamLeaderIds.map((value: any) => String(value))
        : (teamData.teamLeaderId ? [String(teamData.teamLeaderId)] : []);

      const matchedId = candidateIds.find(candidateId => leaderIds.includes(String(candidateId)));

      if (matchedId) {
        leadershipTeamDoc = teamDoc;
        leadershipSourceId = String(matchedId);
        break;
      }
    }

    const duplicateDocs = candidateDocs.filter(d => d.id !== uid);

    // Pick the best CRM profile source without allowing a weak "Agent" duplicate
    // to overwrite an already assigned Team Leader.
    const profileCandidates: Array<{ id: string; data: any }> = [];

    if (exactData) {
      profileCandidates.push({ id: uid, data: exactData });
    }

    duplicateDocs.forEach(d => {
      profileCandidates.push({ id: d.id, data: d.data() as any });
    });

    profileCandidates.sort((a, b) => {
      const score = (item: { id: string; data: any }) => {
        const data = item.data || {};
        return (
          (item.id === leadershipSourceId ? 1000 : 0) +
          (data.role === 'Team Leader' ? 200 : 0) +
          (data.teamId ? 100 : 0) +
          (data.name ? 10 : 0) +
          (item.id === uid ? 5 : 0)
        );
      };

      return score(b) - score(a);
    });

    const preferred = profileCandidates[0]?.data || exactData || {};

    let teamId = preferred.teamId || exactData?.teamId || '';
    let teamName = preferred.teamName || exactData?.teamName || '';
    let role = isAdminEmail(effectiveEmail)
      ? 'Administrator'
      : (preferred.role || exactData?.role || 'Agent');

    if (leadershipTeamDoc) {
      const teamData = leadershipTeamDoc.data() as any;
      role = 'Team Leader';
      teamId = leadershipTeamDoc.id;
      teamName = teamData.name || teamName || '';
    } else if (role === 'Team Leader' && teamId) {
      // Repair the inverse relationship if the user document says Team Leader
      // but a previous bug cleared team.teamLeaderId.
      const teamSnap = await getDoc(doc(db, TEAMS_COL, teamId));

      if (teamSnap.exists()) {
        const teamData = teamSnap.data() as any;

        const currentLeaderIds = Array.isArray(teamData.teamLeaderIds)
          ? teamData.teamLeaderIds.map((value: any) => String(value))
          : (teamData.teamLeaderId ? [String(teamData.teamLeaderId)] : []);

        // A Team may have several leaders. If the user document says Team Leader
        // for this team, add/repair this UID without removing existing leaders.
        const duplicateIndex = currentLeaderIds.findIndex((leaderId: string) =>
          candidateIds.includes(leaderId)
        );

        const nextLeaderIds = [...currentLeaderIds];
        if (duplicateIndex >= 0) {
          nextLeaderIds[duplicateIndex] = uid;
        } else if (!nextLeaderIds.includes(uid)) {
          nextLeaderIds.push(uid);
        }

        const uniqueLeaderIds = Array.from(new Set(nextLeaderIds));
        const nextLeaderNames = uniqueLeaderIds.map((leaderId: string) => {
          if (leaderId === uid) return preferred.name || exactData?.name || '';
          const originalIndex = currentLeaderIds.indexOf(leaderId);
          if (Array.isArray(teamData.teamLeaderNames) && originalIndex >= 0) {
            return teamData.teamLeaderNames[originalIndex] || '';
          }
          return leaderId === String(teamData.teamLeaderId || '')
            ? (teamData.teamLeaderName || '')
            : '';
        });

        await updateDoc(doc(db, TEAMS_COL, teamId), {
          teamLeaderIds: uniqueLeaderIds,
          teamLeaderNames: nextLeaderNames,
          teamLeaderId: uniqueLeaderIds[0] || '',
          teamLeaderName: nextLeaderNames[0] || '',
          updatedAt: serverTimestamp()
        });

        teamName = teamData.name || teamName || '';
      }
    }

    const canonicalData = {
      ...preferred,
      ...exactData,
      uid,
      email: effectiveEmail || exactData?.email || preferred.email || '',
      role,
      teamId: teamId || '',
      teamName: teamName || '',
      name:
        exactData?.name ||
        preferred.name ||
        (isAdminEmail(effectiveEmail) ? 'Admin User' : (effectiveEmail.split('@')[0] || 'User')),
      avatar:
        exactData?.avatar ||
        preferred.avatar ||
        `https://i.pravatar.cc/150?u=${uid}`,
      isOnline: true,
      lastSeen: serverTimestamp()
    };

    await setDoc(exactRef, canonicalData, { merge: true });

    // If a legacy/duplicate UID was the leader, move team/lead references to
    // the real Firebase Auth UID BEFORE removing the duplicate document.
    for (const duplicate of duplicateDocs) {
      await this._migrateUserReferences(
        duplicate.id,
        uid,
        canonicalData.name || ''
      );
    }

    // Reassert the Team Leader relationship after reference migration without
    // replacing other Team Leaders already assigned to the same team.
    if (role === 'Team Leader' && teamId) {
      const teamSnap = await getDoc(doc(db, TEAMS_COL, teamId));
      if (teamSnap.exists()) {
        const teamData = teamSnap.data() as any;
        const currentLeaderIds = Array.isArray(teamData.teamLeaderIds)
          ? teamData.teamLeaderIds.map((value: any) => String(value))
          : (teamData.teamLeaderId ? [String(teamData.teamLeaderId)] : []);

        let nextLeaderIds = currentLeaderIds.map((leaderId: string) =>
          candidateIds.includes(leaderId) ? uid : leaderId
        );

        if (!nextLeaderIds.includes(uid)) {
          nextLeaderIds.push(uid);
        }

        nextLeaderIds = Array.from(new Set(nextLeaderIds));

        const nextLeaderNames = nextLeaderIds.map((leaderId: string) => {
          if (leaderId === uid) return canonicalData.name || '';
          const originalIndex = currentLeaderIds.indexOf(leaderId);
          if (Array.isArray(teamData.teamLeaderNames) && originalIndex >= 0) {
            return teamData.teamLeaderNames[originalIndex] || '';
          }
          return leaderId === String(teamData.teamLeaderId || '')
            ? (teamData.teamLeaderName || '')
            : '';
        });

        await updateDoc(doc(db, TEAMS_COL, teamId), {
          teamLeaderIds: nextLeaderIds,
          teamLeaderNames: nextLeaderNames,
          teamLeaderId: nextLeaderIds[0] || '',
          teamLeaderName: nextLeaderNames[0] || '',
          updatedAt: serverTimestamp()
        });
      }
    }

    for (const duplicate of duplicateDocs) {
      await deleteDoc(doc(db, USERS_COL, duplicate.id)).catch(console.error);
    }

    return {
      id: uid,
      ...canonicalData
    };
  },

  async logout() {
    if (auth.currentUser) {
      const userDocRef = doc(db, USERS_COL, auth.currentUser.uid);
      await updateDoc(userDocRef, { 
        isOnline: false, 
        lastSeen: serverTimestamp() 
      }).catch(console.error);
    }
    await signOut(auth);
  },

  async getUsers() {
    try {
      const querySnapshot = await getDocs(collection(db, USERS_COL));
      return querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const email = normalizeEmail(data.email || '');
        const adminUser = isAdminEmail(email);

        return {
          id: docSnap.id,
          name: data.name || (adminUser ? 'Admin User' : ''),
          email: data.email || '',
          role: adminUser ? 'Administrator' : (data.role || 'Agent'),
          avatar: data.avatar || `https://i.pravatar.cc/150?u=${docSnap.id}`,
          isOnline: data.isOnline || false,
          lastSeen: data.lastSeen || null,
          createdAt: data.createdAt || null,
          teamId: data.teamId || '',
          teamName: data.teamName || ''
        };
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        console.error('Firestore quota exceeded');
        throw new Error('Firebase storage limit reached. Please wait for reset or upgrade plan.');
      }
      throw err;
    }
  },

  async getUser(id: string) {
    if (!id) return null;

    const userDoc = await getDoc(doc(db, USERS_COL, id));
    if (!userDoc.exists()) return null;

    const data = userDoc.data();
    const email = normalizeEmail(data.email || '');
    const adminUser = isAdminEmail(email);

    return {
      id: userDoc.id,
      name: data.name || (adminUser ? 'Admin User' : ''),
      email: data.email || '',
      role: adminUser ? 'Administrator' : (data.role || 'Agent'),
      avatar: data.avatar || `https://i.pravatar.cc/150?u=${userDoc.id}`,
      isOnline: data.isOnline || false,
      lastSeen: data.lastSeen || null,
      createdAt: data.createdAt || null,
      teamId: data.teamId || '',
      teamName: data.teamName || ''
    };
  },

  async getUsersByTeam(teamId: string) {
    if (!teamId) return [];

    const q = query(collection(db, USERS_COL), where("teamId", "==", teamId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const email = normalizeEmail(data.email || '');
      const adminUser = isAdminEmail(email);

      return {
        id: docSnap.id,
        name: data.name || (adminUser ? 'Admin User' : ''),
        email: data.email || '',
        role: adminUser ? 'Administrator' : (data.role || 'Agent'),
        avatar: data.avatar || `https://i.pravatar.cc/150?u=${docSnap.id}`,
        isOnline: data.isOnline || false,
        lastSeen: data.lastSeen || null,
        createdAt: data.createdAt || null,
        teamId: data.teamId || '',
        teamName: data.teamName || ''
      };
    });
  },

  async createUser(userData: any) {
    const sanitized = sanitizeData(userData);
    const { email, password, ...rest } = sanitized;

    try {
      const cleanEmail = normalizeEmail(email);
      const adminUser = isAdminEmail(cleanEmail);
      const finalRole = adminUser ? "Administrator" : (rest.role || "Agent");

      // CRITICAL:
      // Use the secondary Auth instance here so creating a CRM user does NOT
      // replace the currently logged-in Administrator session.
      // The secondary auth must NEVER persist a session.
      await authPersistenceReady;
      await setPersistence(secondaryAuth, inMemoryPersistence);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        cleanEmail,
        password
      );
      const user = userCredential.user;

      try {
        const userDocData = {
          ...rest,
          uid: user.uid,
          email: cleanEmail,
          role: finalRole,
          name: rest.name || (adminUser ? "Admin User" : cleanEmail.split("@")[0]),
          createdAt: serverTimestamp(),
          isOnline: false,
          lastSeen: serverTimestamp(),
          avatar: rest.avatar || `https://i.pravatar.cc/150?u=${user.uid}`,
          teamId: rest.teamId || '',
          teamName: rest.teamName || ''
        };

        await setDoc(doc(db, USERS_COL, user.uid), userDocData);

        if (finalRole === 'Team Leader' && rest.teamId) {
          await this.setTeamLeader(rest.teamId, user.uid);
        }

        return { id: user.uid, ...userDocData };
      } finally {
        // Keep the secondary Auth clean between user-creation operations.
        await signOut(secondaryAuth).catch(console.error);
      }
    } catch (error: any) {
      console.error("Error creating user:", error);

      // Extra safety: never leave a newly created secondary session active.
      await signOut(secondaryAuth).catch(() => {});

      throw error;
    }
  },

  async updateUser(id: string, userData: any) {
    const sanitized = sanitizeData(userData);
    const nextEmail = sanitized.email ? normalizeEmail(sanitized.email) : undefined;
    const adminUser = nextEmail ? isAdminEmail(nextEmail) : false;

    const currentUserSnap = await getDoc(doc(db, USERS_COL, id));
    const currentUserData = currentUserSnap.exists() ? currentUserSnap.data() : {};
    const finalRole = adminUser
      ? "Administrator"
      : (sanitized.role || currentUserData.role || "Agent");

    const nextTeamId =
      sanitized.teamId !== undefined
        ? sanitized.teamId
        : (currentUserData.teamId || '');

    const nextTeamName =
      sanitized.teamName !== undefined
        ? sanitized.teamName
        : (currentUserData.teamName || '');

    // Remove this user from leadership arrays when the role/team changes.
    const allTeamsSnapshot = await getDocs(collection(db, TEAMS_COL));

    await Promise.all(
      allTeamsSnapshot.docs.map(async (teamDoc) => {
        const teamData = teamDoc.data() as any;
        const leaderIds = Array.isArray(teamData.teamLeaderIds)
          ? teamData.teamLeaderIds.map((value: any) => String(value))
          : (teamData.teamLeaderId ? [String(teamData.teamLeaderId)] : []);

        if (!leaderIds.includes(id)) return;

        const shouldRemainLeader =
          finalRole === 'Team Leader' &&
          !!nextTeamId &&
          teamDoc.id === nextTeamId;

        if (shouldRemainLeader) return;

        const leaderNames = Array.isArray(teamData.teamLeaderNames)
          ? teamData.teamLeaderNames
          : leaderIds.map((leaderId: string) =>
              leaderId === String(teamData.teamLeaderId || '')
                ? (teamData.teamLeaderName || '')
                : ''
            );

        const nextPairs = leaderIds
          .map((leaderId: string, index: number) => ({
            id: leaderId,
            name: leaderNames[index] || ''
          }))
          .filter((leader: any) => leader.id !== id);

        await updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderIds: nextPairs.map((leader: any) => leader.id),
          teamLeaderNames: nextPairs.map((leader: any) => leader.name),
          teamLeaderId: nextPairs[0]?.id || '',
          teamLeaderName: nextPairs[0]?.name || '',
          updatedAt: serverTimestamp()
        });
      })
    );

    const docRef = doc(db, USERS_COL, id);
    await updateDoc(docRef, {
      ...sanitized,
      ...(nextEmail ? { email: nextEmail } : {}),
      role: finalRole,
      teamId: nextTeamId || '',
      teamName: nextTeamName || ''
    });

    if (finalRole === 'Team Leader' && nextTeamId) {
      await this.setTeamLeader(nextTeamId, id);
    }
  },

  async deleteUser(id: string) {
    // Remove this user from every Team Leader array before deleting the account.
    const allTeamsSnapshot = await getDocs(collection(db, TEAMS_COL));

    await Promise.all(
      allTeamsSnapshot.docs.map(async (teamDoc) => {
        const teamData = teamDoc.data() as any;
        const leaderIds = Array.isArray(teamData.teamLeaderIds)
          ? teamData.teamLeaderIds.map((value: any) => String(value))
          : (teamData.teamLeaderId ? [String(teamData.teamLeaderId)] : []);

        if (!leaderIds.includes(id)) return;

        const leaderNames = Array.isArray(teamData.teamLeaderNames)
          ? teamData.teamLeaderNames
          : leaderIds.map((leaderId: string) =>
              leaderId === String(teamData.teamLeaderId || '')
                ? (teamData.teamLeaderName || '')
                : ''
            );

        const nextPairs = leaderIds
          .map((leaderId: string, index: number) => ({
            id: leaderId,
            name: leaderNames[index] || ''
          }))
          .filter((leader: any) => leader.id !== id);

        await updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderIds: nextPairs.map((leader: any) => leader.id),
          teamLeaderNames: nextPairs.map((leader: any) => leader.name),
          teamLeaderId: nextPairs[0]?.id || '',
          teamLeaderName: nextPairs[0]?.name || '',
          updatedAt: serverTimestamp()
        });
      })
    );

    await deleteDoc(doc(db, USERS_COL, id));
  },

  // Teams
  async getTeams() {
    const snapshot = await getDocs(collection(db, TEAMS_COL));

    return snapshot.docs
      .map(teamDoc => {
        const data = teamDoc.data() as any;

        const teamLeaderIds = Array.isArray(data.teamLeaderIds)
          ? data.teamLeaderIds.map((value: any) => String(value))
          : (data.teamLeaderId ? [String(data.teamLeaderId)] : []);

        const teamLeaderNames = Array.isArray(data.teamLeaderNames)
          ? data.teamLeaderNames
          : teamLeaderIds.map((leaderId: string) =>
              leaderId === String(data.teamLeaderId || '')
                ? (data.teamLeaderName || '')
                : ''
            );

        return {
          id: teamDoc.id,
          name: data.name || '',
          teamLeaderIds,
          teamLeaderNames,
          // Legacy compatibility: first leader remains exposed in old fields.
          teamLeaderId: teamLeaderIds[0] || '',
          teamLeaderName: teamLeaderNames[0] || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getTeam(id: string) {
    if (!id) return null;

    const teamDoc = await getDoc(doc(db, TEAMS_COL, id));
    if (!teamDoc.exists()) return null;

    const data = teamDoc.data() as any;

    const teamLeaderIds = Array.isArray(data.teamLeaderIds)
      ? data.teamLeaderIds.map((value: any) => String(value))
      : (data.teamLeaderId ? [String(data.teamLeaderId)] : []);

    const teamLeaderNames = Array.isArray(data.teamLeaderNames)
      ? data.teamLeaderNames
      : teamLeaderIds.map((leaderId: string) =>
          leaderId === String(data.teamLeaderId || '')
            ? (data.teamLeaderName || '')
            : ''
        );

    return {
      id: teamDoc.id,
      name: data.name || '',
      teamLeaderIds,
      teamLeaderNames,
      teamLeaderId: teamLeaderIds[0] || '',
      teamLeaderName: teamLeaderNames[0] || '',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  },

  async createTeam(teamData: any) {
    const cleanName = String(teamData?.name || '').trim();

    if (!cleanName) {
      throw new Error('Team name is required.');
    }

    const existingTeams = await this.getTeams();
    const duplicate = existingTeams.some(
      (team: any) => safeTeamName(team.name) === safeTeamName(cleanName)
    );

    if (duplicate) {
      throw new Error('A team with this name already exists.');
    }

    const teamRef = await addDoc(collection(db, TEAMS_COL), {
      name: cleanName,
      teamLeaderIds: [],
      teamLeaderNames: [],
      teamLeaderId: '',
      teamLeaderName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return {
      id: teamRef.id,
      name: cleanName,
      teamLeaderIds: [],
      teamLeaderNames: [],
      teamLeaderId: '',
      teamLeaderName: ''
    };
  },

  async updateTeam(id: string, teamData: any) {
    const currentTeam = await this.getTeam(id);
    if (!currentTeam) {
      throw new Error('Team not found.');
    }

    const cleanName =
      teamData?.name !== undefined
        ? String(teamData.name || '').trim()
        : currentTeam.name;

    if (!cleanName) {
      throw new Error('Team name is required.');
    }

    if (safeTeamName(cleanName) !== safeTeamName(currentTeam.name)) {
      const existingTeams = await this.getTeams();
      const duplicate = existingTeams.some(
        (team: any) =>
          team.id !== id &&
          safeTeamName(team.name) === safeTeamName(cleanName)
      );

      if (duplicate) {
        throw new Error('A team with this name already exists.');
      }
    }

    await updateDoc(doc(db, TEAMS_COL, id), {
      ...sanitizeData(teamData),
      name: cleanName,
      updatedAt: serverTimestamp()
    });

    if (cleanName !== currentTeam.name) {
      const membersSnapshot = await getDocs(
        query(collection(db, USERS_COL), where("teamId", "==", id))
      );

      const batches = [];
      let batch = writeBatch(db);
      let count = 0;

      for (const memberDoc of membersSnapshot.docs) {
        batch.update(doc(db, USERS_COL, memberDoc.id), {
          teamName: cleanName
        });
        count++;

        if (count === 500) {
          batches.push(batch.commit());
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        batches.push(batch.commit());
      }

      await Promise.all(batches);
    }

    return {
      ...currentTeam,
      ...teamData,
      id,
      name: cleanName
    };
  },

  async deleteTeam(id: string) {
    const team = await this.getTeam(id);
    if (!team) return;

    const membersSnapshot = await getDocs(
      query(collection(db, USERS_COL), where("teamId", "==", id))
    );

    const batches = [];
    let batch = writeBatch(db);
    let count = 0;

    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data();
      batch.update(doc(db, USERS_COL, memberDoc.id), {
        teamId: '',
        teamName: '',
        ...(memberData.role === 'Team Leader' ? { role: 'Agent' } : {})
      });
      count++;

      if (count === 500) {
        batches.push(batch.commit());
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      batches.push(batch.commit());
    }

    await Promise.all(batches);
    await deleteDoc(doc(db, TEAMS_COL, id));
  },

  // Add one Team Leader without replacing the other leaders of this team.
  async setTeamLeader(teamId: string, leaderId: string) {
    if (!teamId || !leaderId) {
      throw new Error('Team and Team Leader are required.');
    }

    const [team, leader] = await Promise.all([
      this.getTeam(teamId),
      this.getUser(leaderId)
    ]);

    if (!team) {
      throw new Error('Team not found.');
    }

    if (!leader) {
      throw new Error('Team Leader user not found.');
    }

    if (['Administrator', 'Manager'].includes(leader.role)) {
      throw new Error('Administrator or Manager cannot be assigned as a Team Leader.');
    }

    // A Team Leader belongs to one team, but that team can have many leaders.
    // Remove this user from leadership of any OTHER team first.
    const allTeams = await this.getTeams();

    await Promise.all(
      allTeams
        .filter((otherTeam: any) =>
          otherTeam.id !== teamId &&
          (otherTeam.teamLeaderIds || []).includes(leaderId)
        )
        .map(async (otherTeam: any) => {
          const nextPairs = (otherTeam.teamLeaderIds || [])
            .map((id: string, index: number) => ({
              id,
              name: (otherTeam.teamLeaderNames || [])[index] || ''
            }))
            .filter((item: any) => item.id !== leaderId);

          await updateDoc(doc(db, TEAMS_COL, otherTeam.id), {
            teamLeaderIds: nextPairs.map((item: any) => item.id),
            teamLeaderNames: nextPairs.map((item: any) => item.name),
            teamLeaderId: nextPairs[0]?.id || '',
            teamLeaderName: nextPairs[0]?.name || '',
            updatedAt: serverTimestamp()
          });
        })
    );

    const currentIds = Array.isArray((team as any).teamLeaderIds)
      ? [...(team as any).teamLeaderIds]
      : ((team as any).teamLeaderId ? [(team as any).teamLeaderId] : []);

    const currentNames = Array.isArray((team as any).teamLeaderNames)
      ? [...(team as any).teamLeaderNames]
      : currentIds.map((id: string) =>
          id === (team as any).teamLeaderId ? ((team as any).teamLeaderName || '') : ''
        );

    const existingIndex = currentIds.indexOf(leaderId);

    if (existingIndex >= 0) {
      currentNames[existingIndex] = leader.name || currentNames[existingIndex] || '';
    } else {
      currentIds.push(leaderId);
      currentNames.push(leader.name || '');
    }

    await updateDoc(doc(db, USERS_COL, leaderId), {
      role: 'Team Leader',
      teamId,
      teamName: team.name
    });

    await updateDoc(doc(db, TEAMS_COL, teamId), {
      teamLeaderIds: currentIds,
      teamLeaderNames: currentNames,
      teamLeaderId: currentIds[0] || '',
      teamLeaderName: currentNames[0] || '',
      updatedAt: serverTimestamp()
    });

    return {
      teamId,
      leaderId,
      leaderName: leader.name,
      teamLeaderIds: currentIds,
      teamLeaderNames: currentNames
    };
  },

  async removeTeamLeader(teamId: string, leaderId: string) {
    if (!teamId || !leaderId) return;

    const team = await this.getTeam(teamId);
    if (!team) return;

    const currentIds = Array.isArray((team as any).teamLeaderIds)
      ? [...(team as any).teamLeaderIds]
      : ((team as any).teamLeaderId ? [(team as any).teamLeaderId] : []);

    const currentNames = Array.isArray((team as any).teamLeaderNames)
      ? [...(team as any).teamLeaderNames]
      : currentIds.map((id: string) =>
          id === (team as any).teamLeaderId ? ((team as any).teamLeaderName || '') : ''
        );

    const nextPairs = currentIds
      .map((id: string, index: number) => ({
        id,
        name: currentNames[index] || ''
      }))
      .filter((item: any) => item.id !== leaderId);

    const leaderSnap = await getDoc(doc(db, USERS_COL, leaderId));

    if (leaderSnap.exists()) {
      const leaderData = leaderSnap.data();
      if (
        leaderData.role === 'Team Leader' &&
        String(leaderData.teamId || '') === String(teamId)
      ) {
        await updateDoc(doc(db, USERS_COL, leaderId), {
          role: 'Agent',
          teamId,
          teamName: team.name
        });
      }
    }

    await updateDoc(doc(db, TEAMS_COL, teamId), {
      teamLeaderIds: nextPairs.map((item: any) => item.id),
      teamLeaderNames: nextPairs.map((item: any) => item.name),
      teamLeaderId: nextPairs[0]?.id || '',
      teamLeaderName: nextPairs[0]?.name || '',
      updatedAt: serverTimestamp()
    });
  },

  // Replace the full Team Leader selection for a team.
  async setTeamLeaders(teamId: string, leaderIds: string[]) {
    if (!teamId) {
      throw new Error('Team is required.');
    }

    const uniqueLeaderIds = Array.from(
      new Set((leaderIds || []).filter(Boolean).map(id => String(id)))
    );

    const team = await this.getTeam(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }

    const previousIds = Array.isArray((team as any).teamLeaderIds)
      ? [...(team as any).teamLeaderIds]
      : ((team as any).teamLeaderId ? [(team as any).teamLeaderId] : []);

    const removedIds = previousIds.filter((id: string) => !uniqueLeaderIds.includes(id));

    for (const removedId of removedIds) {
      await this.removeTeamLeader(teamId, removedId);
    }

    for (const leaderId of uniqueLeaderIds) {
      await this.setTeamLeader(teamId, leaderId);
    }

    // Re-read after additive/removal operations and keep selected order stable.
    const refreshedTeam = await this.getTeam(teamId);
    const refreshedIds = (refreshedTeam as any)?.teamLeaderIds || [];
    const refreshedNames = (refreshedTeam as any)?.teamLeaderNames || [];

    const orderedPairs = uniqueLeaderIds
      .map((leaderId: string) => {
        const index = refreshedIds.indexOf(leaderId);
        return {
          id: leaderId,
          name: index >= 0 ? (refreshedNames[index] || '') : ''
        };
      })
      .filter((item: any) => refreshedIds.includes(item.id));

    await updateDoc(doc(db, TEAMS_COL, teamId), {
      teamLeaderIds: orderedPairs.map((item: any) => item.id),
      teamLeaderNames: orderedPairs.map((item: any) => item.name),
      teamLeaderId: orderedPairs[0]?.id || '',
      teamLeaderName: orderedPairs[0]?.name || '',
      updatedAt: serverTimestamp()
    });

    return await this.getTeam(teamId);
  },

  async clearTeamLeader(teamId: string) {
    return await this.setTeamLeaders(teamId, []);
  },

  // Leads
  async getLeads(agentId?: string) {
    try {
      // IMPORTANT PERFORMANCE FIX:
      // When an Agent is requested, ask Firestore only for that Agent's leads.
      // The old implementation downloaded the entire leads collection first.
      const q = agentId
        ? query(collection(db, LEADS_COL), where("assigned_to", "==", String(agentId)))
        : query(collection(db, LEADS_COL), orderBy("createdAt", "desc"));

      const querySnapshot = await getDocs(q);
      const leads = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          country: data.country || '',
          status: data.status || 'New',
          source: data.source || '',
          assigned_to: data.assigned_to || '',
          importId: data.importId || '',
          importFileName: data.importFileName || '',
          callbackAt: data.callbackAt || null,
          createdBy: data.createdBy || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });

      // Agent-scoped query does not need a composite index because sorting is local.
      if (agentId) {
        return leads.sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      return leads;
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        throw new Error('Firebase storage limit reached. Please wait for reset or upgrade plan.');
      }
      console.error('Error fetching leads:', err);

      // Keep the existing safe fallback behaviour.
      const fallbackQuery = agentId
        ? query(collection(db, LEADS_COL), where("assigned_to", "==", String(agentId)))
        : query(collection(db, LEADS_COL));
      const querySnapshot = await getDocs(fallbackQuery);
      const leads = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          country: data.country || '',
          status: data.status || 'New',
          source: data.source || '',
          assigned_to: data.assigned_to || '',
          importId: data.importId || '',
          importFileName: data.importFileName || '',
          callbackAt: data.callbackAt || null,
          createdBy: data.createdBy || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });

      return leads.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
    }
  },

  async getLead(id: string) {
    const docRef = doc(db, LEADS_COL, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Lead not found");
    
    const notesQ = query(collection(db, "notes"), where("lead_id", "==", id));
    const historyQ = query(collection(db, "history"), where("lead_id", "==", id));
    
    const [notesSnap, historySnap] = await Promise.all([getDocs(notesQ), getDocs(historyQ)]);
    
    const notes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    const history = historySnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });
    
    return { 
      id: docSnap.id, 
      ...docSnap.data(),
      notes,
      history
    };
  },

  async createLead(leadData: any) {
    const sanitized = sanitizeData(leadData);
    const docRef = await addDoc(collection(db, LEADS_COL), {
      ...sanitized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: docRef.id };
  },

  async bulkCreateLeads(leads: any[], userId: string, fileName: string, onProgress?: (current: number, total: number) => void) {
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    const importRef = await addDoc(collection(db, IMPORTS_COL), {
      fileName,
      createdBy: userId,
      createdAt: new Date(),
      totalLeads: leads.length,
      status: 'processing'
    });

    const BATCH_SIZE = 500;
    const now = new Date();

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const chunk = leads.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      
      chunk.forEach(lead => {
        try {
          const docRef = doc(collection(db, LEADS_COL));
          const sanitized = sanitizeData({
            ...lead,
            createdBy: userId,
            importId: importRef.id,
            importFileName: fileName,
            createdAt: now,
            updatedAt: now
          });
          batch.set(docRef, sanitized);
          imported++;
        } catch (err) {
          console.error('Lead sanitization error:', err);
          errors++;
        }
      });

      await batch.commit();

      if (onProgress) {
        onProgress(Math.min(i + BATCH_SIZE, leads.length), leads.length);
      }
    }

    await updateDoc(importRef, {
      importedCount: imported,
      duplicateCount: duplicates,
      errorCount: errors,
      status: 'completed'
    });

    return { imported, duplicates, errors };
  },

  async getImports() {
    const q = query(collection(db, IMPORTS_COL), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Role-aware Lead Files visibility.
  // Administrator/Manager: all imports.
  // Team Leader: only files uploaded by that Team Leader.
  // Agent/other roles: no import records.
  async getImportsForUser(userId: string) {
    if (!userId) return [];

    const currentUser = await this.getUser(String(userId));
    if (!currentUser) return [];

    const role = String(currentUser.role || 'Agent').trim();

    if (role === 'Administrator' || role === 'Manager') {
      return await this.getImports();
    }

    if (role === 'Team Leader') {
      const q = query(
        collection(db, IMPORTS_COL),
        where("createdBy", "==", String(userId))
      );
      const snap = await getDocs(q);

      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
    }

    return [];
  },

  async getLeadsByImport(importId: string) {
    if (!importId) return [];

    const q = query(collection(db, LEADS_COL), where("importId", "==", importId));
    const snap = await getDocs(q);

    return snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
  },

  // Returns only users that the current role is allowed to use for distribution.
  async getDistributionUsersForUser(userId: string) {
    if (!userId) return [];

    const currentUser = await this.getUser(String(userId));
    if (!currentUser) return [];

    const role = String(currentUser.role || 'Agent').trim();

    if (role === 'Team Leader') {
      const teamId = String(currentUser.teamId || '');
      if (!teamId) return [];

      const teamUsers = await this.getUsersByTeam(teamId);
      return teamUsers.filter((member: any) => member.role === 'Agent');
    }

    if (role === 'Administrator' || role === 'Manager') {
      const allUsers = await this.getUsers();
      return allUsers.filter((member: any) =>
        ['Agent', 'Team Leader'].includes(member.role)
      );
    }

    return [];
  },

  // Internal permission validation used by import distribution and reshuffle.
  async _validateImportDistributionAccess(importId: string, agentIds: string[], userId: string) {
    if (!importId) throw new Error('Import is required.');
    if (!userId) throw new Error('User is required.');
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      throw new Error('Select at least one agent.');
    }

    const [currentUser, importSnap] = await Promise.all([
      this.getUser(String(userId)),
      getDoc(doc(db, IMPORTS_COL, importId))
    ]);

    if (!currentUser) throw new Error('Current user not found.');
    if (!importSnap.exists()) throw new Error('Lead file not found.');

    const importData = importSnap.data() as any;
    const role = String(currentUser.role || 'Agent').trim();
    const uniqueAgentIds = Array.from(new Set(agentIds.map(id => String(id)).filter(Boolean)));

    if (role === 'Team Leader') {
      if (String(importData.createdBy || '') !== String(userId)) {
        throw new Error('You can only distribute lead files that you uploaded.');
      }

      const teamId = String(currentUser.teamId || '');
      if (!teamId) {
        throw new Error('Your Team Leader account is not assigned to a team.');
      }

      const teamUsers = await this.getUsersByTeam(teamId);
      const allowedAgentIds = new Set(
        teamUsers
          .filter((member: any) => member.role === 'Agent')
          .map((member: any) => String(member.id))
      );

      const invalidAgent = uniqueAgentIds.find(id => !allowedAgentIds.has(id));
      if (invalidAgent) {
        throw new Error('Team Leaders can distribute leads only to Agents in their own team.');
      }

      return {
        currentUser,
        importData,
        agentIds: uniqueAgentIds
      };
    }

    if (role === 'Administrator' || role === 'Manager') {
      const allUsers = await this.getUsers();
      const allowedAgentIds = new Set(
        allUsers
          .filter((member: any) => ['Agent', 'Team Leader'].includes(member.role))
          .map((member: any) => String(member.id))
      );

      const invalidAgent = uniqueAgentIds.find(id => !allowedAgentIds.has(id));
      if (invalidAgent) {
        throw new Error('One or more selected users are not valid distribution recipients.');
      }

      return {
        currentUser,
        importData,
        agentIds: uniqueAgentIds
      };
    }

    throw new Error('You do not have permission to distribute lead files.');
  },

  async distributeImportLeads(
    importId: string,
    agentIds: string[],
    userId: string,
    agentNamesMap?: Record<string, string>
  ) {
    const access = await this._validateImportDistributionAccess(importId, agentIds, userId);
    const importLeads = await this.getLeadsByImport(importId);

    if (importLeads.length === 0) {
      return { total: 0, summary: {} as Record<string, number> };
    }

    const leadIds = importLeads.map((lead: any) => String(lead.id));
    const summary = await this.distributeLeads(
      leadIds,
      access.agentIds as string[],
      userId,
      agentNamesMap
    );

    await this.logActivity({
      user_id: userId,
      action: "Import Distribution",
      details: `Distributed ${leadIds.length} leads from import ${importId}.`
    }).catch(() => {});

    return {
      total: leadIds.length,
      summary
    };
  },

  async reshuffleImportLeads(
    importId: string,
    agentIds: string[],
    userId: string,
    agentNamesMap?: Record<string, string>
  ) {
    const access = await this._validateImportDistributionAccess(importId, agentIds, userId);
    const importLeads = await this.getLeadsByImport(importId);

    if (importLeads.length === 0) {
      return { total: 0, summary: {} as Record<string, number> };
    }

    const summary: Record<string, number> = {};
    const BATCH_SIZE = 500;
    let batch = writeBatch(db);
    let batchCount = 0;
    const commits: Promise<void>[] = [];
    const now = new Date();

    for (let index = 0; index < importLeads.length; index++) {
      const lead: any = importLeads[index];
      const agentId = String((access.agentIds as string[])[index % (access.agentIds as string[]).length]);

      batch.update(doc(db, LEADS_COL, String(lead.id)), {
        assigned_to: agentId,
        updatedAt: now
      });

      const displayName = agentNamesMap?.[agentId] || agentId;
      summary[displayName] = (summary[displayName] || 0) + 1;

      batchCount++;

      if (batchCount === BATCH_SIZE) {
        commits.push(batch.commit());
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      commits.push(batch.commit());
    }

    await Promise.all(commits);

    await this.logActivity({
      user_id: userId,
      action: "Import Reshuffle",
      details: `Reshuffled ${importLeads.length} leads from import ${importId}.`
    }).catch(() => {});

    return {
      total: importLeads.length,
      summary
    };
  },

  async deleteImport(importId: string) {
    const q = query(collection(db, LEADS_COL), where("importId", "==", importId));
    const snap = await getDocs(q);
    
    const deletePromises = snap.docs.map(d => deleteDoc(doc(db, LEADS_COL, d.id)));
    await Promise.all(deletePromises);
    
    await deleteDoc(doc(db, IMPORTS_COL, importId));
  },

  async updateLead(id: string, leadData: any) {
    const sanitized = sanitizeData(leadData);
    const docRef = doc(db, LEADS_COL, id);
    await updateDoc(docRef, {
      ...sanitized,
      updatedAt: serverTimestamp()
    });
  },

  async deleteLead(id: string) {
    await deleteDoc(doc(db, LEADS_COL, id));
  },

  async setCallback(leadId: string, userId: string, callbackAt: Date) {
    const docRef = doc(db, LEADS_COL, leadId);
    await updateDoc(docRef, {
      callbackAt: Timestamp.fromDate(callbackAt),
      updatedAt: serverTimestamp()
    });
    
    await this.logActivity({
      lead_id: leadId,
      user_id: userId,
      action: "Callback Scheduled",
      details: `Scheduled for ${format(callbackAt, 'MMM d, h:mm a')}`
    });
  },

  async addNote(leadId: string, userId: string, content: string) {
    await addDoc(collection(db, "notes"), {
      lead_id: leadId,
      user_id: userId,
      content,
      createdAt: serverTimestamp()
    });
    await this.logActivity({
      lead_id: leadId,
      user_id: userId,
      action: "Note Added",
      details: "Added a new note"
    });
  },

  async bulkUpdateLeadsStatus(leadIds: string[], status: string, userId: string) {
    const BATCH_SIZE = 500;
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;
    const now = new Date();

    for (const id of leadIds) {
      const docRef = doc(db, LEADS_COL, id);
      currentBatch.update(docRef, { status, updatedAt: now });
      count++;

      if (count === BATCH_SIZE) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);

    this.logActivity({
      user_id: userId,
      action: "Bulk Status Change",
      details: `Updated ${leadIds.length} leads to ${status}`
    }).catch(() => {});
  },

  async distributeLeads(leadIds: string[], agentIds: string[], userId: string, agentNamesMap?: Record<string, string>) {
    const distributionSummary: Record<string, number> = {};
    
    const BATCH_SIZE = 500;
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;
    const now = new Date();

    for (let i = 0; i < leadIds.length; i++) {
      const id = leadIds[i];
      const agentId = agentIds[i % agentIds.length];
      
      const docRef = doc(db, LEADS_COL, id);
      currentBatch.update(docRef, { 
        assigned_to: agentId, 
        updatedAt: now 
      });
      
      if (agentNamesMap) {
        const agentName = agentNamesMap[agentId] || agentId;
        distributionSummary[agentName] = (distributionSummary[agentName] || 0) + 1;
      }
      
      count++;

      if (count === BATCH_SIZE) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);

    this.logActivity({
      user_id: userId,
      action: "Bulk Distribution",
      details: `Distributed ${leadIds.length} leads.`
    }).catch(() => {});
    
    return distributionSummary;
  },

  async bulkDeleteLeads(leadIds: string[], userId: string) {
    try {
      const response = await fetch('/api/leads/delete-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: leadIds, userId })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.code || 'Failed to delete selected leads');
      }
      return data;
    } catch (error: any) {
      console.error('bulkDeleteLeads error:', error);
      throw error;
    }
  },

  async deleteAllLeads(userId: string) {
    try {
      const response = await fetch('/api/leads/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.code || 'Failed to delete all leads');
      }
      return data;
    } catch (error: any) {
      console.error('deleteAllLeads error:', error);
      throw error;
    }
  },


  // Finance / Deposit workflow
  async getFinanceSolutions(includeInactive = false) {
    const snap = await getDocs(collection(db, FINANCE_SOLUTIONS_COL));

    return snap.docs
      .map(solutionDoc => ({ id: solutionDoc.id, ...solutionDoc.data() } as any))
      .filter((solution: any) => includeInactive || solution.isActive !== false)
      .sort((a: any, b: any) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      );
  },

  async createFinanceSolution(name: string, userId: string) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Solution name is required.');

    const currentUser = await this.getUser(String(userId || ''));
    if (!currentUser || currentUser.role !== 'Administrator') {
      throw new Error('Only Administrators can create finance solutions.');
    }

    const existing = await this.getFinanceSolutions(true);
    const duplicate = existing.find(
      (solution: any) =>
        String(solution.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicate) {
      if (duplicate.isActive === false) {
        await updateDoc(doc(db, FINANCE_SOLUTIONS_COL, duplicate.id), {
          isActive: true,
          updatedAt: serverTimestamp(),
          updatedBy: String(userId)
        });
        return { ...duplicate, isActive: true };
      }
      throw new Error('A solution with this name already exists.');
    }

    const ref = await addDoc(collection(db, FINANCE_SOLUTIONS_COL), {
      name: cleanName,
      isActive: true,
      createdBy: String(userId),
      createdByName: currentUser.name || currentUser.email || 'Administrator',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { id: ref.id, name: cleanName, isActive: true };
  },

  async setFinanceSolutionActive(solutionId: string, isActive: boolean, userId: string) {
    const currentUser = await this.getUser(String(userId || ''));
    if (!currentUser || currentUser.role !== 'Administrator') {
      throw new Error('Only Administrators can manage finance solutions.');
    }

    await updateDoc(doc(db, FINANCE_SOLUTIONS_COL, String(solutionId)), {
      isActive: !!isActive,
      updatedBy: String(userId),
      updatedAt: serverTimestamp()
    });
  },

  async submitFinanceDeposit(payload: any, userId: string) {
    if (!userId) throw new Error('Current user is required.');

    const submitter = await this.getUser(String(userId));
    if (!submitter) throw new Error('Current CRM user was not found.');
    if (String(submitter.role || '') !== 'Agent') {
      throw new Error('Only Agents can submit deposits from the Agent portfolio form.');
    }

    const amount = Number(payload?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0.');
    }

    const depositType =
      String(payload?.depositType || 'Received') === 'On Solution'
        ? 'On Solution'
        : 'Received';

    let selectedSolution: any = null;
    let expectedArrivalDays = 0;
    let expectedArrivalDate: any = null;

    if (depositType === 'On Solution') {
      const solutionId = String(payload?.solutionId || '').trim();
      if (!solutionId) throw new Error('Please select a solution.');

      const solutionSnap = await getDoc(doc(db, FINANCE_SOLUTIONS_COL, solutionId));
      if (!solutionSnap.exists()) {
        throw new Error('Selected solution no longer exists.');
      }

      selectedSolution = { id: solutionSnap.id, ...solutionSnap.data() } as any;
      if (selectedSolution.isActive === false) {
        throw new Error('Selected solution is currently disabled.');
      }

      if (!String(payload?.solutionFullName || '').trim()) {
        throw new Error('Solution Full Name is required.');
      }

      if (!String(payload?.solutionPaymentComment || '').trim()) {
        throw new Error('Solution payment comment is required.');
      }

      expectedArrivalDays = Math.max(
        1,
        Math.floor(Number(payload?.expectedArrivalDays || 0))
      );

      if (!expectedArrivalDays) {
        throw new Error('Expected arrival days must be at least 1.');
      }

      const baseDate = payload?.depositDate
        ? new Date(`${String(payload.depositDate)}T12:00:00`)
        : new Date();

      if (Number.isNaN(baseDate.getTime())) {
        throw new Error('Invalid deposit date.');
      }

      const expected = new Date(baseDate);
      expected.setDate(expected.getDate() + expectedArrivalDays);
      expectedArrivalDate = Timestamp.fromDate(expected);
    }

    const allUsers = await this.getUsers();
    const userMap = new Map(allUsers.map((user: any) => [String(user.id), user]));
    const rawSplits = Array.isArray(payload?.splits) ? payload.splits : [];
    const splitMap = new Map<string, number>();

    rawSplits.forEach((split: any) => {
      const splitUserId = String(split?.userId || '').trim();
      const percentage = Number(split?.percentage || 0);

      if (!splitUserId || splitUserId === String(userId) || percentage <= 0) return;
      if (!userMap.has(splitUserId)) {
        throw new Error('One of the selected Split With users no longer exists.');
      }

      splitMap.set(
        splitUserId,
        Number(splitMap.get(splitUserId) || 0) + percentage
      );
    });

    const totalSplitPercentage = Array.from(splitMap.values())
      .reduce((sum, value) => sum + value, 0);

    if (totalSplitPercentage > 100.0001) {
      throw new Error('Split percentages cannot exceed 100%.');
    }

    const submitterPercentage = Math.max(0, 100 - totalSplitPercentage);
    const creditedAgentName =
      String(payload?.agentName || submitter.name || '').trim() ||
      submitter.name ||
      submitter.email ||
      'Agent';

    const allocations: any[] = [{
      userId: String(userId),
      userName: creditedAgentName,
      systemUserName: submitter.name || submitter.email || 'Agent',
      role: submitter.role || 'Agent',
      percentage: Number(submitterPercentage.toFixed(4)),
      amount: Number(((amount * submitterPercentage) / 100).toFixed(2)),
      type: 'owner'
    }];

    splitMap.forEach((percentage, splitUserId) => {
      const splitUser: any = userMap.get(splitUserId);
      allocations.push({
        userId: splitUserId,
        userName: splitUser?.name || splitUser?.email || splitUserId,
        systemUserName: splitUser?.name || splitUser?.email || splitUserId,
        role: splitUser?.role || 'Agent',
        percentage: Number(Number(percentage).toFixed(4)),
        amount: Number(((amount * Number(percentage)) / 100).toFixed(2)),
        type: 'split'
      });
    });

    const participantIds = Array.from(
      new Set(allocations.map(allocation => String(allocation.userId)))
    );

    const initialStatus =
      depositType === 'On Solution' ? 'Solution Pending' : 'Pending';

    const financePayload = sanitizeData({
      clientFullName: String(payload?.clientFullName || '').trim(),
      country: String(payload?.country || '').trim(),
      email: String(payload?.email || '').trim(),
      phoneNumber: String(payload?.phoneNumber || '').trim(),
      walletAddress: String(payload?.walletAddress || '').trim(),
      amount,
      crypto: String(payload?.crypto || '').trim(),
      cryptoOther: String(payload?.cryptoOther || '').trim(),
      depositDate: String(payload?.depositDate || '').trim(),
      leadSourceId: String(payload?.leadSourceId || '').trim(),
      retName: String(payload?.retName || '').trim(),
      agentName: creditedAgentName,

      depositType,
      solutionId: selectedSolution?.id || '',
      solutionName: selectedSolution?.name || '',
      solutionFullName: String(payload?.solutionFullName || '').trim(),
      solutionPaymentComment: String(payload?.solutionPaymentComment || '').trim(),
      expectedArrivalDays,
      expectedArrivalDate,
      arrivalStatus: depositType === 'On Solution' ? 'Not Arrived' : '',
      arrivalRequestedAt: null,
      arrivedAt: null,
      arrivalRejectReason: '',

      submittedBy: String(userId),
      submittedByName: submitter.name || submitter.email || 'Agent',
      submittedByEmail: submitter.email || '',
      submittedByRole: submitter.role || 'Agent',
      teamId: submitter.teamId || '',
      teamName: submitter.teamName || '',

      allocations,
      participantIds,
      totalSplitPercentage: Number(totalSplitPercentage.toFixed(4)),
      submitterPercentage: Number(submitterPercentage.toFixed(4)),

      status: initialStatus,
      approvedBy: '',
      approvedByName: '',
      approvedAt: null,
      rejectedBy: '',
      rejectedByName: '',
      rejectedAt: null,
      rejectReason: '',

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      submittedAt: serverTimestamp()
    });

    const depositRef = await addDoc(
      collection(db, FINANCE_DEPOSITS_COL),
      financePayload
    );

    await addDoc(collection(db, FINANCE_AUDIT_COL), {
      depositId: depositRef.id,
      action: depositType === 'On Solution' ? 'Solution Created' : 'Created',
      changedBy: String(userId),
      changedByName: submitter.name || submitter.email || 'Agent',
      oldValue: null,
      newValue: {
        status: initialStatus,
        depositType,
        solutionName: selectedSolution?.name || '',
        amount,
        allocations
      },
      createdAt: serverTimestamp()
    });

    const approvers = allUsers.filter((candidate: any) => {
      const role = String(candidate.role || '');
      if (['Administrator', 'Manager', 'Financial Manager'].includes(role)) {
        return true;
      }

      return (
        role === 'Team Leader' &&
        !!submitter.teamId &&
        String(candidate.teamId || '') === String(submitter.teamId)
      );
    });

    const uniqueApprovers = Array.from(
      new Map(
        approvers.map((approver: any) => [String(approver.id), approver])
      ).values()
    );

    const pendingTitle =
      depositType === 'On Solution'
        ? 'Solution Approval Required'
        : 'Deposit Approval Required';

    const pendingMessage =
      depositType === 'On Solution'
        ? `${submitter.name || 'Agent'} sent $${amount.toLocaleString()} through ${selectedSolution?.name || 'a solution'} and requested approval.`
        : `${submitter.name || 'Agent'} submitted $${amount.toLocaleString()} for approval.`;

    await Promise.all(
      uniqueApprovers
        .filter((approver: any) => String(approver.id) !== String(userId))
        .map((approver: any) =>
          addDoc(collection(db, NOTIFICATIONS_COL), {
            user_id: String(approver.id),
            type:
              depositType === 'On Solution'
                ? 'finance_solution_pending'
                : 'finance_deposit_pending',
            title: pendingTitle,
            message: pendingMessage,
            finance_deposit_id: depositRef.id,
            read: false,
            createdAt: serverTimestamp()
          })
        )
    );

    return { id: depositRef.id, ...financePayload };
  },

  async getFinanceDepositsForUser(user: any) {
    const currentUserId = String(user?.id || '');
    if (!currentUserId) return [];

    const currentUser = await this.getUser(currentUserId);
    if (!currentUser) return [];

    const role = String(currentUser.role || '');
    if (!['Administrator', 'Manager', 'Team Leader', 'Financial Manager'].includes(role)) {
      return [];
    }

    let snap;

    if (role === 'Team Leader') {
      if (!currentUser.teamId) return [];

      snap = await getDocs(
        query(
          collection(db, FINANCE_DEPOSITS_COL),
          where('teamId', '==', String(currentUser.teamId)),
          limit(300)
        )
      );
    } else {
      snap = await getDocs(
        query(collection(db, FINANCE_DEPOSITS_COL), limit(300))
      );
    }

    return snap.docs
      .map(depositDoc => ({ id: depositDoc.id, ...depositDoc.data() } as any))
      .sort((a: any, b: any) => {
        const aDate = a.submittedAt?.toDate
          ? a.submittedAt.toDate()
          : new Date(a.submittedAt || 0);
        const bDate = b.submittedAt?.toDate
          ? b.submittedAt.toDate()
          : new Date(b.submittedAt || 0);
        return bDate.getTime() - aDate.getTime();
      });
  },

  async getFinancePortfolio(userId: string) {
    const empty: any = {
      submittedApprovedGross: 0,
      approvedAttributed: 0,
      splitEarnings: 0,
      pendingAttributed: 0,
      rejectedAttributed: 0,
      onSolutionAttributed: 0,
      arrivalPendingAttributed: 0,
      solutionPendingAttributed: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      onSolutionCount: 0,
      arrivalPendingCount: 0,
      solutionPendingCount: 0,
      records: []
    };

    if (!userId) return empty;

    const snap = await getDocs(
      query(
        collection(db, FINANCE_DEPOSITS_COL),
        where('participantIds', 'array-contains', String(userId)),
        limit(300)
      )
    );

    const totals: any = { ...empty };

    const records = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a: any, b: any) => {
        const aDate = a.submittedAt?.toDate
          ? a.submittedAt.toDate()
          : new Date(a.submittedAt || 0);
        const bDate = b.submittedAt?.toDate
          ? b.submittedAt.toDate()
          : new Date(b.submittedAt || 0);
        return bDate.getTime() - aDate.getTime();
      });

    records.forEach((deposit: any) => {
      const allocation = (
        Array.isArray(deposit.allocations) ? deposit.allocations : []
      ).find((item: any) => String(item.userId) === String(userId));

      const attributedAmount = Number(allocation?.amount || 0);
      const status = String(deposit.status || 'Pending');

      if (status === 'Approved') {
        totals.approvedAttributed += attributedAmount;
        totals.approvedCount++;

        if (String(deposit.submittedBy || '') === String(userId)) {
          totals.submittedApprovedGross += Number(deposit.amount || 0);
        } else {
          totals.splitEarnings += attributedAmount;
        }
      } else if (status === 'Rejected') {
        totals.rejectedAttributed += attributedAmount;
        totals.rejectedCount++;
      } else if (status === 'On Solution') {
        totals.onSolutionAttributed += attributedAmount;
        totals.onSolutionCount++;
      } else if (status === 'Arrival Pending') {
        totals.arrivalPendingAttributed += attributedAmount;
        totals.arrivalPendingCount++;
      } else if (status === 'Solution Pending') {
        totals.solutionPendingAttributed += attributedAmount;
        totals.solutionPendingCount++;
      } else {
        totals.pendingAttributed += attributedAmount;
        totals.pendingCount++;
      }
    });

    [
      'submittedApprovedGross',
      'approvedAttributed',
      'splitEarnings',
      'pendingAttributed',
      'rejectedAttributed',
      'onSolutionAttributed',
      'arrivalPendingAttributed',
      'solutionPendingAttributed'
    ].forEach(key => {
      totals[key] = Number(Number(totals[key] || 0).toFixed(2));
    });

    totals.records = records.slice(0, 100);
    return totals;
  },

  async markFinanceSolutionArrived(depositId: string, userId: string) {
    if (!depositId || !userId) throw new Error('Deposit and Agent are required.');

    const currentUser = await this.getUser(String(userId));
    if (!currentUser || currentUser.role !== 'Agent') {
      throw new Error('Only the submitting Agent can mark a solution as arrived.');
    }

    const depositRef = doc(db, FINANCE_DEPOSITS_COL, String(depositId));
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) throw new Error('Finance record was not found.');

    const deposit = depositSnap.data() as any;

    if (String(deposit.submittedBy || '') !== String(userId)) {
      throw new Error('Only the Agent who submitted this record can mark it as arrived.');
    }

    if (String(deposit.status || '') !== 'On Solution') {
      throw new Error('Only an approved On Solution record can be marked as arrived.');
    }

    await updateDoc(depositRef, {
      status: 'Arrival Pending',
      arrivalStatus: 'Pending',
      arrivalRequestedAt: serverTimestamp(),
      arrivalRejectReason: '',
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, FINANCE_AUDIT_COL), {
      depositId: String(depositId),
      action: 'Marked Arrived',
      changedBy: String(userId),
      changedByName: currentUser.name || currentUser.email || 'Agent',
      oldValue: { status: 'On Solution' },
      newValue: { status: 'Arrival Pending' },
      createdAt: serverTimestamp()
    });

    const allUsers = await this.getUsers();
    const approvers = allUsers.filter((candidate: any) => {
      const role = String(candidate.role || '');

      if (['Administrator', 'Manager', 'Financial Manager'].includes(role)) {
        return true;
      }

      return (
        role === 'Team Leader' &&
        !!deposit.teamId &&
        String(candidate.teamId || '') === String(deposit.teamId)
      );
    });

    const uniqueApprovers = Array.from(
      new Map(
        approvers.map((approver: any) => [String(approver.id), approver])
      ).values()
    );

    await Promise.all(
      uniqueApprovers.map((approver: any) =>
        addDoc(collection(db, NOTIFICATIONS_COL), {
          user_id: String(approver.id),
          type: 'finance_arrival_pending',
          title: 'Solution Arrival Confirmation',
          message: `${currentUser.name || 'Agent'} marked $${Number(deposit.amount || 0).toLocaleString()} from ${deposit.solutionName || 'solution'} as arrived. Please confirm.`,
          finance_deposit_id: String(depositId),
          read: false,
          createdAt: serverTimestamp()
        })
      )
    );
  },

  async reviewFinanceDeposit(
    depositId: string,
    reviewerId: string,
    decision: 'Approved' | 'Rejected',
    rejectReason = ''
  ) {
    if (!depositId || !reviewerId) {
      throw new Error('Deposit and reviewer are required.');
    }

    if (!['Approved', 'Rejected'].includes(decision)) {
      throw new Error('Invalid finance decision.');
    }

    const reviewer = await this.getUser(String(reviewerId));
    if (!reviewer) throw new Error('Reviewer was not found.');

    const role = String(reviewer.role || '');
    if (!['Administrator', 'Manager', 'Team Leader', 'Financial Manager'].includes(role)) {
      throw new Error('You do not have permission to approve or reject deposits.');
    }

    if (decision === 'Rejected' && !String(rejectReason || '').trim()) {
      throw new Error('Reject reason is required.');
    }

    const depositRef = doc(db, FINANCE_DEPOSITS_COL, String(depositId));
    const auditRef = doc(collection(db, FINANCE_AUDIT_COL));
    const celebrationRef = doc(collection(db, FINANCE_CELEBRATIONS_COL));
    let reviewedDeposit: any = null;
    let shouldCelebrate = false;
    let reviewAction = decision;

    await runTransaction(db, async transaction => {
      const depositSnap = await transaction.get(depositRef);
      if (!depositSnap.exists()) throw new Error('Deposit was not found.');

      const deposit = depositSnap.data() as any;
      const currentStatus = String(deposit.status || 'Pending');

      if (!['Pending', 'Solution Pending', 'Arrival Pending'].includes(currentStatus)) {
        throw new Error(`This finance record is already ${currentStatus}.`);
      }

      if (
        role === 'Team Leader' &&
        String(deposit.teamId || '') !== String(reviewer.teamId || '')
      ) {
        throw new Error('Team Leaders can review deposits only for their own team.');
      }

      const before = {
        status: currentStatus,
        approvedBy: deposit.approvedBy || '',
        rejectedBy: deposit.rejectedBy || '',
        arrivalStatus: deposit.arrivalStatus || ''
      };

      let updatePayload: any = {};

      if (currentStatus === 'Pending') {
        reviewAction = decision;

        updatePayload =
          decision === 'Approved'
            ? {
                status: 'Approved',
                approvedBy: String(reviewerId),
                approvedByName: reviewer.name || reviewer.email || role,
                approvedAt: serverTimestamp(),
                rejectedBy: '',
                rejectedByName: '',
                rejectedAt: null,
                rejectReason: '',
                updatedAt: serverTimestamp()
              }
            : {
                status: 'Rejected',
                rejectedBy: String(reviewerId),
                rejectedByName: reviewer.name || reviewer.email || role,
                rejectedAt: serverTimestamp(),
                rejectReason: String(rejectReason || '').trim(),
                approvedBy: '',
                approvedByName: '',
                approvedAt: null,
                updatedAt: serverTimestamp()
              };

        shouldCelebrate = decision === 'Approved';
      } else if (currentStatus === 'Solution Pending') {
        reviewAction =
          decision === 'Approved' ? 'Solution Approved' : 'Solution Rejected';

        updatePayload =
          decision === 'Approved'
            ? {
                status: 'On Solution',
                solutionApprovedBy: String(reviewerId),
                solutionApprovedByName: reviewer.name || reviewer.email || role,
                solutionApprovedAt: serverTimestamp(),
                rejectedBy: '',
                rejectedByName: '',
                rejectedAt: null,
                rejectReason: '',
                updatedAt: serverTimestamp()
              }
            : {
                status: 'Rejected',
                rejectedBy: String(reviewerId),
                rejectedByName: reviewer.name || reviewer.email || role,
                rejectedAt: serverTimestamp(),
                rejectReason: String(rejectReason || '').trim(),
                updatedAt: serverTimestamp()
              };
      } else {
        reviewAction =
          decision === 'Approved' ? 'Arrival Approved' : 'Arrival Rejected';

        updatePayload =
          decision === 'Approved'
            ? {
                status: 'Approved',
                arrivalStatus: 'Approved',
                arrivedAt: serverTimestamp(),
                approvedBy: String(reviewerId),
                approvedByName: reviewer.name || reviewer.email || role,
                approvedAt: serverTimestamp(),
                arrivalRejectReason: '',
                rejectReason: '',
                updatedAt: serverTimestamp()
              }
            : {
                status: 'On Solution',
                arrivalStatus: 'Rejected',
                arrivalRejectReason: String(rejectReason || '').trim(),
                arrivalRejectedBy: String(reviewerId),
                arrivalRejectedByName: reviewer.name || reviewer.email || role,
                arrivalRejectedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };

        shouldCelebrate = decision === 'Approved';
      }

      transaction.update(depositRef, updatePayload);

      transaction.set(auditRef, {
        depositId: String(depositId),
        action: reviewAction,
        changedBy: String(reviewerId),
        changedByName: reviewer.name || reviewer.email || role,
        oldValue: before,
        newValue: {
          status: updatePayload.status,
          arrivalStatus: updatePayload.arrivalStatus || '',
          rejectReason:
            decision === 'Rejected' ? String(rejectReason || '').trim() : ''
        },
        createdAt: serverTimestamp()
      });

      if (shouldCelebrate) {
        transaction.set(celebrationRef, {
          depositId: String(depositId),
          teamId: deposit.teamId || '',
          teamName: deposit.teamName || '',
          agentName: deposit.agentName || deposit.submittedByName || 'Agent',
          amount: Number(deposit.amount || 0),
          createdAt: serverTimestamp()
        });
      }

      reviewedDeposit = {
        id: depositSnap.id,
        ...deposit,
        ...updatePayload
      };
    });

    if (!reviewedDeposit) throw new Error('Finance review failed.');

    const participantIds = Array.from(
      new Set(
        [
          String(reviewedDeposit.submittedBy || ''),
          ...(Array.isArray(reviewedDeposit.participantIds)
            ? reviewedDeposit.participantIds.map((id: any) => String(id))
            : [])
        ].filter(Boolean)
      )
    );

    const statusAfter = String(reviewedDeposit.status || '');
    const isSolutionApproval = reviewAction === 'Solution Approved';
    const isSolutionReject = reviewAction === 'Solution Rejected';
    const isArrivalApproval = reviewAction === 'Arrival Approved';
    const isArrivalReject = reviewAction === 'Arrival Rejected';

    let title = 'Deposit Updated';
    let message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} finance record was updated.`;

    if (isSolutionApproval) {
      title = 'Solution Approved';
      message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} on ${reviewedDeposit.solutionName || 'solution'} is now On Solution.`;
    } else if (isSolutionReject) {
      title = 'Solution Rejected';
      message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} solution request was rejected. Reason: ${String(rejectReason || '').trim()}`;
    } else if (isArrivalApproval) {
      title = 'Arrival Approved 🎉';
      message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} from ${reviewedDeposit.solutionName || 'solution'} was confirmed as received.`;
    } else if (isArrivalReject) {
      title = 'Arrival Not Confirmed';
      message = `Arrival confirmation for $${Number(reviewedDeposit.amount || 0).toLocaleString()} was rejected. It remains On Solution. Reason: ${String(rejectReason || '').trim()}`;
    } else if (statusAfter === 'Approved') {
      title = 'Deposit Approved 🎉';
      message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} deposit was approved by ${reviewer.name || role}.`;
    } else if (statusAfter === 'Rejected') {
      title = 'Deposit Rejected';
      message = `$${Number(reviewedDeposit.amount || 0).toLocaleString()} deposit was rejected. Reason: ${String(rejectReason || '').trim()}`;
    }

    await Promise.all(
      participantIds.map(participantId =>
        addDoc(collection(db, NOTIFICATIONS_COL), {
          user_id: participantId,
          type: 'finance_status_update',
          title,
          message,
          finance_deposit_id: String(depositId),
          read: false,
          createdAt: serverTimestamp()
        })
      )
    );

    return reviewedDeposit;
  },

  async getFinanceAuditLogs(userId: string) {
    if (!userId) return [];

    const currentUser = await this.getUser(String(userId));
    if (!currentUser || currentUser.role !== 'Administrator') return [];

    const snap = await getDocs(
      query(
        collection(db, FINANCE_AUDIT_COL),
        orderBy('createdAt', 'desc'),
        limit(100)
      )
    );

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async resetSystem(userId: string) {
    try {
      const response = await fetch('/api/admin/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.code || 'Failed to reset system');
      }
      return data;
    } catch (error: any) {
      console.error('resetSystem error:', error);
      throw error;
    }
  },

  async reshuffleLeads(agentIds: string[], userId: string, statusFilter: string[]) {
    if (!userId) {
      throw new Error('Current user is required.');
    }

    const requestedAgentIds = Array.from(
      new Set((agentIds || []).map(id => String(id)).filter(Boolean))
    );

    if (requestedAgentIds.length === 0) {
      throw new Error('Select at least one Agent to receive leads.');
    }

    const currentUser = await this.getUser(String(userId));
    if (!currentUser) {
      throw new Error('Current user was not found.');
    }

    const currentRole = String(currentUser.role || 'Agent').trim();

    if (!['Administrator', 'Manager', 'Team Leader'].includes(currentRole)) {
      throw new Error('You do not have permission to reshuffle leads.');
    }

    const normalizedStatuses = Array.from(
      new Set((statusFilter || []).map(status => String(status)).filter(Boolean))
    );

    let allowedRecipientIds = new Set<string>();
    let visibleLeadAssigneeIds: Set<string> | null = null;
    let recipientUsers: any[] = [];

    if (currentRole === 'Team Leader') {
      const teamId = String(currentUser.teamId || '');

      if (!teamId) {
        throw new Error('Your Team Leader account is not assigned to a team.');
      }

      const teamUsers = await this.getUsersByTeam(teamId);

      recipientUsers = teamUsers.filter(
        (member: any) => String(member.role || '') === 'Agent'
      );

      allowedRecipientIds = new Set(
        recipientUsers.map((member: any) => String(member.id))
      );

      visibleLeadAssigneeIds = new Set(
        teamUsers
          .filter((member: any) =>
            ['Agent', 'Team Leader'].includes(String(member.role || ''))
          )
          .map((member: any) => String(member.id))
      );
    } else {
      const allUsers = await this.getUsers();

      recipientUsers = allUsers.filter((member: any) =>
        ['Agent', 'Team Leader'].includes(String(member.role || ''))
      );

      allowedRecipientIds = new Set(
        recipientUsers.map((member: any) => String(member.id))
      );
    }

    const invalidRecipientId = requestedAgentIds.find(
      agentId => !allowedRecipientIds.has(agentId)
    );

    if (invalidRecipientId) {
      if (currentRole === 'Team Leader') {
        throw new Error('Team Leaders can reshuffle leads only to Agents in their own team.');
      }
      throw new Error('One or more selected recipients are not valid.');
    }

    // PERFORMANCE FIX: Team Leaders should never download the whole company
    // lead collection just to reshuffle their own team. Query only team assignees.
    let rawLeadDocs: any[] = [];

    if (currentRole === 'Team Leader' && visibleLeadAssigneeIds) {
      const scopedSnapshots = await Promise.all(
        Array.from(visibleLeadAssigneeIds).map(assigneeId =>
          getDocs(query(collection(db, LEADS_COL), where("assigned_to", "==", assigneeId)))
        )
      );
      rawLeadDocs = scopedSnapshots.flatMap(snapshot => snapshot.docs);
    } else {
      const snap = await getDocs(collection(db, LEADS_COL));
      rawLeadDocs = snap.docs;
    }

    const seenLeadIds = new Set<string>();
    let eligibleLeads = rawLeadDocs
      .filter((leadDoc: any) => {
        if (seenLeadIds.has(leadDoc.id)) return false;
        seenLeadIds.add(leadDoc.id);
        return true;
      })
      .map((leadDoc: any) => ({ id: leadDoc.id, ...leadDoc.data() } as any))
      .filter((lead: any) => {
        const assignedTo = String(lead.assigned_to || '');

        if (!assignedTo) return false;

        if (
          normalizedStatuses.length > 0 &&
          !normalizedStatuses.includes(String(lead.status || ''))
        ) {
          return false;
        }

        if (
          currentRole === 'Team Leader' &&
          visibleLeadAssigneeIds &&
          !visibleLeadAssigneeIds.has(assignedTo)
        ) {
          return false;
        }

        return true;
      });

    if (eligibleLeads.length === 0) {
      return 0;
    }

    // TRUE shuffle: randomize both leads and recipients.
    // The previous round-robin could recreate the exact same assignments and
    // visually look like "nothing happened".
    const shuffle = <T,>(items: T[]): T[] => {
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    eligibleLeads = shuffle(eligibleLeads);
    const shuffledRecipients = shuffle(requestedAgentIds);

    const recipientNameMap: Record<string, string> = {};
    recipientUsers.forEach((member: any) => {
      recipientNameMap[String(member.id)] =
        member.name || member.email || String(member.id);
    });

    // Keep distribution balanced while strongly preferring a DIFFERENT agent
    // for every lead. With two or more recipients, a lead will not stay on the
    // same agent unless there is no valid alternative.
    const assignmentCounts: Record<string, number> = {};
    shuffledRecipients.forEach(id => {
      assignmentCounts[id] = 0;
    });

    const assignments = eligibleLeads.map((lead: any) => {
      const currentAgentId = String(lead.assigned_to || '');

      const candidates = shuffledRecipients
        .filter(id => shuffledRecipients.length === 1 || id !== currentAgentId)
        .sort((a, b) => {
          const countDiff = (assignmentCounts[a] || 0) - (assignmentCounts[b] || 0);
          if (countDiff !== 0) return countDiff;
          return Math.random() - 0.5;
        });

      const nextAgentId =
        candidates[0] ||
        shuffledRecipients[0];

      assignmentCounts[nextAgentId] =
        (assignmentCounts[nextAgentId] || 0) + 1;

      return {
        lead,
        oldAgentId: currentAgentId,
        agentId: nextAgentId
      };
    });

    const changedAssignments = assignments.filter(
      assignment => assignment.oldAgentId !== assignment.agentId
    );

    // If only one recipient is selected and every lead is already assigned to
    // that recipient, there is genuinely nothing to change.
    if (changedAssignments.length === 0) {
      return 0;
    }

    const BATCH_SIZE = 500;
    const commits: Promise<void>[] = [];
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const assignment of changedAssignments) {
      batch.update(doc(db, LEADS_COL, String(assignment.lead.id)), {
        assigned_to: assignment.agentId,
        updatedAt: serverTimestamp()
      });

      batchCount++;

      if (batchCount === BATCH_SIZE) {
        commits.push(batch.commit());
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      commits.push(batch.commit());
    }

    await Promise.all(commits);

    // Preserve the full per-lead History trail, but write it in Firestore
    // batches instead of hundreds of individual addDoc network round trips.
    let historyBatch = writeBatch(db);
    let historyBatchCount = 0;
    const historyCommits: Promise<void>[] = [];

    for (const { lead, oldAgentId, agentId } of changedAssignments) {
      const historyRef = doc(collection(db, "history"));
      historyBatch.set(historyRef, {
        lead_id: lead.id,
        user_id: userId,
        action: "Reshuffled",
        details:
          `Lead reshuffled from ${recipientNameMap[oldAgentId] || oldAgentId || 'Unassigned'} ` +
          `to ${recipientNameMap[agentId] || agentId}`,
        createdAt: serverTimestamp()
      });

      historyBatchCount++;
      if (historyBatchCount === 500) {
        historyCommits.push(historyBatch.commit());
        historyBatch = writeBatch(db);
        historyBatchCount = 0;
      }
    }

    if (historyBatchCount > 0) {
      historyCommits.push(historyBatch.commit());
    }

    await Promise.all(historyCommits);

    return changedAssignments.length;
  },

  // Activity / History
  async logActivity(activityData: any) {
    const sanitized = sanitizeData(activityData);
    await addDoc(collection(db, "history"), {
      ...sanitized,
      createdAt: serverTimestamp()
    });
  },

  async getHistory(agentId?: string) {
    let q = query(collection(db, "history"), orderBy("createdAt", "desc"), limit(100));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Notifications
  async getNotifications(userId: string) {
    const q = query(
      collection(db, NOTIFICATIONS_COL),
      where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(n => !n.read)
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
  },

  async createNotification(notification: any) {
    await addDoc(collection(db, NOTIFICATIONS_COL), {
      ...notification,
      read: false,
      createdAt: serverTimestamp()
    });
  },

  async markNotificationRead(id: string) {
    await updateDoc(doc(db, NOTIFICATIONS_COL, id), { read: true });
  },

  // Role/team-aware lead scope. Existing permissions are preserved.
  async getLeadsForUser(user: any) {
    if (!user?.id) return [];

    const freshUser = await this.getUser(String(user.id));
    const effectiveUser = freshUser || user;
    const role = String(effectiveUser.role || 'Agent').trim();

    if (role === 'Agent') {
      return await this.getLeads(String(effectiveUser.id));
    }

    if (role === 'Team Leader') {
      const teamId = effectiveUser.teamId || '';
      if (!teamId) return [];

      const teamUsers = await this.getUsersByTeam(teamId);
      const allowedUserIds = Array.from(new Set(
        teamUsers
          .filter((member: any) => ['Agent', 'Team Leader'].includes(member.role))
          .map((member: any) => String(member.id))
          .filter(Boolean)
      ));

      if (allowedUserIds.length === 0) return [];

      // PERFORMANCE FIX:
      // Do not download every lead in the company and filter it in the browser.
      // Query only leads assigned to members of this Team. Using one equality
      // query per member avoids Firestore `in` limits and composite-index setup.
      const snapshots = await Promise.all(
        allowedUserIds.map(memberId =>
          getDocs(query(collection(db, LEADS_COL), where("assigned_to", "==", memberId)))
        )
      );

      const seen = new Set<string>();
      const teamLeads: any[] = [];

      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(docSnap => {
          if (seen.has(docSnap.id)) return;
          seen.add(docSnap.id);
          const data = docSnap.data();
          teamLeads.push({
            id: docSnap.id,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            country: data.country || '',
            status: data.status || 'New',
            source: data.source || '',
            assigned_to: data.assigned_to || '',
            importId: data.importId || '',
            importFileName: data.importFileName || '',
            callbackAt: data.callbackAt || null,
            createdBy: data.createdBy || '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null
          });
        });
      });

      return teamLeads.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
    }

    // Administrator and Manager keep their organization-wide view.
    return await this.getLeads();
  },

  // Role/team-aware access for a single lead.
  // Prevents Team Leaders and Agents from opening leads outside their scope.
  async getLeadForUser(id: string, user: any) {
    if (!id) throw new Error('Lead is required.');
    if (!user?.id) throw new Error('Access denied.');

    const freshUser = await this.getUser(String(user.id));
    const effectiveUser = freshUser || user;
    const role = String(effectiveUser.role || 'Agent').trim();

    const lead = await this.getLead(id);

    if (role === 'Administrator' || role === 'Manager') {
      return lead;
    }

    if (role === 'Agent') {
      if (String((lead as any).assigned_to || '') !== String(effectiveUser.id)) {
        throw new Error('ACCESS_DENIED_LEAD');
      }
      return lead;
    }

    if (role === 'Team Leader') {
      const teamId = String(effectiveUser.teamId || '');
      if (!teamId) {
        throw new Error('ACCESS_DENIED_LEAD');
      }

      const teamUsers = await this.getUsersByTeam(teamId);
      const allowedUserIds = new Set(
        teamUsers
          .filter((member: any) => ['Agent', 'Team Leader'].includes(member.role))
          .map((member: any) => String(member.id))
      );

      if (!allowedUserIds.has(String((lead as any).assigned_to || ''))) {
        throw new Error('ACCESS_DENIED_LEAD');
      }

      return lead;
    }

    throw new Error('ACCESS_DENIED_LEAD');
  },


  // Shift / Attendance tracking
  _getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  async getTodayShift(userId: string, dateKey?: string) {
    if (!userId) return null;

    const key = dateKey || this._getLocalDateKey();
    const shiftId = `${userId}_${key}`;
    const snap = await getDoc(doc(db, SHIFT_SESSIONS_COL, shiftId));

    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async setWorkStatus(userId: string, status: 'ready' | 'break' | 'ended') {
    if (!userId) throw new Error('User is required.');

    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found.');

    if (user.role !== 'Agent') {
      throw new Error('Shift controls are available only for Agent users.');
    }

    const now = new Date();
    const dateKey = this._getLocalDateKey(now);
    const shiftId = `${userId}_${dateKey}`;
    const shiftRef = doc(db, SHIFT_SESSIONS_COL, shiftId);
    const shiftSnap = await getDoc(shiftRef);
    const current = shiftSnap.exists() ? (shiftSnap.data() as any) : null;

    if (!current) {
      if (status !== 'ready') {
        throw new Error('Start the shift with Ready to Work first.');
      }

      await setDoc(shiftRef, {
        userId,
        userName: user.name || '',
        userEmail: user.email || '',
        teamId: user.teamId || '',
        teamName: user.teamName || '',
        dateKey,
        status: 'ready',
        shiftStart: Timestamp.fromDate(now),
        shiftEnd: null,
        currentBreakStart: null,
        totalBreakMs: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, WORK_EVENTS_COL), {
        userId,
        userName: user.name || '',
        teamId: user.teamId || '',
        teamName: user.teamName || '',
        dateKey,
        type: 'ready',
        createdAt: Timestamp.fromDate(now)
      });

      return await this.getTodayShift(userId, dateKey);
    }

    if (current.status === 'ended') {
      throw new Error('Today\'s shift has already ended.');
    }

    if (status === current.status) {
      return { id: shiftId, ...current };
    }

    if (status === 'break') {
      if (current.status !== 'ready') {
        throw new Error('You can start a break only while Ready to Work.');
      }

      await updateDoc(shiftRef, {
        status: 'break',
        currentBreakStart: Timestamp.fromDate(now),
        updatedAt: serverTimestamp()
      });
    }

    if (status === 'ready') {
      if (current.status === 'break') {
        const breakStart = current.currentBreakStart?.toDate
          ? current.currentBreakStart.toDate()
          : new Date(current.currentBreakStart || now);

        const breakMs = Math.max(0, now.getTime() - breakStart.getTime());

        await updateDoc(shiftRef, {
          status: 'ready',
          currentBreakStart: null,
          totalBreakMs: Number(current.totalBreakMs || 0) + breakMs,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (status === 'ended') {
      let totalBreakMs = Number(current.totalBreakMs || 0);

      if (current.status === 'break' && current.currentBreakStart) {
        const breakStart = current.currentBreakStart?.toDate
          ? current.currentBreakStart.toDate()
          : new Date(current.currentBreakStart);
        totalBreakMs += Math.max(0, now.getTime() - breakStart.getTime());
      }

      await updateDoc(shiftRef, {
        status: 'ended',
        shiftEnd: Timestamp.fromDate(now),
        currentBreakStart: null,
        totalBreakMs,
        updatedAt: serverTimestamp()
      });
    }

    await addDoc(collection(db, WORK_EVENTS_COL), {
      userId,
      userName: user.name || '',
      teamId: user.teamId || '',
      teamName: user.teamName || '',
      dateKey,
      type: status,
      createdAt: Timestamp.fromDate(now)
    });

    return await this.getTodayShift(userId, dateKey);
  },

  async getShiftEvents(userId: string, dateKey?: string) {
    if (!userId) return [];

    const key = dateKey || this._getLocalDateKey();
    const snap = await getDocs(
      query(
        collection(db, WORK_EVENTS_COL),
        where('userId', '==', userId)
      )
    );

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((event: any) => event.dateKey === key)
      .sort((a: any, b: any) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return aTime - bTime;
      });
  },

  async getWorkLogs(viewer: any, dateKey?: string) {
    if (!viewer?.id) return [];

    const freshViewer = await this.getUser(String(viewer.id));
    const effectiveViewer = freshViewer || viewer;
    const role = String(effectiveViewer.role || 'Agent');
    const key = dateKey || this._getLocalDateKey();

    const [users, shiftsSnap] = await Promise.all([
      this.getUsers(),
      getDocs(collection(db, SHIFT_SESSIONS_COL))
    ]);

    let allowedUsers = users as any[];

    if (role === 'Agent') {
      allowedUsers = allowedUsers.filter((u: any) => String(u.id) === String(effectiveViewer.id));
    } else if (role === 'Team Leader') {
      allowedUsers = allowedUsers.filter(
        (u: any) => u.role === 'Agent' && String(u.teamId || '') === String(effectiveViewer.teamId || '')
      );
    } else if (!['Administrator', 'Manager'].includes(role)) {
      return [];
    }

    const allowedIds = new Set(allowedUsers.map((u: any) => String(u.id)));

    const shifts = shiftsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((shift: any) => shift.dateKey === key && allowedIds.has(String(shift.userId)));

    const shiftMap = new Map(shifts.map((shift: any) => [String(shift.userId), shift]));

    return allowedUsers
      .filter((u: any) => u.role === 'Agent')
      .map((user: any) => {
        const shift: any = shiftMap.get(String(user.id)) || null;
        return {
          user,
          shift
        };
      })
      .sort((a: any, b: any) => String(a.user.name).localeCompare(String(b.user.name)));
  },

  // Dashboard
  async getDashboardStats(user: any, timeRange: '1d' | '1w' | '1m' | 'all' = 'all') {
    // Load users once. The old version loaded users and then called getLeadsForUser(),
    // which could read the current user/team again. This version reuses allUsers.
    const usersSnap = await getDocs(collection(db, USERS_COL));
    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const currentUser =
      allUsers.find((u: any) => String(u.id) === String(user?.id)) ||
      user ||
      {};

    const currentRole = String(currentUser.role || 'Agent').trim();
    const currentTeamId = String(currentUser.teamId || '');

    let visibleUsers = allUsers as any[];
    let leadLoader: Promise<any[]>;

    if (currentRole === 'Agent') {
      visibleUsers = allUsers.filter(
        (u: any) => String(u.id) === String(currentUser.id)
      );
      leadLoader = this.getLeads(String(currentUser.id));
    } else if (currentRole === 'Team Leader') {
      if (!currentTeamId) {
        visibleUsers = [currentUser].filter(Boolean);
        leadLoader = Promise.resolve([]);
      } else {
        visibleUsers = allUsers.filter(
          (u: any) => String(u.teamId || '') === currentTeamId
        );

        const allowedUserIds = Array.from(
          new Set(
            visibleUsers
              .filter((member: any) =>
                ['Agent', 'Team Leader'].includes(String(member.role || ''))
              )
              .map((member: any) => String(member.id))
              .filter(Boolean)
          )
        );

        leadLoader = (async () => {
          if (allowedUserIds.length === 0) return [];

          const snapshots = await Promise.all(
            allowedUserIds.map(memberId =>
              getDocs(
                query(
                  collection(db, LEADS_COL),
                  where("assigned_to", "==", memberId)
                )
              )
            )
          );

          const seen = new Set<string>();
          const rows: any[] = [];

          snapshots.forEach(snapshot => {
            snapshot.docs.forEach(docSnap => {
              if (seen.has(docSnap.id)) return;
              seen.add(docSnap.id);

              const data = docSnap.data();
              rows.push({
                id: docSnap.id,
                name: data.name || '',
                email: data.email || '',
                phone: data.phone || '',
                country: data.country || '',
                status: data.status || 'New',
                source: data.source || '',
                assigned_to: data.assigned_to || '',
                importId: data.importId || '',
                importFileName: data.importFileName || '',
                callbackAt: data.callbackAt || null,
                createdBy: data.createdBy || '',
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
              });
            });
          });

          return rows;
        })();
      }
    } else {
      // Administrator / Manager preserve organization-wide visibility.
      leadLoader = this.getLeads();
    }

    const todayKey = this._getLocalDateKey();

    // Independent dashboard resources are loaded in parallel so the additional
    // analytics do not serialize extra network waits.
    const [scopedLeads, historySnap, todayShiftsSnap, importsSnap] = await Promise.all([
      leadLoader,
      getDocs(query(collection(db, "history"), orderBy("createdAt", "desc"), limit(100))),
      getDocs(query(collection(db, SHIFT_SESSIONS_COL), where("dateKey", "==", todayKey))),
      getDocs(collection(db, IMPORTS_COL))
    ]);

    const allLeads = scopedLeads as any[];

    const normalizeStatus = (value: any) => {
      const raw = String(value || 'New').trim();
      const key = raw.toLowerCase().replace(/\s+/g, ' ');

      const canonical: Record<string, string> = {
        'new': 'New',
        'vm': 'VM',
        'no answer': 'No answer',
        'deposit': 'Deposit',
        'callback': 'Callback',
        'low potential': 'Low Potential',
        'high potential': 'High Potential',
        'no potential': 'No Potential',
        'language barrier': 'Language Barrier',
        'wrong person': 'Wrong Person',
        'underage': 'Underage',
        'no experience': 'No Experience',
        'not interested': 'Not Interested',
        'hung up': 'Hung Up',
        'hang up': 'Hung Up',
        'wrong number': 'Wrong Number',
        'drop': 'Drop',
        'jor': 'JOR',
        'lost': 'Lost'
      };

      return canonical[key] || raw;
    };

    const toDate = (value: any) => {
      if (!value) return null;
      const date = value?.toDate ? value.toDate() : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const normalizedLeads = allLeads.map((lead: any) => ({
      ...lead,
      status: normalizeStatus(lead.status)
    }));

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let startDate = new Date(0);
    let prevStartDate = new Date(0);
    let prevEndDate = new Date(0);

    if (timeRange === '1d') {
      startDate = new Date(today);
      prevStartDate = new Date(today);
      prevStartDate.setDate(prevStartDate.getDate() - 1);
      prevEndDate = new Date(today);
    } else if (timeRange === '1w') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate);
    } else if (timeRange === '1m') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      prevStartDate = new Date(startDate);
      prevStartDate.setMonth(prevStartDate.getMonth() - 1);
      prevEndDate = new Date(startDate);
    }

    const getLeadsInPeriod = (
      leadsList: any[],
      start: Date,
      end: Date = new Date()
    ) => {
      return leadsList.filter((lead: any) => {
        const created = toDate(lead.createdAt);
        return !!created && created >= start && created < end;
      });
    };

    const currentLeads =
      timeRange === 'all'
        ? normalizedLeads
        : getLeadsInPeriod(normalizedLeads, startDate);

    const previousLeads =
      timeRange === 'all'
        ? []
        : getLeadsInPeriod(normalizedLeads, prevStartDate, prevEndDate);

    const terminalStatuses = new Set([
      'Deposit',
      'Lost',
      'No Potential',
      'JOR'
    ]);

    const calculateStats = (leadsList: any[]) => ({
      total: leadsList.length,
      active: leadsList.filter(
        (lead: any) => !terminalStatuses.has(lead.status)
      ).length,
      converted: leadsList.filter(
        (lead: any) => lead.status === 'Deposit'
      ).length,
      lost: leadsList.filter(
        (lead: any) => ['Lost', 'No Potential'].includes(lead.status)
      ).length
    });

    const currentStats = calculateStats(currentLeads);
    const previousStats = calculateStats(previousLeads);

    const getChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const callbacksToday = normalizedLeads.filter((lead: any) => {
      const callback = toDate(lead.callbackAt);
      return !!callback && callback >= today && callback < tomorrow;
    }).length;

    const overdueCallbacks = normalizedLeads.filter((lead: any) => {
      const callback = toDate(lead.callbackAt);
      return !!callback && callback < now && lead.status === 'Callback';
    }).length;

    const unassigned = normalizedLeads.filter(
      (lead: any) => !String(lead.assigned_to || '').trim()
    ).length;

    const untouched24h = normalizedLeads.filter((lead: any) => {
      if (terminalStatuses.has(lead.status)) return false;
      const updated = toDate(lead.updatedAt) || toDate(lead.createdAt);
      return !!updated && now.getTime() - updated.getTime() >= 24 * 60 * 60 * 1000;
    }).length;

    const stale7d = normalizedLeads.filter((lead: any) => {
      if (terminalStatuses.has(lead.status)) return false;
      const updated = toDate(lead.updatedAt) || toDate(lead.createdAt);
      return !!updated && now.getTime() - updated.getTime() >= 7 * 24 * 60 * 60 * 1000;
    }).length;

    const jor = currentLeads.filter((lead: any) => lead.status === 'JOR').length;
    const highPotential = currentLeads.filter(
      (lead: any) => lead.status === 'High Potential'
    ).length;

    const stats: any = {
      total: currentStats.total,
      totalChange: getChange(currentStats.total, previousStats.total),
      newToday: normalizedLeads.filter((lead: any) => {
        const created = toDate(lead.createdAt);
        return !!created && created >= today;
      }).length,
      active: currentStats.active,
      activeChange: getChange(currentStats.active, previousStats.active),
      converted: currentStats.converted,
      convertedChange: getChange(currentStats.converted, previousStats.converted),
      lost: currentStats.lost,
      lostChange: getChange(currentStats.lost, previousStats.lost),
      duplicates: 0,
      jor,
      highPotential,
      callbacksToday,
      overdueCallbacks,
      unassigned,
      untouched24h,
      stale7d,
      leadsByStatus: [],
      usersByRole: [],
      topSources: [],
      sourceAnalytics: [],
      agentPerformance: [],
      teamPerformance: [],
      teamMembers: [],
      dailyFlow: [],
      criticalAlerts: [],
      attendance: {
        totalAgents: 0,
        ready: 0,
        break: 0,
        ended: 0,
        notStarted: 0
      },
      financeReady: false
    };

    // -------------------------
    // Status normalization / distribution.
    // -------------------------
    const statusMap: Record<string, number> = {};
    currentLeads.forEach((lead: any) => {
      statusMap[lead.status] = (statusMap[lead.status] || 0) + 1;
    });

    stats.leadsByStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // -------------------------
    // Role quality / configuration.
    // -------------------------
    const roleMap: Record<string, number> = {};
    visibleUsers.forEach((u: any) => {
      const role = String(u.role || 'Undefined').trim() || 'Undefined';
      roleMap[role] = (roleMap[role] || 0) + 1;
    });

    stats.usersByRole = Object.entries(roleMap)
      .map(([role, count]) => ({ role, count }))
      .sort((a: any, b: any) => b.count - a.count);

    stats.misconfiguredUsers = Number(roleMap['Undefined'] || 0);

    // -------------------------
    // Import filename resolution.
    // New imports carry importFileName directly. Old imports are resolved
    // from the already-parallelized imports snapshot without extra requests.
    // -------------------------
    const importNameMap = new Map<string, string>();
    importsSnap.docs.forEach(importDoc => {
      const data = importDoc.data() as any;
      importNameMap.set(
        String(importDoc.id),
        String(data.fileName || `Import ${importDoc.id}`)
      );
    });

    const fileNameForLead = (lead: any) => {
      if (lead.importFileName) return String(lead.importFileName);
      if (lead.importId && importNameMap.has(String(lead.importId))) {
        return String(importNameMap.get(String(lead.importId)));
      }
      return 'Manual / Legacy';
    };

    // -------------------------
    // Source -> File -> Status analytics.
    // -------------------------
    const sourceBuckets = new Map<string, any>();

    currentLeads.forEach((lead: any) => {
      const source = String(lead.source || 'Unknown').trim() || 'Unknown';
      const fileName = fileNameForLead(lead);

      if (!sourceBuckets.has(source)) {
        sourceBuckets.set(source, {
          source,
          count: 0,
          statuses: {} as Record<string, number>,
          files: new Map<string, any>()
        });
      }

      const sourceBucket = sourceBuckets.get(source);
      sourceBucket.count++;
      sourceBucket.statuses[lead.status] =
        (sourceBucket.statuses[lead.status] || 0) + 1;

      if (!sourceBucket.files.has(fileName)) {
        sourceBucket.files.set(fileName, {
          fileName,
          count: 0,
          statuses: {} as Record<string, number>,
          leadIds: [] as string[]
        });
      }

      const fileBucket = sourceBucket.files.get(fileName);
      fileBucket.count++;
      fileBucket.statuses[lead.status] =
        (fileBucket.statuses[lead.status] || 0) + 1;
      fileBucket.leadIds.push(String(lead.id));
    });

    const qualityScore = (statuses: Record<string, number>, total: number) => {
      if (!total) return 0;

      const positive =
        Number(statuses['Deposit'] || 0) * 3 +
        Number(statuses['High Potential'] || 0) * 2 +
        Number(statuses['Callback'] || 0);

      const negative =
        Number(statuses['Wrong Number'] || 0) * 2 +
        Number(statuses['No answer'] || 0) +
        Number(statuses['Hung Up'] || 0) +
        Number(statuses['Drop'] || 0);

      const raw = 50 + ((positive - negative) / total) * 50;
      return Math.max(0, Math.min(100, Math.round(raw)));
    };

    stats.sourceAnalytics = Array.from(sourceBuckets.values())
      .map((bucket: any) => {
        const files = Array.from(bucket.files.values())
          .map((file: any) => ({
            fileName: file.fileName,
            count: file.count,
            qualityScore: qualityScore(file.statuses, file.count),
            statuses: Object.entries(file.statuses)
              .map(([status, count]) => ({ status, count }))
              .sort((a: any, b: any) => b.count - a.count),
            leadIds: file.leadIds
          }))
          .sort((a: any, b: any) => b.count - a.count);

        return {
          source: bucket.source,
          count: bucket.count,
          qualityScore: qualityScore(bucket.statuses, bucket.count),
          statuses: Object.entries(bucket.statuses)
            .map(([status, count]) => ({ status, count }))
            .sort((a: any, b: any) => b.count - a.count),
          files
        };
      })
      .sort((a: any, b: any) => b.count - a.count);

    stats.topSources = stats.sourceAnalytics.slice(0, 5);

    // -------------------------
    // Agent operational performance.
    // Revenue ranking will replace/extend this after Finance module is added.
    // -------------------------
    const agents = visibleUsers.filter(
      (u: any) => String(u.role || '') === 'Agent'
    );

    stats.agentPerformance = agents
      .map((agent: any) => {
        const agentLeads = currentLeads.filter(
          (lead: any) => String(lead.assigned_to) === String(agent.id)
        );

        const deposits = agentLeads.filter(
          (lead: any) => lead.status === 'Deposit'
        ).length;

        const high = agentLeads.filter(
          (lead: any) => lead.status === 'High Potential'
        ).length;

        const callbacks = agentLeads.filter(
          (lead: any) => lead.status === 'Callback'
        ).length;

        return {
          id: agent.id,
          name: agent.name || agent.email || 'Agent',
          avatar: agent.avatar || `https://i.pravatar.cc/150?u=${agent.id}`,
          teamId: agent.teamId || '',
          teamName: agent.teamName || '',
          total: agentLeads.length,
          deposits,
          highPotential: high,
          callbacks,
          conversionRate: agentLeads.length
            ? Math.round((deposits / agentLeads.length) * 1000) / 10
            : 0,
          revenue: null
        };
      })
      .sort((a: any, b: any) => {
        if (b.deposits !== a.deposits) return b.deposits - a.deposits;
        if (b.conversionRate !== a.conversionRate) {
          return b.conversionRate - a.conversionRate;
        }
        return b.highPotential - a.highPotential;
      })
      .slice(0, 10);

    // Backward-compatible field: existing UI/code that still reads workload
    // will continue working until Dashboard.tsx is updated.
    stats.workload = stats.agentPerformance.map((agent: any) => ({
      name: agent.name,
      new_leads: 0,
      in_progress: Math.max(0, agent.total - agent.deposits),
      completed: agent.deposits,
      total: agent.total
    }));

    // -------------------------
    // Team performance.
    // -------------------------
    const teams = new Map<string, any>();

    visibleUsers
      .filter((u: any) => ['Agent', 'Team Leader'].includes(String(u.role || '')))
      .forEach((member: any) => {
        const teamId = String(member.teamId || 'unassigned-team');
        const teamName = String(member.teamName || 'No Team');

        if (!teams.has(teamId)) {
          teams.set(teamId, {
            teamId,
            teamName,
            memberIds: new Set<string>(),
            agentCount: 0
          });
        }

        const bucket = teams.get(teamId);
        bucket.memberIds.add(String(member.id));
        if (member.role === 'Agent') bucket.agentCount++;
      });

    stats.teamPerformance = Array.from(teams.values())
      .map((team: any) => {
        const teamLeads = currentLeads.filter((lead: any) =>
          team.memberIds.has(String(lead.assigned_to || ''))
        );

        const deposits = teamLeads.filter(
          (lead: any) => lead.status === 'Deposit'
        ).length;

        const high = teamLeads.filter(
          (lead: any) => lead.status === 'High Potential'
        ).length;

        const lostCount = teamLeads.filter((lead: any) =>
          ['Lost', 'No Potential'].includes(lead.status)
        ).length;

        return {
          teamId: team.teamId,
          teamName: team.teamName,
          agents: team.agentCount,
          leads: teamLeads.length,
          deposits,
          highPotential: high,
          lost: lostCount,
          conversionRate: teamLeads.length
            ? Math.round((deposits / teamLeads.length) * 1000) / 10
            : 0
        };
      })
      .sort((a: any, b: any) => {
        if (b.deposits !== a.deposits) return b.deposits - a.deposits;
        return b.conversionRate - a.conversionRate;
      });

    // -------------------------
    // Attendance snapshot.
    // -------------------------
    const shiftMap = new Map<string, any>();
    todayShiftsSnap.docs.forEach(shiftDoc => {
      const shift = { id: shiftDoc.id, ...shiftDoc.data() } as any;
      shiftMap.set(String(shift.userId), shift);
    });

    const visibleAgents = visibleUsers.filter(
      (u: any) => String(u.role || '') === 'Agent'
    );

    stats.attendance.totalAgents = visibleAgents.length;

    visibleAgents.forEach((agent: any) => {
      const shift = shiftMap.get(String(agent.id));

      if (!shift) {
        stats.attendance.notStarted++;
      } else if (shift.status === 'ready') {
        stats.attendance.ready++;
      } else if (shift.status === 'break') {
        stats.attendance.break++;
      } else if (shift.status === 'ended') {
        stats.attendance.ended++;
      } else {
        stats.attendance.notStarted++;
      }
    });

    // Keep existing Team Leader agent cards.
    if (currentRole === 'Team Leader') {
      stats.teamMembers = visibleAgents
        .map((member: any) => ({
          id: member.id,
          name: member.name || member.email || 'Agent',
          email: member.email || '',
          avatar: member.avatar || `https://i.pravatar.cc/150?u=${member.id}`,
          isOnline: !!member.isOnline,
          lastSeen: member.lastSeen || null,
          shift: shiftMap.get(String(member.id)) || null
        }))
        .sort((a: any, b: any) =>
          String(a.name).localeCompare(String(b.name))
        );
    }

    // -------------------------
    // Daily lead flow. Limit graph cardinality to a practical recent window.
    // -------------------------
    const flowStart = new Date(now);

    if (timeRange === '1d') {
      flowStart.setHours(0, 0, 0, 0);
    } else if (timeRange === '1w') {
      flowStart.setDate(flowStart.getDate() - 6);
      flowStart.setHours(0, 0, 0, 0);
    } else if (timeRange === '1m') {
      flowStart.setDate(flowStart.getDate() - 29);
      flowStart.setHours(0, 0, 0, 0);
    } else {
      flowStart.setDate(flowStart.getDate() - 13);
      flowStart.setHours(0, 0, 0, 0);
    }

    const flowMap = new Map<string, number>();
    const cursor = new Date(flowStart);

    while (cursor <= now) {
      flowMap.set(this._getLocalDateKey(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    normalizedLeads.forEach((lead: any) => {
      const created = toDate(lead.createdAt);
      if (!created || created < flowStart) return;

      const key = this._getLocalDateKey(created);
      if (flowMap.has(key)) {
        flowMap.set(key, Number(flowMap.get(key) || 0) + 1);
      }
    });

    stats.dailyFlow = Array.from(flowMap.entries()).map(([date, count]) => ({
      date,
      label: date.slice(5),
      count
    }));

    // -------------------------
    // Critical alerts.
    // -------------------------
    if (unassigned > 0) {
      stats.criticalAlerts.push({
        type: 'unassigned',
        severity: 'high',
        label: 'Unassigned Leads',
        count: unassigned,
        detail: 'Leads currently have no assigned user.'
      });
    }

    if (overdueCallbacks > 0) {
      stats.criticalAlerts.push({
        type: 'overdue-callbacks',
        severity: 'high',
        label: 'Overdue Callbacks',
        count: overdueCallbacks,
        detail: 'Callback time has passed while status is still Callback.'
      });
    }

    if (untouched24h > 0) {
      stats.criticalAlerts.push({
        type: 'untouched',
        severity: 'medium',
        label: 'Untouched 24h+',
        count: untouched24h,
        detail: 'Active leads have not been updated for at least 24 hours.'
      });
    }

    if (stats.attendance.notStarted > 0) {
      stats.criticalAlerts.push({
        type: 'shift-not-started',
        severity: 'medium',
        label: 'Shift Not Started',
        count: stats.attendance.notStarted,
        detail: 'Visible Agents have no shift record for today.'
      });
    }

    if (stats.misconfiguredUsers > 0) {
      stats.criticalAlerts.push({
        type: 'user-config',
        severity: 'medium',
        label: 'User Configuration',
        count: stats.misconfiguredUsers,
        detail: 'Users have an undefined role and should be reviewed.'
      });
    }

    // -------------------------
    // Recent CRM activity with existing visibility rules.
    // -------------------------
    const visibleUserIds = new Set(
      visibleUsers.map((u: any) => String(u.id))
    );

    const visibleLeadIds = new Set(
      normalizedLeads.map((lead: any) => String(lead.id))
    );

    const recentActivity = historySnap.docs
      .map(d => {
        const data = d.data();
        const activityUser = allUsers.find(
          (u: any) => String(u.id) === String(data.user_id)
        ) as any;

        return {
          id: d.id,
          ...data,
          userName: activityUser?.name || 'Unknown User'
        };
      })
      .filter((activity: any) => {
        if (currentRole === 'Administrator' || currentRole === 'Manager') {
          return true;
        }

        if (currentRole === 'Agent') {
          return (
            String(activity.user_id || '') === String(currentUser.id) ||
            (activity.lead_id &&
              visibleLeadIds.has(String(activity.lead_id)))
          );
        }

        if (currentRole === 'Team Leader') {
          return (
            visibleUserIds.has(String(activity.user_id || '')) ||
            (activity.lead_id &&
              visibleLeadIds.has(String(activity.lead_id)))
          );
        }

        return false;
      })
      .slice(0, 10);

    stats.recentActivity = recentActivity;

    stats.scope =
      currentRole === 'Team Leader'
        ? {
            type: 'team',
            teamId: currentTeamId,
            teamName: currentUser.teamName || ''
          }
        : currentRole === 'Agent'
          ? { type: 'agent', userId: currentUser.id }
          : { type: 'organization' };

    return stats;
  }
};
