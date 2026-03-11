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
import { format } from 'date-fns';
import { db } from "../firebase";

// Collections
const LEADS_COL = "leads";
const USERS_COL = "users";
const ACTIVITY_COL = "activity";
const NOTIFICATIONS_COL = "notifications";
const IMPORTS_COL = "imports";

const sanitizeData = (data: any) => {
  const sanitized: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      sanitized[key] = data[key];
    }
  });
  return sanitized;
};

export const firestoreService = {
  // Auth / Users
  async login(email: string, password: string) {
    const q = query(collection(db, USERS_COL), where("email", "==", email), where("password", "==", password));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      throw new Error("Invalid email or password");
    }
    const userDoc = querySnapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() };
  },

  async getUsers() {
    const querySnapshot = await getDocs(collection(db, USERS_COL));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async createUser(userData: any) {
    const sanitized = sanitizeData(userData);
    const docRef = await addDoc(collection(db, USERS_COL), {
      ...sanitized,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...sanitized };
  },

  async updateUser(id: string, userData: any) {
    const sanitized = sanitizeData(userData);
    const docRef = doc(db, USERS_COL, id);
    await updateDoc(docRef, sanitized);
  },

  async deleteUser(id: string) {
    await deleteDoc(doc(db, USERS_COL, id));
  },

  // Leads
  async getLeads(agentId?: string) {
    try {
      // Fetch all leads and sort/filter in memory to avoid index requirements
      const q = query(collection(db, LEADS_COL), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const allLeads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (agentId) {
        return allLeads.filter((lead: any) => String(lead.assigned_to) === String(agentId));
      }
      
      return allLeads;
    } catch (err) {
      console.error('Error fetching leads:', err);
      // Fallback: try without orderBy if it fails
      const q = query(collection(db, LEADS_COL));
      const querySnapshot = await getDocs(q);
      const allLeads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      let filtered = allLeads;
      if (agentId) {
        filtered = allLeads.filter((lead: any) => String(lead.assigned_to) === String(agentId));
      }
      
      // Sort manually
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
    
    // Fetch without orderBy to avoid index requirements, sort in memory
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

    // Create an import record
    const importRef = await addDoc(collection(db, IMPORTS_COL), {
      fileName,
      createdBy: userId,
      createdAt: serverTimestamp(),
      totalLeads: leads.length,
      status: 'processing'
    });

    const total = leads.length;
    const chunkSize = 20;
    for (let i = 0; i < leads.length; i += chunkSize) {
      const chunk = leads.slice(i, i + chunkSize);
      
      const results = await Promise.all(chunk.map(async (lead) => {
        try {
          const phone = lead.phone ? String(lead.phone).trim() : '';
          const email = lead.email ? String(lead.email).trim() : '';

          let q;
          if (phone) {
            q = query(collection(db, LEADS_COL), where("phone", "==", phone));
          } else if (email) {
            q = query(collection(db, LEADS_COL), where("email", "==", email));
          }

          if (q) {
            const snap = await getDocs(q);
            if (!snap.empty) {
              return { type: 'duplicate' };
            }
          }

          await this.createLead({
            ...lead,
            createdBy: userId,
            importId: importRef.id
          });
          return { type: 'success' };
        } catch (err) {
          console.error('Bulk import error for lead:', lead, err);
          return { type: 'error' };
        }
      }));

      results.forEach(res => {
        if (res.type === 'success') imported++;
        else if (res.type === 'duplicate') duplicates++;
        else errors++;
      });

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, total), total);
      }
    }

    // Update import record with final stats
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
    // 1. Find all leads associated with this import
    const q = query(collection(db, LEADS_COL), where("importId", "==", importId));
    const snap = await getDocs(q);
    
    // 2. Delete all leads (even if assigned to agents)
    const deletePromises = snap.docs.map(d => deleteDoc(doc(db, LEADS_COL, d.id)));
    await Promise.all(deletePromises);
    
    // 3. Delete the import record itself
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
    
    // Use writeBatch for maximum speed (up to 500 operations per batch)
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

    // Execute all batches in parallel
    await Promise.all(batches);

    // Log a single summary activity in background
    this.logActivity({
      user_id: userId,
      action: "Bulk Distribution",
      details: `Distributed ${leadIds.length} leads.`
    }).catch(() => {});
    
    return distributionSummary;
  },

  async deleteAllLeads(userId: string) {
    const snap = await getDocs(collection(db, LEADS_COL));
    if (snap.empty) return;

    const BATCH_SIZE = 500;
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
      currentBatch.delete(d.ref);
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

    await this.logActivity({
      user_id: userId,
      action: "Bulk Delete",
      details: `Deleted all ${snap.size} leads.`
    });
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
    // Filtering history by agent leads would be complex in Firestore without subcollections or denormalization
    // For now, let's just fetch all or filter if we have lead IDs
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

    let startDate = new Date(0); // Default to all time
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

    // Group by status
    const statusMap: any = {};
    currentLeads.forEach(l => {
      statusMap[l.status] = (statusMap[l.status] || 0) + 1;
    });
    stats.leadsByStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // Users by role
    const usersSnap = await getDocs(collection(db, USERS_COL));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const roleMap: any = {};
    users.forEach((u: any) => {
      roleMap[u.role] = (roleMap[u.role] || 0) + 1;
    });
    stats.usersByRole = Object.entries(roleMap)
      .map(([role, count]) => ({ role, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // Top Sources
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

    // Workload (for agents)
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

    // Recent Activity
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
