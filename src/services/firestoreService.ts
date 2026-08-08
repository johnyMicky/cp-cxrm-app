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
  signOut
} from "firebase/auth";
import { format } from 'date-fns';
import { db, auth } from "../firebase";

// Collections
const LEADS_COL = "leads";
const USERS_COL = "users";
const ACTIVITY_COL = "activity";
const NOTIFICATIONS_COL = "notifications";
const IMPORTS_COL = "imports";
const TEAMS_COL = "teams";
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

  // Auth / Users
  async login(email: string, password: string) {
    const cleanEmail = normalizeEmail(email);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;
      return await this._handleUserMigration(user, cleanEmail);
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const legacyDoc = querySnapshot.docs[0];
          const legacyData = legacyDoc.data();

          try {
            const newUserCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            return await this._handleUserMigration(
              newUserCredential.user,
              cleanEmail,
              legacyData,
              legacyDoc.id
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

      if (!userData) {
        const q = query(collection(db, USERS_COL), where("email", "==", cleanEmail));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          userData = querySnapshot.docs[0].data();
          legacyId = querySnapshot.docs[0].id;
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

      await setDoc(userDocRef, finalUserData);

      if (legacyId && legacyId !== user.uid) {
        await deleteDoc(doc(db, USERS_COL, legacyId)).catch(console.error);
      }

      return { id: user.uid, ...finalUserData };
    }

    const existingData = userDocSnap.data();

    const mergedData = {
      ...existingData,
      uid: user.uid,
      email: existingData?.email || user.email || cleanEmail,
      role: adminUser ? "Administrator" : (existingData?.role || "Agent"),
      name: existingData?.name || (adminUser ? "Admin User" : (user.displayName || cleanEmail.split('@')[0] || 'User')),
      avatar: existingData?.avatar || `https://i.pravatar.cc/150?u=${user.uid}`,
      isOnline: true,
      lastSeen: serverTimestamp()
    };

    await setDoc(userDocRef, mergedData, { merge: true });

    return {
      id: user.uid,
      ...existingData,
      ...mergedData,
      role: adminUser ? "Administrator" : (mergedData.role || "Agent")
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

      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

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
    } catch (error: any) {
      console.error("Error creating user:", error);
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

  // Dashboard
  async getDashboardStats(user: any, timeRange: '1d' | '1w' | '1m' | 'all' = 'all') {
    const leadsSnap = await getDocs(collection(db, LEADS_COL));
    const leads = leadsSnap.docs.map(d => d.data());
    
    const isAgent = user.role === 'Agent';
    const filteredLeads = isAgent ? leads.filter(l => l.assigned_to === user.id) : leads;

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
      workload: [] as any[]
    };

    const statusMap: any = {};
    currentLeads.forEach(l => {
      statusMap[l.status] = (statusMap[l.status] || 0) + 1;
    });
    stats.leadsByStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a: any, b: any) => b.count - a.count);

    const usersSnap = await getDocs(collection(db, USERS_COL));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const roleMap: any = {};
    users.forEach((u: any) => {
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

    const agents = users.filter((u: any) => ['Agent', 'Team Leader'].includes(u.role));
    stats.workload = agents.map((agent: any) => {
      const agentLeads = currentLeads.filter(l => l.assigned_to === agent.id);
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

    const historySnap = await getDocs(query(collection(db, "history"), orderBy("createdAt", "desc"), limit(10)));
    const recentActivity = historySnap.docs.map(d => {
      const data = d.data();
      const user = users.find((u: any) => u.id === data.user_id) as any;
      return {
        id: d.id,
        ...data,
        userName: user?.name || 'Unknown User'
      };
    });
    (stats as any).recentActivity = recentActivity;

    return stats;
  }
};
