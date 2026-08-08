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
  writeBatch
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

    const teamLeaderships = await getDocs(
      query(collection(db, TEAMS_COL), where("teamLeaderId", "==", oldUserId))
    );

    await Promise.all(
      teamLeaderships.docs.map(teamDoc =>
        updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderId: newUserId,
          teamLeaderName: userName || '',
          updatedAt: serverTimestamp()
        })
      )
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
    // a Team Leader. The teams collection is authoritative for leadership.
    let leadershipTeamDoc: any = null;
    let leadershipSourceId = '';

    for (const candidateId of candidateIds) {
      const leadershipSnap = await getDocs(
        query(collection(db, TEAMS_COL), where("teamLeaderId", "==", candidateId))
      );

      if (!leadershipSnap.empty) {
        leadershipTeamDoc = leadershipSnap.docs[0];
        leadershipSourceId = candidateId;
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

        // Only auto-repair an empty leader slot or a duplicate UID for the same
        // email/profile. Never steal a team from a different valid leader.
        const currentLeaderId = String(teamData.teamLeaderId || '');
        const canRepair =
          !currentLeaderId ||
          currentLeaderId === uid ||
          candidateIds.includes(currentLeaderId);

        if (canRepair) {
          await updateDoc(doc(db, TEAMS_COL, teamId), {
            teamLeaderId: uid,
            teamLeaderName: preferred.name || exactData?.name || '',
            updatedAt: serverTimestamp()
          });

          teamName = teamData.name || teamName || '';
        } else {
          // Another real leader owns the team. Do not manufacture leadership.
          role = exactData?.role && exactData.role !== 'Team Leader'
            ? exactData.role
            : 'Agent';
          teamId = exactData?.teamId || '';
          teamName = exactData?.teamName || '';
        }
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

    // Reassert the Team Leader relationship after reference migration.
    if (role === 'Team Leader' && teamId) {
      const teamSnap = await getDoc(doc(db, TEAMS_COL, teamId));
      if (teamSnap.exists()) {
        const teamData = teamSnap.data() as any;
        const currentLeaderId = String(teamData.teamLeaderId || '');

        if (!currentLeaderId || currentLeaderId === uid || candidateIds.includes(currentLeaderId)) {
          await updateDoc(doc(db, TEAMS_COL, teamId), {
            teamLeaderId: uid,
            teamLeaderName: canonicalData.name || '',
            updatedAt: serverTimestamp()
          });
        }
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

    const currentLeadershipQuery = query(
      collection(db, TEAMS_COL),
      where("teamLeaderId", "==", id)
    );
    const currentLeadershipSnap = await getDocs(currentLeadershipQuery);

    if (finalRole !== 'Team Leader' || !nextTeamId) {
      const clearPromises = currentLeadershipSnap.docs.map(teamDoc =>
        updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderId: '',
          teamLeaderName: '',
          updatedAt: serverTimestamp()
        })
      );
      await Promise.all(clearPromises);
    } else {
      const clearOtherLeaderships = currentLeadershipSnap.docs
        .filter(teamDoc => teamDoc.id !== nextTeamId)
        .map(teamDoc =>
          updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
            teamLeaderId: '',
            teamLeaderName: '',
            updatedAt: serverTimestamp()
          })
        );
      await Promise.all(clearOtherLeaderships);
    }

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
    const leadershipQuery = query(
      collection(db, TEAMS_COL),
      where("teamLeaderId", "==", id)
    );
    const leadershipSnap = await getDocs(leadershipQuery);

    await Promise.all(
      leadershipSnap.docs.map(teamDoc =>
        updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
          teamLeaderId: '',
          teamLeaderName: '',
          updatedAt: serverTimestamp()
        })
      )
    );

    await deleteDoc(doc(db, USERS_COL, id));
  },

  // Teams
  async getTeams() {
    const snapshot = await getDocs(collection(db, TEAMS_COL));

    return snapshot.docs
      .map(teamDoc => {
        const data = teamDoc.data();
        return {
          id: teamDoc.id,
          name: data.name || '',
          teamLeaderId: data.teamLeaderId || '',
          teamLeaderName: data.teamLeaderName || '',
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

    const data = teamDoc.data();

    return {
      id: teamDoc.id,
      name: data.name || '',
      teamLeaderId: data.teamLeaderId || '',
      teamLeaderName: data.teamLeaderName || '',
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
      teamLeaderId: '',
      teamLeaderName: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return {
      id: teamRef.id,
      name: cleanName,
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

    const otherLeaderships = await getDocs(
      query(collection(db, TEAMS_COL), where("teamLeaderId", "==", leaderId))
    );

    await Promise.all(
      otherLeaderships.docs
        .filter(teamDoc => teamDoc.id !== teamId)
        .map(teamDoc =>
          updateDoc(doc(db, TEAMS_COL, teamDoc.id), {
            teamLeaderId: '',
            teamLeaderName: '',
            updatedAt: serverTimestamp()
          })
        )
    );

    if (team.teamLeaderId && team.teamLeaderId !== leaderId) {
      const oldLeaderSnap = await getDoc(doc(db, USERS_COL, team.teamLeaderId));

      if (oldLeaderSnap.exists()) {
        const oldLeaderData = oldLeaderSnap.data();

        await updateDoc(doc(db, USERS_COL, team.teamLeaderId), {
          ...(oldLeaderData.role === 'Team Leader' ? { role: 'Agent' } : {}),
          teamId,
          teamName: team.name
        });
      }
    }

    await updateDoc(doc(db, USERS_COL, leaderId), {
      role: 'Team Leader',
      teamId,
      teamName: team.name
    });

    await updateDoc(doc(db, TEAMS_COL, teamId), {
      teamLeaderId: leaderId,
      teamLeaderName: leader.name,
      updatedAt: serverTimestamp()
    });

    return {
      teamId,
      leaderId,
      leaderName: leader.name
    };
  },

  async clearTeamLeader(teamId: string) {
    const team = await this.getTeam(teamId);
    if (!team) return;

    if (team.teamLeaderId) {
      const leaderSnap = await getDoc(doc(db, USERS_COL, team.teamLeaderId));

      if (leaderSnap.exists()) {
        const leaderData = leaderSnap.data();

        await updateDoc(doc(db, USERS_COL, team.teamLeaderId), {
          ...(leaderData.role === 'Team Leader' ? { role: 'Agent' } : {}),
          teamId,
          teamName: team.name
        });
      }
    }

    await updateDoc(doc(db, TEAMS_COL, teamId), {
      teamLeaderId: '',
      teamLeaderName: '',
      updatedAt: serverTimestamp()
    });
  },

  // Leads
  async getLeads(agentId?: string) {
    try {
      const q = query(collection(db, LEADS_COL), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const allLeads = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          country: data.country || '',
          status: data.status || 'New',
          source: data.source || '',
          assigned_to: data.assigned_to || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
      
      if (agentId) {
        return allLeads.filter((lead: any) => String(lead.assigned_to) === String(agentId));
      }
      
      return allLeads;
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        throw new Error('Firebase storage limit reached. Please wait for reset or upgrade plan.');
      }
      console.error('Error fetching leads:', err);

      const q = query(collection(db, LEADS_COL));
      const querySnapshot = await getDocs(q);
      const allLeads = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          country: data.country || '',
          status: data.status || 'New',
          source: data.source || '',
          assigned_to: data.assigned_to || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
      
      let filtered = allLeads;
      if (agentId) {
        filtered = allLeads.filter((lead: any) => String(lead.assigned_to) === String(agentId));
      }
      
      return filtered.sort((a: any, b: any) => {
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
    let q = query(collection(db, LEADS_COL), where("assigned_to", "!=", null));
    if (statusFilter.length > 0) {
      q = query(collection(db, LEADS_COL), where("status", "in", statusFilter));
    }
    const snap = await getDocs(q);
    const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    if (leads.length === 0) return 0;

    let agentIndex = 0;
    const promises = leads.map(async (lead: any) => {
      const agentId = agentIds[agentIndex];
      const agent = (await getDocs(query(collection(db, USERS_COL), where("__name__", "==", agentId)))).docs[0]?.data();
      
      await updateDoc(doc(db, LEADS_COL, lead.id), { assigned_to: agentId, updatedAt: serverTimestamp() });
      await this.logActivity({
        lead_id: lead.id,
        user_id: userId,
        action: "Reshuffled",
        details: `Lead reshuffled to ${agent?.name || 'Unknown'}`
      });
      
      agentIndex = (agentIndex + 1) % agentIds.length;
    });
    await Promise.all(promises);
    return leads.length;
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

  // Role/team-aware lead scope. Existing getLeads() remains unchanged.
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
      const allowedUserIds = new Set(
        teamUsers
          .filter((member: any) => ['Agent', 'Team Leader'].includes(member.role))
          .map((member: any) => String(member.id))
      );

      const allLeads = await this.getLeads();
      return (allLeads as any[]).filter((lead: any) =>
        allowedUserIds.has(String(lead.assigned_to || ''))
      );
    }

    // Administrator and Manager keep their existing organization-wide view.
    return await this.getLeads();
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
    const usersSnap = await getDocs(collection(db, USERS_COL));
    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Always trust the current Firestore user record over stale localStorage data.
    const currentUser = allUsers.find((u: any) => String(u.id) === String(user?.id)) || user || {};
    const currentRole = String(currentUser.role || 'Agent').trim();
    const currentTeamId = currentUser.teamId || '';

    const leadsSnap = await getDocs(collection(db, LEADS_COL));
    const allLeads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    let visibleUsers = allUsers;
    let filteredLeads = allLeads;

    if (currentRole === 'Agent') {
      visibleUsers = allUsers.filter((u: any) => String(u.id) === String(currentUser.id));
      filteredLeads = allLeads.filter((l: any) => String(l.assigned_to) === String(currentUser.id));
    } else if (currentRole === 'Team Leader') {
      if (!currentTeamId) {
        visibleUsers = [currentUser].filter(Boolean);
        filteredLeads = [];
      } else {
        visibleUsers = allUsers.filter((u: any) => String(u.teamId || '') === String(currentTeamId));
        const teamMemberIds = new Set(
          visibleUsers
            .filter((u: any) => ['Agent', 'Team Leader'].includes(u.role))
            .map((u: any) => String(u.id))
        );
        filteredLeads = allLeads.filter((l: any) =>
          teamMemberIds.has(String(l.assigned_to || ''))
        );
      }
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const getLeadsInPeriod = (leadsList: any[], start: Date, end: Date = new Date()) => {
      return leadsList.filter(l => {
        const created = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt || 0);
        return created >= start && created < end;
      });
    };

    const currentLeads = timeRange === 'all' ? filteredLeads : getLeadsInPeriod(filteredLeads, startDate);
    const previousLeads = timeRange === 'all' ? [] : getLeadsInPeriod(filteredLeads, prevStartDate, prevEndDate);

    const calculateStats = (leadsList: any[]) => {
      return {
        total: leadsList.length,
        active: leadsList.filter(l => !['Deposit', 'Lost', 'No Potential'].includes(l.status)).length,
        converted: leadsList.filter(l => l.status === 'Deposit').length,
        lost: leadsList.filter(l => ['Lost', 'No Potential'].includes(l.status)).length,
      };
    };

    const currentStats = calculateStats(currentLeads);
    const previousStats = calculateStats(previousLeads);

    const getChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const stats = {
      total: currentStats.total,
      totalChange: getChange(currentStats.total, previousStats.total),
      newToday: filteredLeads.filter(l => {
        const created = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt || 0);
        return created >= today;
      }).length,
      active: currentStats.active,
      activeChange: getChange(currentStats.active, previousStats.active),
      converted: currentStats.converted,
      convertedChange: getChange(currentStats.converted, previousStats.converted),
      lost: currentStats.lost,
      lostChange: getChange(currentStats.lost, previousStats.lost),
      duplicates: 0,
      leadsByStatus: [] as any[],
      usersByRole: [] as any[],
      topSources: [] as any[],
      workload: [] as any[],
      teamMembers: [] as any[]
    };

    const statusMap: any = {};
    currentLeads.forEach(l => {
      statusMap[l.status] = (statusMap[l.status] || 0) + 1;
    });
    stats.leadsByStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // Team Leader sees only roles inside their own team.
    const roleMap: any = {};
    visibleUsers.forEach((u: any) => {
      const role = u.role || 'Undefined';
      roleMap[role] = (roleMap[role] || 0) + 1;
    });
    stats.usersByRole = Object.entries(roleMap)
      .map(([role, count]) => ({ role, count }))
      .sort((a: any, b: any) => b.count - a.count);

    const sourceMap: any = {};
    currentLeads.forEach(l => {
      if (l.source) {
        sourceMap[l.source] = (sourceMap[l.source] || 0) + 1;
      }
    });
    stats.topSources = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);

    // "Top Agent Workload" stays agent-only; Team Leader sees only agents in their team.
    const agents = visibleUsers.filter((u: any) => u.role === 'Agent');
    stats.workload = agents.map((agent: any) => {
      const agentLeads = currentLeads.filter(l => String(l.assigned_to) === String(agent.id));
      return {
        name: agent.name,
        new_leads: agentLeads.filter(l => l.status === 'New').length,
        in_progress: agentLeads.filter(l => !['New', 'Deposit', 'Lost', 'No Potential'].includes(l.status)).length,
        completed: agentLeads.filter(l => l.status === 'Deposit').length,
        total: agentLeads.length
      };
    })
    .sort((a: any, b: any) => b.total - a.total)
    .slice(0, 5);

    // Team Leader gets a concrete list of their own agents for the dashboard.
    // Administrators/Managers keep the existing dashboard behaviour.
    if (currentRole === 'Team Leader') {
      const todayKey = this._getLocalDateKey();
      const todayShiftsSnap = await getDocs(collection(db, SHIFT_SESSIONS_COL));
      const todayShifts = new Map(
        todayShiftsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((shift: any) => shift.dateKey === todayKey)
          .map((shift: any) => [String(shift.userId), shift])
      );

      stats.teamMembers = visibleUsers
        .filter((member: any) => member.role === 'Agent')
        .map((member: any) => ({
          id: member.id,
          name: member.name || member.email || 'Agent',
          email: member.email || '',
          avatar: member.avatar || `https://i.pravatar.cc/150?u=${member.id}`,
          isOnline: !!member.isOnline,
          lastSeen: member.lastSeen || null,
          shift: todayShifts.get(String(member.id)) || null
        }))
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    }

    const historySnap = await getDocs(query(collection(db, "history"), orderBy("createdAt", "desc"), limit(100)));
    const visibleUserIds = new Set(visibleUsers.map((u: any) => String(u.id)));
    const visibleLeadIds = new Set(filteredLeads.map((l: any) => String(l.id)));

    const recentActivity = historySnap.docs
      .map(d => {
        const data = d.data();
        const activityUser = allUsers.find((u: any) => String(u.id) === String(data.user_id)) as any;
        return {
          id: d.id,
          ...data,
          userName: activityUser?.name || 'Unknown User'
        };
      })
      .filter((activity: any) => {
        if (currentRole === 'Administrator' || currentRole === 'Manager') return true;
        if (currentRole === 'Agent') {
          return String(activity.user_id || '') === String(currentUser.id) ||
            (activity.lead_id && visibleLeadIds.has(String(activity.lead_id)));
        }
        if (currentRole === 'Team Leader') {
          return visibleUserIds.has(String(activity.user_id || '')) ||
            (activity.lead_id && visibleLeadIds.has(String(activity.lead_id)));
        }
        return false;
      })
      .slice(0, 10);

    (stats as any).recentActivity = recentActivity;
    (stats as any).scope = currentRole === 'Team Leader'
      ? { type: 'team', teamId: currentTeamId, teamName: currentUser.teamName || '' }
      : currentRole === 'Agent'
        ? { type: 'agent', userId: currentUser.id }
        : { type: 'organization' };

    return stats;
  }
};
