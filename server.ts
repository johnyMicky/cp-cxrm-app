import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'morganex-60185';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (clientEmail && privateKey) {
      console.log('Initializing Firebase Admin with Service Account');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId
      });
    } else {
      console.log('Initializing Firebase Admin with Project ID only (Default Credentials)');
      admin.initializeApp({
        projectId
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = admin.firestore();

const app = express();
const PORT = 3000;

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV });
});


const SECURITY_LOGS_COL = 'security_login_logs';
const ADMIN_EMAIL = 'c.morgan@ghost.com';

function getBearerToken(req: express.Request) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function getVerifiedRequestUser(req: express.Request) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing authentication token.');
  }

  return await admin.auth().verifyIdToken(token);
}

async function isAdministrator(uid: string, email?: string) {
  if ((email || '').trim().toLowerCase() === ADMIN_EMAIL) return true;

  const userDoc = await db.collection('users').doc(uid).get();
  return userDoc.exists && userDoc.data()?.role === 'Administrator';
}

function getRequestIp(req: express.Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return String(
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    ''
  ).replace(/^::ffff:/, '');
}

function getCountryCode(req: express.Request) {
  return String(
    req.headers['x-vercel-ip-country'] ||
    req.headers['cf-ipcountry'] ||
    ''
  ).trim().toUpperCase();
}

function parseUserAgent(userAgent: string) {
  const ua = userAgent || '';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS / iPadOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) browser = 'Safari';

  let device = 'Desktop';
  if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
  else if (/Mobi|Android|iPhone|iPod/i.test(ua)) device = 'Mobile';

  return { os, browser, device };
}

// Append-only login audit event.
// Identity comes from the verified Firebase token, never from a client-supplied userId.
app.post('/api/security/login', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? (userDoc.data() || {}) : {};

    const userAgent = String(req.headers['user-agent'] || '');
    const parsed = parseUserAgent(userAgent);
    const countryCode = getCountryCode(req);
    const client = req.body?.client || {};

    const record = {
      eventType: 'login',
      userId: decoded.uid,
      userName: userData.name || decoded.name || decoded.email || 'User',
      email: decoded.email || userData.email || '',
      role: userData.role || ((decoded.email || '').toLowerCase() === ADMIN_EMAIL ? 'Administrator' : 'Agent'),
      teamId: userData.teamId || '',
      teamName: userData.teamName || '',
      ipAddress: getRequestIp(req),
      countryCode,
      device: parsed.device,
      os: parsed.os,
      browser: parsed.browser,
      userAgent,
      clientLanguage: String(client.language || ''),
      clientPlatform: String(client.platform || ''),
      clientMobile: Boolean(client.mobile),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString()
    };

    const created = await db.collection(SECURITY_LOGS_COL).add(record);
    res.json({ success: true, id: created.id });
  } catch (error: any) {
    console.error('Security login audit error:', error);
    const unauthorized = /token|auth/i.test(String(error?.message || ''));
    res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Failed to create security log.'
    });
  }
});

// Administrator-only read endpoint. No edit/delete endpoint exists by design.
app.get('/api/security/logs', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);

    if (!(await isAdministrator(decoded.uid, decoded.email))) {
      return res.status(403).json({ success: false, error: 'Administrator access required.' });
    }

    const requestedLimit = Number(req.query.limit || 250);
    const safeLimit = Math.min(Math.max(requestedLimit, 1), 500);

    const snapshot = await db.collection(SECURITY_LOGS_COL)
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get();

    const logs = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : (data.createdAtIso || null);

      return {
        id: docSnap.id,
        eventType: data.eventType || 'login',
        userId: data.userId || '',
        userName: data.userName || '',
        email: data.email || '',
        role: data.role || '',
        teamId: data.teamId || '',
        teamName: data.teamName || '',
        ipAddress: data.ipAddress || '',
        countryCode: data.countryCode || '',
        device: data.device || 'Unknown',
        os: data.os || 'Unknown',
        browser: data.browser || 'Unknown',
        createdAt
      };
    });

    res.json({ success: true, logs });
  } catch (error: any) {
    console.error('Security logs read error:', error);
    const unauthorized = /token|auth/i.test(String(error?.message || ''));
    res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Failed to load security logs.'
    });
  }
});


// Atlant Click2Call.
// API credentials stay server-side; the Agent extension comes from the signed-in CRM user's Firestore profile.
app.post('/api/atlant/call', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const userDoc = await db.collection('users').doc(decoded.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'CRM user profile was not found.' });
    }

    const userData = userDoc.data() || {};
    const agentExtension = String(userData.atlantExtension || '').trim();

    if (!agentExtension) {
      return res.status(400).json({
        success: false,
        error: 'Atlant extension is not configured for your CRM account. Ask an Administrator to configure it in Settings.'
      });
    }

    const destination = String(req.body?.number || '').trim();
    const digitCount = destination.replace(/\D/g, '').length;

    if (!destination || digitCount === 0 || digitCount > 20) {
      return res.status(400).json({ success: false, error: 'Invalid destination number.' });
    }

    const apiKey = String(process.env.ATLANT_API_KEY || '').trim();
    const rawHost = String(process.env.ATLANT_HOST || '').trim();

    if (!apiKey || !rawHost) {
      console.error('Atlant Click2Call environment variables are missing.');
      return res.status(503).json({
        success: false,
        error: 'Atlant Click2Call is not configured on the server.'
      });
    }

    const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');

    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
      return res.status(503).json({
        success: false,
        error: 'Atlant host configuration is invalid.'
      });
    }

    const endpoint = `https://${host}/api/v1/${encodeURIComponent(apiKey)}/click2call`;

    const atlantResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: destination,
        agent: agentExtension,
        get_call_id: 'true'
      })
    });

    const rawBody = await atlantResponse.text();
    let providerBody: any = {};

    if (rawBody) {
      try {
        providerBody = JSON.parse(rawBody);
      } catch {
        providerBody = { message: rawBody };
      }
    }

    if (!atlantResponse.ok) {
      const providerMessage = String(
        providerBody?.error ||
        providerBody?.message ||
        `Atlant returned HTTP ${atlantResponse.status}.`
      );

      console.error(`Atlant Click2Call failed for user ${decoded.uid}:`, providerMessage);

      return res.status(
        atlantResponse.status === 403 || atlantResponse.status >= 500 ? 502 : 400
      ).json({
        success: false,
        error: providerMessage
      });
    }

    return res.status(200).json({
      success: true,
      callId: providerBody?.call_id || null,
      agent: agentExtension
    });
  } catch (error: any) {
    console.error('Atlant Click2Call server error:', error);

    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));

    return res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Unable to initiate Atlant call.'
    });
  }
});


// Helper for chunked deletion
async function deleteInChunks(docRefs: admin.firestore.DocumentReference[]) {
  const CHUNK_SIZE = 200;
  let deletedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
    const chunk = docRefs.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    
    chunk.forEach(ref => batch.delete(ref));
    
    try {
      await batch.commit();
      deletedCount += chunk.length;
      console.log(`Successfully deleted chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} docs)`);
      // Small delay to prevent quota issues if needed
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error deleting chunk starting at index ${i}:`, error);
      failedCount += chunk.length;
    }
  }

  return { deletedCount, failedCount };
}

// Delete All Leads Endpoint
app.post('/api/leads/delete-all', async (req, res) => {
  console.log('Starting Delete All Leads operation');
  const startTime = Date.now();

  try {
    const leadsRef = db.collection('leads');
    const snapshot = await leadsRef.select().get(); // Only fetch IDs to save bandwidth/quota
    
    if (snapshot.empty) {
      console.log('No leads found to delete');
      return res.json({ success: true, deletedCount: 0, failedCount: 0, duration: 0 });
    }

    console.log(`Found ${snapshot.docs.length} leads to delete. Processing in chunks...`);
    const docRefs = snapshot.docs.map(doc => doc.ref);
    const { deletedCount, failedCount } = await deleteInChunks(docRefs);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Delete All finished. Deleted: ${deletedCount}, Failed: ${failedCount}, Duration: ${duration}s`);
    
    res.json({ success: true, deletedCount, failedCount, duration });
  } catch (error: any) {
    console.error('Delete all error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Delete Selected Leads Endpoint
app.post('/api/leads/delete-selected', async (req, res) => {
  const { ids } = req.body;
  console.log(`Starting Delete Selected Leads operation for ${ids?.length || 0} IDs`);
  
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ success: false, error: 'Invalid IDs provided' });
  }

  const startTime = Date.now();

  try {
    const docRefs = ids.map(id => db.collection('leads').doc(id));
    const { deletedCount, failedCount } = await deleteInChunks(docRefs);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Delete Selected finished. Deleted: ${deletedCount}, Failed: ${failedCount}, Duration: ${duration}s`);
    
    res.json({ success: true, deletedCount, failedCount, duration });
  } catch (error: any) {
    console.error('Delete selected error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Reset All Data Endpoint
app.post('/api/admin/reset-all', async (req, res) => {
  const { userId } = req.body;
  console.log(`Starting Reset All operation triggered by ${userId}`);
  const startTime = Date.now();

  try {
    // 1. Delete all leads
    const leadsRef = db.collection('leads');
    const leadsSnapshot = await leadsRef.select().get();
    if (!leadsSnapshot.empty) {
      await deleteInChunks(leadsSnapshot.docs.map(doc => doc.ref));
    }

    // 2. Delete all users except c.morgan@ghost.com
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();
    const usersToDelete: admin.firestore.DocumentReference[] = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      if (userData.email?.toLowerCase() !== 'c.morgan@ghost.com') {
        usersToDelete.push(doc.ref);
      }
    }

    if (usersToDelete.length > 0) {
      await deleteInChunks(usersToDelete);
    }

    // Delete from Firebase Auth by listing all users
    const listUsersResult = await admin.auth().listUsers();
    const authUsersToDelete = listUsersResult.users
      .filter(user => user.email?.toLowerCase() !== 'c.morgan@ghost.com')
      .map(user => user.uid);

    if (authUsersToDelete.length > 0) {
      for (let i = 0; i < authUsersToDelete.length; i += 1000) {
        const chunk = authUsersToDelete.slice(i, i + 1000);
        await admin.auth().deleteUsers(chunk);
      }
    }

    // 3. Delete all history/activity
    const historyRef = db.collection('history');
    const historySnapshot = await historyRef.select().get();
    if (!historySnapshot.empty) {
      await deleteInChunks(historySnapshot.docs.map(doc => doc.ref));
    }

    // 4. Delete all notes
    const notesRef = db.collection('notes');
    const notesSnapshot = await notesRef.select().get();
    if (!notesSnapshot.empty) {
      await deleteInChunks(notesSnapshot.docs.map(doc => doc.ref));
    }

    // 5. Delete all notifications
    const notificationsRef = db.collection('notifications');
    const notificationsSnapshot = await notificationsRef.select().get();
    if (!notificationsSnapshot.empty) {
      await deleteInChunks(notificationsSnapshot.docs.map(doc => doc.ref));
    }

    // 6. Delete all imports
    const importsRef = db.collection('imports');
    const importsSnapshot = await importsRef.select().get();
    if (!importsSnapshot.empty) {
      await deleteInChunks(importsSnapshot.docs.map(doc => doc.ref));
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Reset All finished. Duration: ${duration}s`);
    
    res.json({ success: true, duration });
  } catch (error: any) {
    console.error('Reset all error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Vite/Static handling
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
