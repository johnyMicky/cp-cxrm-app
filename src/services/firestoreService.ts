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
  setDoc
} from "firebase/firestore";
import { db } from "../firebase";

// Collections
const LEADS_COL = "leads";
const USERS_COL = "users";
const ACTIVITY_COL = "activity";

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
    const docRef = await addDoc(collection(db, USERS_COL), {
      ...userData,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...userData };
  },

  async updateUser(id: string, userData: any) {
    const docRef = doc(db, USERS_COL, id);
    await updateDoc(docRef, userData);
  },

  async deleteUser(id: string) {
    await deleteDoc(doc(db, USERS_COL, id));
  },

  // Leads
  async getLeads(agentId?: string) {
    let q = query(collection(db, LEADS_COL), orderBy("createdAt", "desc"));
    if (agentId) {
      q = query(collection(db, LEADS_COL), where("assigned_to", "==", agentId), orderBy("createdAt", "desc"));
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getLead(id: string) {
    const docRef = doc(db, LEADS_COL, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Lead not found");
    
    // Get notes and history for this lead
    // In a real app, these might be subcollections or separate collections
    // For simplicity, let's assume they are stored in the lead doc or we fetch them separately
    // The user request didn't specify subcollections, so let's assume we fetch them from their own collections
    const notesQ = query(collection(db, "notes"), where("lead_id", "==", id), orderBy("createdAt", "desc"));
    const historyQ = query(collection(db, "history"), where("lead_id", "==", id), orderBy("createdAt", "desc"));
    
    const [notesSnap, historySnap] = await Promise.all([getDocs(notesQ), getDocs(historyQ)]);
    
    return { 
      id: docSnap.id, 
      ...docSnap.data(),
      notes: notesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      history: historySnap.docs.map(d => ({ id: d.id, ...d.data() }))
    };
  },

  async createLead(leadData: any) {
    const docRef = await addDoc(collection(db, LEADS_COL), {
      ...leadData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: docRef.id };
  },

  async bulkCreateLeads(leads: any[], userId: string) {
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        // Check for duplicate by phone or email
        let q;
        if (lead.phone) {
          q = query(collection(db, LEADS_COL), where("phone", "==", lead.phone));
        } else if (lead.email) {
          q = query(collection(db, LEADS_COL), where("email", "==", lead.email));
        }

        if (q) {
          const snap = await getDocs(q);
          if (!snap.empty) {
            duplicates++;
            continue;
          }
        }

        await this.createLead({
          ...lead,
          createdBy: userId
        });
        imported++;
      } catch (err) {
        console.error('Bulk import error for lead:', lead, err);
        errors++;
      }
    }

    return { imported, duplicates, errors };
  },

  async updateLead(id: string, leadData: any) {
    const docRef = doc(db, LEADS_COL, id);
    await updateDoc(docRef, {
      ...leadData,
      updatedAt: serverTimestamp()
    });
  },

  async deleteLead(id: string) {
    await deleteDoc(doc(db, LEADS_COL, id));
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
    const promises = leadIds.map(async (id) => {
      const docRef = doc(db, LEADS_COL, id);
      await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
      await this.logActivity({
        lead_id: id,
        user_id: userId,
        action: "Status Changed",
        details: `Bulk status update to ${status}`
      });
    });
    await Promise.all(promises);
  },

  async distributeLeads(leadIds: string[], agentIds: string[], userId: string) {
    let agentIndex = 0;
    const promises = leadIds.map(async (id) => {
      const agentId = agentIds[agentIndex];
      const agent = (await getDocs(query(collection(db, USERS_COL), where("__name__", "==", agentId)))).docs[0]?.data();
      
      const docRef = doc(db, LEADS_COL, id);
      await updateDoc(docRef, { assigned_to: agentId, updatedAt: serverTimestamp() });
      await this.logActivity({
        lead_id: id,
        user_id: userId,
        action: "Auto-Distributed",
        details: `Assigned to ${agent?.name || 'Unknown'}`
      });
      
      agentIndex = (agentIndex + 1) % agentIds.length;
    });
    await Promise.all(promises);
  },

  async reshuffleLeads(agentIds: string[], userId: string, statusFilter: string[]) {
    // This is more complex in Firestore. For now, let's fetch leads and update them.
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
    await addDoc(collection(db, "history"), {
      ...activityData,
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

  // Dashboard
  async getDashboardStats(user: any) {
    const leadsSnap = await getDocs(collection(db, LEADS_COL));
    const leads = leadsSnap.docs.map(d => d.data());
    
    const isAgent = user.role === 'Agent';
    const filteredLeads = isAgent ? leads.filter(l => l.assigned_to === user.id) : leads;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
      total: filteredLeads.length,
      newToday: filteredLeads.filter(l => {
        const created = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
        return created >= today;
      }).length,
      active: filteredLeads.filter(l => !['Deposit', 'Lost'].includes(l.status)).length,
      converted: filteredLeads.filter(l => l.status === 'Deposit').length,
      lost: filteredLeads.filter(l => l.status === 'Lost').length,
      duplicates: 0, // Simplified
      leadsByStatus: [] as any[],
      usersByRole: [] as any[],
      topSources: [] as any[],
      workload: [] as any[]
    };

    // Group by status
    const statusMap: any = {};
    filteredLeads.forEach(l => {
      statusMap[l.status] = (statusMap[l.status] || 0) + 1;
    });
    stats.leadsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // Users by role
    const usersSnap = await getDocs(collection(db, USERS_COL));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const roleMap: any = {};
    users.forEach((u: any) => {
      roleMap[u.role] = (roleMap[u.role] || 0) + 1;
    });
    stats.usersByRole = Object.entries(roleMap).map(([role, count]) => ({ role, count }));

    return stats;
  }
};
