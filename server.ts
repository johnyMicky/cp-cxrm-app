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

async function resolveAtlantUserProfile(uid: string, email?: string) {
  const cleanUid = String(uid || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!cleanUid) return null;

  const exactRef = db.collection('users').doc(cleanUid);
  const exactSnap = await exactRef.get();
  const exactData = exactSnap.exists ? (exactSnap.data() || {}) : {};

  const exactExtension = String(exactData.atlantExtension || '').trim();
  if (exactSnap.exists && exactExtension) {
    return {
      id: cleanUid,
      ...exactData,
      atlantExtension: exactExtension
    };
  }

  const effectiveEmail = String(
    exactData.email ||
    cleanEmail
  ).trim().toLowerCase();

  if (!effectiveEmail) {
    return exactSnap.exists
      ? { id: cleanUid, ...exactData, atlantExtension: exactExtension }
      : null;
  }

  const sameEmail = await db.collection('users')
    .where('email', '==', effectiveEmail)
    .limit(10)
    .get();

  if (sameEmail.empty) {
    return exactSnap.exists
      ? { id: cleanUid, ...exactData, atlantExtension: exactExtension }
      : null;
  }

  const candidates = sameEmail.docs.map(docSnap => ({
    id: docSnap.id,
    ...(docSnap.data() || {})
  })) as any[];

  const withExtension = candidates.find(item =>
    String(item.atlantExtension || '').trim()
  );

  const preferred = withExtension ||
    candidates.find(item => item.id === cleanUid) ||
    candidates[0];

  if (!preferred) return null;

  const resolvedExtension = String(preferred.atlantExtension || '').trim();

  // Repair the real Firebase UID profile once. After this request, Click2Call
  // and Auto Dialer stay on the fast exact-UID path.
  if (resolvedExtension && (!exactSnap.exists || !exactExtension)) {
    await exactRef.set({
      email: exactData.email || preferred.email || effectiveEmail,
      name: exactData.name || preferred.name || '',
      role: exactData.role || preferred.role || 'Agent',
      teamId: exactData.teamId || preferred.teamId || '',
      teamName: exactData.teamName || preferred.teamName || '',
      atlantExtension: resolvedExtension,
      atlantUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  const mergedProfiles = Array.isArray((exactData as any).telephonyProfiles)
    ? [...(exactData as any).telephonyProfiles]
    : Array.isArray((preferred as any).telephonyProfiles)
      ? [...(preferred as any).telephonyProfiles]
      : [];

  if (
    resolvedExtension &&
    !mergedProfiles.some((item: any) =>
      String(item?.providerId || item?.providerKey || '').toLowerCase() === 'atlant'
    )
  ) {
    mergedProfiles.unshift({
      providerId: 'atlant',
      providerName: 'Atlant',
      providerKey: 'atlant',
      extension: resolvedExtension,
      enabled: true,
      isDefault: !mergedProfiles.some((item: any) => item?.isDefault === true)
    });
  }

  return {
    id: cleanUid,
    ...preferred,
    ...exactData,
    atlantExtension: resolvedExtension,
    telephonyProfiles: mergedProfiles
  };
}

function resolveOperationalTelephonyProfile(userData: any, requestedProviderId?: string) {
  const requested = String(requestedProviderId || '').trim().toLowerCase();

  const profiles = Array.isArray(userData?.telephonyProfiles)
    ? userData.telephonyProfiles
        .map((item: any) => ({
          providerId: String(item?.providerId || '').trim(),
          providerName: String(item?.providerName || item?.providerId || '').trim(),
          providerKey: String(item?.providerKey || item?.providerId || '').trim().toLowerCase(),
          extension: String(item?.extension || '').trim(),
          enabled: item?.enabled !== false,
          isDefault: item?.isDefault === true
        }))
        .filter((item: any) => item.providerId && item.extension && item.enabled)
    : [];

  // Provider adapters are deliberately explicit. Creating a provider/profile in
  // Settings never makes it callable until its server integration exists.
  const isIntegrated = (profile: any) => profile?.providerKey === 'atlant';

  if (requested) {
    const requestedProfile = profiles.find((item: any) =>
      String(item.providerId).toLowerCase() === requested ||
      String(item.providerKey).toLowerCase() === requested
    );

    if (requestedProfile && isIntegrated(requestedProfile)) {
      return requestedProfile;
    }

    if (requestedProfile && !isIntegrated(requestedProfile)) {
      const error: any = new Error(
        `${requestedProfile.providerName || requestedProfile.providerId} is assigned to this Agent, but its CRM API integration is not active yet.`
      );
      error.code = 'VOIP_PROVIDER_NOT_INTEGRATED';
      throw error;
    }
  }

  const defaultProfile = profiles.find((item: any) => item.isDefault && isIntegrated(item));
  if (defaultProfile) return defaultProfile;

  const firstIntegrated = profiles.find((item: any) => isIntegrated(item));
  if (firstIntegrated) return firstIntegrated;

  const legacyExtension = String(userData?.atlantExtension || '').trim();
  if (legacyExtension) {
    return {
      providerId: 'atlant',
      providerName: 'Atlant',
      providerKey: 'atlant',
      extension: legacyExtension,
      enabled: true,
      isDefault: true
    };
  }

  return null;
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
    const userData = await resolveAtlantUserProfile(decoded.uid, decoded.email);

    if (!userData) {
      return res.status(404).json({ success: false, error: 'CRM user profile was not found.' });
    }

    const requestedProviderId = String(req.body?.providerId || '').trim();
    const telephonyProfile = resolveOperationalTelephonyProfile(userData, requestedProviderId);
    const agentExtension = String(telephonyProfile?.extension || '').trim();

    if (!telephonyProfile || !agentExtension) {
      return res.status(400).json({
        success: false,
        error: 'No integrated VOIP extension is configured for your CRM account. Ask an Administrator to configure Telephony in Settings.'
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

    const manualCallId = String(providerBody?.call_id || '').trim();

    if (manualCallId) {
      const matchedLead = await findLeadForLiveCall(decoded.uid, destination);

      await db.collection(ATLANT_LIVE_CALLS_COL).doc(manualCallId).set({
        callId: manualCallId,
        provider: String(telephonyProfile.providerKey || 'atlant'),
        providerId: String(telephonyProfile.providerId || 'atlant'),
        providerName: String(telephonyProfile.providerName || 'Atlant'),
        mode: 'manual',
        active: true,
        state: 'dialing',
        agentId: decoded.uid,
        agentName: String(userData.name || decoded.name || decoded.email || 'Agent'),
        agentEmail: String(decoded.email || userData.email || ''),
        agentExtension,
        teamId: String(userData.teamId || ''),
        teamName: String(userData.teamName || ''),
        leadId: matchedLead?.id || '',
        leadName: matchedLead?.name || '',
        leadStatus: matchedLead?.status || '',
        leadCountry: matchedLead?.country || '',
        leadSource: matchedLead?.source || '',
        phone: destination,
        disposition: '',
        endReason: '',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return res.status(200).json({
      success: true,
      callId: manualCallId || null,
      agent: agentExtension,
      provider: String(telephonyProfile.providerKey || 'atlant'),
      providerName: String(telephonyProfile.providerName || 'Atlant')
    });
  } catch (error: any) {
    console.error('Atlant Click2Call server error:', error);

    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));
    const providerNotIntegrated = String(error?.code || '') === 'VOIP_PROVIDER_NOT_INTEGRATED';

    return res.status(unauthorized ? 401 : providerNotIntegrated ? 400 : 500).json({
      success: false,
      error: unauthorized
        ? 'Unauthorized'
        : providerNotIntegrated
          ? String(error?.message || 'Selected VOIP provider is not integrated.')
          : 'Unable to initiate Atlant call.'
    });
  }
});



// Atlant Auto Dialer session support.
// Existing manual Click2Call remains unchanged. Auto Dialer sessions are isolated
// in their own collection and only control the next-call queue for signed-in Agents.
const ATLANT_DIALER_SESSIONS_COL = 'atlant_dialer_sessions';
const ATLANT_LIVE_CALLS_COL = 'atlant_live_calls';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function findLeadForLiveCall(agentId: string, destination: string) {
  const cleanAgentId = String(agentId || '').trim();
  const cleanDestination = String(destination || '').trim();
  if (!cleanDestination) return null;

  try {
    let snap;
    if (cleanAgentId) {
      snap = await db.collection('leads')
        .where('assigned_to', '==', cleanAgentId)
        .where('phone', '==', cleanDestination)
        .limit(1)
        .get();
    } else {
      snap = await db.collection('leads')
        .where('phone', '==', cleanDestination)
        .limit(1)
        .get();
    }

    if (!snap.empty) {
      const leadDoc = snap.docs[0];
      const data = leadDoc.data() || {};
      return {
        id: leadDoc.id,
        name: String(data.name || '').trim(),
        status: String(data.status || '').trim(),
        country: String(data.country || '').trim(),
        source: String(data.source || '').trim()
      };
    }
  } catch (error) {
    console.warn('Live Call lead lookup failed:', error);
  }

  return null;
}

async function resolveCrmAgentForAtlantWebhook(agentPayload: any) {
  const email = String(agentPayload?.email || '').trim().toLowerCase();
  if (!email) return null;

  try {
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return null;
    const userDoc = snap.docs[0];
    const data = userDoc.data() || {};
    return {
      id: userDoc.id,
      name: String(data.name || agentPayload?.name || '').trim(),
      email: String(data.email || email).trim(),
      teamId: String(data.teamId || '').trim(),
      teamName: String(data.teamName || '').trim()
    };
  } catch (error) {
    console.warn('Live Call agent lookup failed:', error);
    return null;
  }
}

async function initiateAtlantProviderCall(agentExtension: string, destination: string) {
  const cleanExtension = String(agentExtension || '').trim();
  const cleanDestination = String(destination || '').trim();
  const digitCount = cleanDestination.replace(/\D/g, '').length;

  if (!cleanExtension) throw new Error('Atlant extension is not configured.');
  if (!cleanDestination || digitCount === 0 || digitCount > 20) {
    throw new Error('Invalid destination number.');
  }

  const apiKey = String(process.env.ATLANT_API_KEY || '').trim();
  const rawHost = String(process.env.ATLANT_HOST || '').trim();

  if (!apiKey || !rawHost) {
    throw new Error('Atlant Click2Call is not configured on the server.');
  }

  const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error('Atlant host configuration is invalid.');
  }

  const endpoint = `https://${host}/api/v1/${encodeURIComponent(apiKey)}/click2call`;

  const atlantResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: cleanDestination,
      agent: cleanExtension,
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
    throw new Error(String(
      providerBody?.error ||
      providerBody?.message ||
      `Atlant returned HTTP ${atlantResponse.status}.`
    ));
  }

  const callId = String(providerBody?.call_id || '').trim();
  if (!callId) throw new Error('Atlant did not return a Call ID.');

  return { callId };
}

async function startNextAtlantDialerCall(userId: string) {
  const sessionRef = db.collection(ATLANT_DIALER_SESSIONS_COL).doc(userId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) return { started: false, reason: 'missing-session' };

  const session = sessionSnap.data() || {};
  if (session.enabled !== true) return { started: false, reason: 'disabled' };
  if (String(session.currentCallId || '').trim()) {
    return { started: false, reason: 'call-active' };
  }

  const queue = Array.isArray(session.queue) ? session.queue : [];
  let nextIndex = Number(session.nextIndex || 0);

  if (!Number.isFinite(nextIndex) || nextIndex < 0) nextIndex = 0;

  if (nextIndex >= queue.length) {
    await sessionRef.set({
      enabled: false,
      state: 'complete',
      currentCallId: '',
      currentLeadId: '',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { started: false, reason: 'complete' };
  }

  const item = queue[nextIndex] || {};
  const leadId = String(item.leadId || '').trim();
  const leadName = String(item.name || '').trim();
  const phone = String(item.phone || '').trim();
  const agentExtension = String(session.agentExtension || '').trim();

  try {
    const provider = await initiateAtlantProviderCall(agentExtension, phone);

    await sessionRef.set({
      state: 'dialing',
      currentIndex: nextIndex,
      nextIndex: nextIndex + 1,
      currentLeadId: leadId,
      currentLeadName: leadName,
      currentPhone: phone,
      currentCallId: provider.callId,
      lastError: '',
      callStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const matchedLead = leadId ? await db.collection('leads').doc(leadId).get() : null;
    const matchedLeadData = matchedLead?.exists ? (matchedLead.data() || {}) : {};

    await db.collection(ATLANT_LIVE_CALLS_COL).doc(provider.callId).set({
      callId: provider.callId,
      provider: String(session.providerKey || 'atlant'),
      providerId: String(session.providerId || 'atlant'),
      providerName: String(session.providerName || 'Atlant'),
      mode: 'auto',
      active: true,
      state: 'dialing',
      agentId: userId,
      agentName: String(session.userName || session.userEmail || 'Agent'),
      agentEmail: String(session.userEmail || ''),
      agentExtension,
      teamId: String(session.teamId || ''),
      teamName: String(session.teamName || ''),
      leadId,
      leadName: leadName || String((matchedLeadData as any).name || ''),
      leadStatus: String((matchedLeadData as any).status || ''),
      leadCountry: String((matchedLeadData as any).country || ''),
      leadSource: String((matchedLeadData as any).source || ''),
      phone,
      disposition: '',
      endReason: '',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      started: true,
      callId: provider.callId,
      leadId,
      leadName,
      phone
    };
  } catch (error: any) {
    const message = String(error?.message || 'Unable to initiate the next call.');

    // Fail closed: never keep auto-dialing after a provider error.
    await sessionRef.set({
      enabled: false,
      state: 'error',
      lastError: message,
      currentCallId: '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.error(`Atlant Auto Dialer stopped for ${userId}:`, message);
    return { started: false, reason: 'provider-error', error: message };
  }
}

app.post('/api/atlant/dialer/start', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const userData = await resolveAtlantUserProfile(decoded.uid, decoded.email);

    if (!userData) {
      return res.status(404).json({ success: false, error: 'CRM user profile was not found.' });
    }

    if (String(userData.role || 'Agent') !== 'Agent') {
      return res.status(403).json({ success: false, error: 'Auto Dialer is available to Agents only.' });
    }

    const requestedProviderId = String(req.body?.providerId || '').trim();
    const telephonyProfile = resolveOperationalTelephonyProfile(userData, requestedProviderId);
    const agentExtension = String(telephonyProfile?.extension || '').trim();
    if (!telephonyProfile || !agentExtension) {
      return res.status(400).json({
        success: false,
        error: 'No integrated VOIP extension is configured for your CRM account.'
      });
    }

    const rawQueue = Array.isArray(req.body?.queue) ? req.body.queue : [];
    const queue = rawQueue
      .slice(0, 1000)
      .map((item: any) => ({
        leadId: String(item?.leadId || '').trim(),
        name: String(item?.name || '').trim().slice(0, 200),
        phone: String(item?.phone || '').trim().slice(0, 40)
      }))
      .filter((item: any) => item.leadId && item.phone);

    if (queue.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'There are no callable Leads in the current filtered list.'
      });
    }

    const sessionRef = db.collection(ATLANT_DIALER_SESSIONS_COL).doc(decoded.uid);
    const existing = await sessionRef.get();
    const existingData = existing.exists ? (existing.data() || {}) : {};

    // Never start a second Auto call while the previous call is physically active,
    // even if the Agent already pressed Auto OFF.
    if (String(existingData.currentCallId || '').trim()) {
      return res.status(409).json({
        success: false,
        error: existingData.enabled === true
          ? 'Auto Dialer already has an active call.'
          : 'The previous Auto Dialer call is still active. Wait for it to end, then turn Auto Dialer on again.'
      });
    }

    let resumeIndex = 0;
    let resumed = false;

    const previousQueue = Array.isArray(existingData.queue) ? existingData.queue : [];
    const previousNextIndex = Math.max(
      0,
      Math.min(
        Number(existingData.nextIndex || 0),
        previousQueue.length
      )
    );

    const previousState = String(existingData.state || '');
    const canResumePreviousProgress =
      existing.exists &&
      previousQueue.length > 0 &&
      previousNextIndex > 0 &&
      ['stopped', 'stopping', 'error'].includes(previousState);

    if (canResumePreviousProgress) {
      // Keep progress by Lead ID instead of trusting a numeric index.
      // This remains correct if filters removed some already-called Leads or the
      // current visible list has been slightly reordered before Auto is resumed.
      const alreadyProcessedLeadIds = new Set(
        previousQueue
          .slice(0, previousNextIndex)
          .map((item: any) => String(item?.leadId || '').trim())
          .filter(Boolean)
      );

      const firstUnprocessedIndex = queue.findIndex(
        (item: any) => !alreadyProcessedLeadIds.has(String(item.leadId || ''))
      );

      if (firstUnprocessedIndex >= 0) {
        resumeIndex = firstUnprocessedIndex;
        resumed = resumeIndex > 0 || alreadyProcessedLeadIds.size > 0;
      } else {
        return res.status(409).json({
          success: false,
          error: 'All Leads in the current Auto Dialer list were already processed. Change the filters/list to start a new queue.'
        });
      }
    }

    await sessionRef.set({
      userId: decoded.uid,
      userEmail: decoded.email || userData.email || '',
      userName: userData.name || decoded.name || decoded.email || 'Agent',
      teamId: userData.teamId || '',
      teamName: userData.teamName || '',
      agentExtension,
      providerId: String(telephonyProfile.providerId || 'atlant'),
      providerKey: String(telephonyProfile.providerKey || 'atlant'),
      providerName: String(telephonyProfile.providerName || 'Atlant'),
      enabled: true,
      state: 'starting',
      queue,
      queueSize: queue.length,
      nextIndex: resumeIndex,
      currentIndex: resumeIndex - 1,
      currentLeadId: '',
      currentLeadName: '',
      currentPhone: '',
      currentCallId: '',
      lastCompletedCallId: existingData.lastCompletedCallId || '',
      lastDisposition: existingData.lastDisposition || '',
      lastEndReason: existingData.lastEndReason || '',
      awaitingStatusLeadId: '',
      lastStatusLeadId: existingData.lastStatusLeadId || '',
      lastSelectedStatus: existingData.lastSelectedStatus || '',
      lastError: '',
      resumed,
      resumedFromIndex: resumeIndex,
      resumedAt: resumed ? admin.firestore.FieldValue.serverTimestamp() : null,
      startedAt: resumed
        ? (existingData.startedAt || admin.firestore.FieldValue.serverTimestamp())
        : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });

    const result = await startNextAtlantDialerCall(decoded.uid);

    if (!result.started) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Auto Dialer could not start the next call.'
      });
    }

    return res.status(200).json({
      success: true,
      resumed,
      resumedFromIndex: resumeIndex,
      session: {
        enabled: true,
        state: 'dialing',
        queueSize: queue.length,
        currentIndex: resumeIndex,
        currentLeadId: result.leadId,
        currentLeadName: result.leadName,
        currentCallId: result.callId,
        nextIndex: resumeIndex + 1,
        resumed,
        resumedFromIndex: resumeIndex
      }
    });
  } catch (error: any) {
    console.error('Atlant Auto Dialer start error:', error);

    if (String(error?.code || '') === 'VOIP_PROVIDER_NOT_INTEGRATED') {
      return res.status(400).json({
        success: false,
        error: String(error?.message || 'Selected VOIP provider is not integrated.')
      });
    }
    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));

    return res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Unable to start Auto Dialer.'
    });
  }
});

app.post('/api/atlant/dialer/stop', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const sessionRef = db.collection(ATLANT_DIALER_SESSIONS_COL).doc(decoded.uid);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(200).json({ success: true, session: null });
    }

    const current = sessionSnap.data() || {};
    await sessionRef.set({
      enabled: false,
      state: String(current.currentCallId || '').trim() ? 'stopping' : 'stopped',
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Atlant Auto Dialer stop error:', error);
    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));

    return res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Unable to stop Auto Dialer.'
    });
  }
});


app.post('/api/atlant/dialer/continue-after-status', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const leadId = String(req.body?.leadId || '').trim();
    const selectedStatus = String(req.body?.status || '').trim();

    if (!leadId || !selectedStatus) {
      return res.status(400).json({
        success: false,
        error: 'Lead and status are required to continue Auto Dialer.'
      });
    }

    const sessionRef = db.collection(ATLANT_DIALER_SESSIONS_COL).doc(decoded.uid);
    let canAdvance = false;

    await db.runTransaction(async transaction => {
      const sessionSnap = await transaction.get(sessionRef);
      if (!sessionSnap.exists) return;

      const session = sessionSnap.data() || {};

      if (session.enabled !== true) return;
      if (String(session.state || '') !== 'awaiting_status') return;
      if (String(session.currentCallId || '').trim()) return;

      const expectedLeadId = String(
        session.awaitingStatusLeadId ||
        session.currentLeadId ||
        ''
      ).trim();

      if (!expectedLeadId || expectedLeadId !== leadId) return;

      transaction.set(sessionRef, {
        state: 'waiting',
        lastSelectedStatus: selectedStatus,
        lastStatusLeadId: leadId,
        statusSavedAt: admin.firestore.FieldValue.serverTimestamp(),
        awaitingStatusLeadId: '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      canAdvance = true;
    });

    if (!canAdvance) {
      const current = await sessionRef.get();
      const data = current.exists ? (current.data() || {}) : {};

      // Idempotent response for repeated UI events after this Lead already advanced.
      if (
        data.enabled === true &&
        String(data.lastStatusLeadId || '') === leadId &&
        String(data.state || '') !== 'awaiting_status'
      ) {
        return res.status(200).json({
          success: true,
          accepted: false,
          alreadyProcessed: true
        });
      }

      return res.status(409).json({
        success: false,
        error: 'Auto Dialer is not waiting for a status on this Lead.'
      });
    }

    // Requested UX: after the Agent saves the status, wait exactly 2 seconds,
    // then start the next queued Lead if Auto is still enabled.
    await sleep(2000);

    const latestSnap = await sessionRef.get();
    const latest = latestSnap.exists ? (latestSnap.data() || {}) : {};

    if (
      latest.enabled === true &&
      String(latest.state || '') === 'waiting' &&
      !String(latest.currentCallId || '').trim() &&
      String(latest.lastStatusLeadId || '') === leadId
    ) {
      const nextResult = await startNextAtlantDialerCall(decoded.uid);

      return res.status(200).json({
        success: true,
        accepted: true,
        nextCallStarted: nextResult.started === true,
        reason: nextResult.reason || null
      });
    }

    return res.status(200).json({
      success: true,
      accepted: true,
      nextCallStarted: false
    });
  } catch (error: any) {
    console.error('Atlant Auto Dialer continue-after-status error:', error);
    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));

    return res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Unable to continue Auto Dialer after status.'
    });
  }
});


app.get('/api/atlant/dialer/status', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const sessionSnap = await db.collection(ATLANT_DIALER_SESSIONS_COL).doc(decoded.uid).get();

    if (!sessionSnap.exists) {
      return res.status(200).json({ success: true, session: null });
    }

    const data = sessionSnap.data() || {};
    return res.status(200).json({
      success: true,
      session: {
        enabled: data.enabled === true,
        state: data.state || 'stopped',
        queueSize: Number(data.queueSize || (Array.isArray(data.queue) ? data.queue.length : 0)),
        currentIndex: Number(data.currentIndex ?? -1),
        nextIndex: Number(data.nextIndex || 0),
        currentLeadId: data.currentLeadId || '',
        currentLeadName: data.currentLeadName || '',
        currentPhone: data.currentPhone || '',
        currentCallId: data.currentCallId || '',
        lastCompletedCallId: data.lastCompletedCallId || '',
        lastDisposition: data.lastDisposition || '',
        lastEndReason: data.lastEndReason || '',
        awaitingStatusLeadId: data.awaitingStatusLeadId || '',
        lastStatusLeadId: data.lastStatusLeadId || '',
        lastSelectedStatus: data.lastSelectedStatus || '',
        lastError: data.lastError || ''
      }
    });
  } catch (error: any) {
    console.error('Atlant Auto Dialer status error:', error);
    const unauthorized = /token|auth|firebase id token/i.test(String(error?.message || ''));

    return res.status(unauthorized ? 401 : 500).json({
      success: false,
      error: unauthorized ? 'Unauthorized' : 'Unable to load Auto Dialer status.'
    });
  }
});



// Atlant outbound-call webhook receiver.
// First integration/testing phase: append-only logging only.
// This does NOT change Leads, statuses, queues, or any existing CRM workflow.
const ATLANT_WEBHOOK_EVENTS_COL = 'atlant_webhook_events';

function getAtlantWebhookSecret(req: express.Request) {
  const querySecret = String(req.query?.token || '').trim();
  const headerSecret = String(req.headers['x-atlant-webhook-secret'] || '').trim();
  return headerSecret || querySecret;
}

app.post('/api/atlant/webhook', async (req, res) => {
  try {
    const configuredSecret = String(process.env.ATLANT_WEBHOOK_SECRET || '').trim();

    if (!configuredSecret) {
      console.error('Atlant webhook secret is not configured.');
      return res.status(503).json({
        success: false,
        error: 'Atlant webhook receiver is not configured.'
      });
    }

    const suppliedSecret = getAtlantWebhookSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      console.warn('Rejected Atlant webhook request with invalid secret.');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};

    const eventType = String(
      payload?.event ||
      payload?.event_type ||
      payload?.type ||
      data?.event ||
      ''
    ).trim();

    const callId = String(
      data?.id ||
      data?.call_id ||
      payload?.call_id ||
      payload?.id ||
      ''
    ).trim();

    const agent = data?.agent && typeof data.agent === 'object' ? data.agent : {};

    const record = {
      provider: 'atlant',
      eventType,
      callId,
      callType: String(data?.type || '').trim(),
      callingNumber: String(data?.calling_number || '').trim(),
      calledNumber: String(data?.called_number || '').trim(),
      disposition: String(data?.disposition || '').trim(),
      endReason: String(data?.end_reason || '').trim(),
      startTime: data?.start_time || null,
      endTime: data?.end_time || null,
      duration: data?.duration || null,
      cdrUrl: String(data?.cdr_url || '').trim(),
      agent: {
        id: agent?.id ?? null,
        name: String(agent?.name || '').trim(),
        email: String(agent?.email || '').trim()
      },
      payload,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      receivedAtIso: new Date().toISOString(),
      sourceIp: getRequestIp(req)
    };

    const created = await db.collection(ATLANT_WEBHOOK_EVENTS_COL).add(record);

    console.log(
      `Atlant webhook received: ${eventType || 'unknown event'} ` +
      `${callId ? `(call ${callId})` : '(no call id)'}`
    );

    if (callId && (eventType === 'outbound.call.answered' || eventType === 'outbound.call.hangup')) {
      const liveRef = db.collection(ATLANT_LIVE_CALLS_COL).doc(callId);
      const liveSnap = await liveRef.get();

      if (!liveSnap.exists) {
        const crmAgent = await resolveCrmAgentForAtlantWebhook(agent);
        const matchedLead = await findLeadForLiveCall(crmAgent?.id || '', record.calledNumber);

        await liveRef.set({
          callId,
          provider: 'atlant',
          mode: 'manual',
          active: eventType !== 'outbound.call.hangup',
          state: eventType === 'outbound.call.answered' ? 'in_call' : 'ended',
          agentId: crmAgent?.id || '',
          agentName: crmAgent?.name || String(agent?.name || 'Agent'),
          agentEmail: crmAgent?.email || String(agent?.email || ''),
          teamId: crmAgent?.teamId || '',
          teamName: crmAgent?.teamName || '',
          leadId: matchedLead?.id || '',
          leadName: matchedLead?.name || '',
          leadStatus: matchedLead?.status || '',
          leadCountry: matchedLead?.country || '',
          leadSource: matchedLead?.source || '',
          phone: record.calledNumber,
          startedAt: record.startTime || admin.firestore.FieldValue.serverTimestamp(),
          createdFromWebhook: true
        }, { merge: true });
      }

      if (eventType === 'outbound.call.answered') {
        await liveRef.set({
          active: true,
          state: 'in_call',
          answeredAt: admin.firestore.FieldValue.serverTimestamp(),
          disposition: String(record.disposition || ''),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        await liveRef.set({
          active: false,
          state: 'ended',
          disposition: String(record.disposition || ''),
          endReason: String(record.endReason || ''),
          duration: record.duration || null,
          cdrUrl: String(record.cdrUrl || ''),
          endedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }

    // Correlate the provider Call ID with an active Auto Dialer session.
    // "answered" only updates UI state. "hangup" is the terminal event that
    // pauses the queue until the Agent saves a status for the completed Lead.
    if (callId && (eventType === 'outbound.call.answered' || eventType === 'outbound.call.hangup')) {
      const sessionsSnapshot = await db
        .collection(ATLANT_DIALER_SESSIONS_COL)
        .where('currentCallId', '==', callId)
        .limit(5)
        .get();

      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionRef = sessionDoc.ref;

        if (eventType === 'outbound.call.answered') {
          const currentSession = sessionDoc.data() || {};
          if (currentSession.enabled === true) {
            await sessionRef.set({
              state: 'in_call',
              lastAnsweredCallId: callId,
              answeredAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
          continue;
        }

        await db.runTransaction(async transaction => {
          const latestSnap = await transaction.get(sessionRef);
          if (!latestSnap.exists) return;

          const latest = latestSnap.data() || {};
          if (String(latest.currentCallId || '') !== callId) return;
          if (String(latest.lastCompletedCallId || '') === callId) return;

          const stillEnabled = latest.enabled === true;

          transaction.set(sessionRef, {
            currentCallId: '',
            state: stillEnabled ? 'awaiting_status' : 'stopped',
            lastCompletedCallId: callId,
            lastDisposition: String(record.disposition || ''),
            lastEndReason: String(record.endReason || ''),
            lastDuration: record.duration || null,
            lastCallEndedAt: admin.firestore.FieldValue.serverTimestamp(),
            awaitingStatusLeadId: stillEnabled ? String(latest.currentLeadId || '') : '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        });
      }
    }

    return res.status(200).json({
      success: true,
      received: true,
      id: created.id
    });
  } catch (error: any) {
    console.error('Atlant webhook receiver error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to process Atlant webhook.'
    });
  }
});


// Read-only Atlant webhook debug endpoint.
// Protected by the same webhook secret and intended only for integration testing.
// It does not modify or delete any CRM data.
app.get('/api/atlant/webhook-events', async (req, res) => {
  try {
    const configuredSecret = String(process.env.ATLANT_WEBHOOK_SECRET || '').trim();

    if (!configuredSecret) {
      return res.status(503).json({
        success: false,
        error: 'Atlant webhook debug endpoint is not configured.'
      });
    }

    const suppliedSecret = getAtlantWebhookSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const requestedLimit = Number(req.query.limit || 50);
    const safeLimit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1),
      200
    );

    const snapshot = await db
      .collection(ATLANT_WEBHOOK_EVENTS_COL)
      .orderBy('receivedAt', 'desc')
      .limit(safeLimit)
      .get();

    const events = snapshot.docs.map(docSnap => {
      const data = docSnap.data() || {};
      const receivedAt = data.receivedAt?.toDate
        ? data.receivedAt.toDate().toISOString()
        : (data.receivedAtIso || null);

      return {
        id: docSnap.id,
        eventType: data.eventType || '',
        callId: data.callId || '',
        callType: data.callType || '',
        callingNumber: data.callingNumber || '',
        calledNumber: data.calledNumber || '',
        disposition: data.disposition || '',
        endReason: data.endReason || '',
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        duration: data.duration || null,
        cdrUrl: data.cdrUrl || '',
        agent: data.agent || null,
        receivedAt
      };
    });

    return res.status(200).json({
      success: true,
      count: events.length,
      events
    });
  } catch (error: any) {
    console.error('Atlant webhook debug read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load Atlant webhook events.'
    });
  }
});


// Verifies the Firebase token of a destructive request and checks the CRM role.
// Sends 401/403 itself and returns null when the request is not allowed.
async function requireCrmRole(
  req: express.Request,
  res: express.Response,
  allowedRoles: string[]
) {
  let decoded: any;
  try {
    decoded = await getVerifiedRequestUser(req);
  } catch {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return null;
  }

  const isAdmin = await isAdministrator(decoded.uid, decoded.email);
  let role = isAdmin ? 'Administrator' : '';
  if (!role) {
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    role = userDoc.exists ? String(userDoc.data()?.role || '') : '';
  }

  if (!role || !allowedRoles.includes(role)) {
    res.status(403).json({ success: false, error: 'You do not have permission for this action.' });
    return null;
  }

  return { uid: decoded.uid as string, email: String(decoded.email || ''), role };
}

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
  const requester = await requireCrmRole(req, res, ['Administrator']);
  if (!requester) return;

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
  const requester = await requireCrmRole(req, res, ['Administrator', 'Manager', 'Financial Manager', 'Team Leader']);
  if (!requester) return;

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
  const requester = await requireCrmRole(req, res, ['Administrator']);
  if (!requester) return;

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

// Change a CRM user's real Firebase Authentication password. Administrator only.
// Also removes any old plain-text "password" field from the user's Firestore docs.
app.post('/api/admin/set-password', async (req, res) => {
  const requester = await requireCrmRole(req, res, ['Administrator']);
  if (!requester) return;

  try {
    const targetId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '');
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'userId is required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    const targetSnap = await db.collection('users').doc(targetId).get();
    let email = String(targetSnap.data()?.email || '').trim().toLowerCase();

    let authUid = '';
    try {
      const authUser = await admin.auth().getUser(targetId);
      authUid = authUser.uid;
      email = email || String(authUser.email || '').toLowerCase();
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') throw e;
    }
    if (!authUid && email) {
      try {
        authUid = (await admin.auth().getUserByEmail(email)).uid;
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
      }
    }
    if (!authUid) {
      return res.status(404).json({ success: false, error: 'This user has no login account in Firebase Authentication.' });
    }

    await admin.auth().updateUser(authUid, { password });

    const refs = new Map<string, admin.firestore.DocumentReference>();
    if (targetSnap.exists) refs.set(targetId, targetSnap.ref);
    const authDoc = await db.collection('users').doc(authUid).get();
    if (authDoc.exists) refs.set(authUid, authDoc.ref);
    if (email) {
      const sameEmail = await db.collection('users').where('email', '==', email).get();
      sameEmail.docs.forEach(d => refs.set(d.id, d.ref));
    }
    if (refs.size > 0) {
      const batch = db.batch();
      refs.forEach(ref => batch.update(ref, { password: admin.firestore.FieldValue.delete() }));
      await batch.commit();
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, error: error.message, code: error.code || 'UNKNOWN_ERROR' });
  }
});

// Delete a CRM user completely: Firebase Authentication account + every
// Firestore users/ document for that UID/email. Administrator only.
app.post('/api/admin/delete-user', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    if (!(await isAdministrator(decoded.uid, decoded.email))) {
      return res.status(403).json({ success: false, error: 'Only Administrators can delete users.' });
    }

    const targetId = String(req.body?.userId || '').trim();
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'userId is required.' });
    }
    if (targetId === decoded.uid) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
    }

    const targetSnap = await db.collection('users').doc(targetId).get();
    let email = String(targetSnap.data()?.email || '').trim().toLowerCase();

    // 1) Firebase Authentication account (by UID, then by email for legacy docs)
    let authUid = '';
    try {
      const authUser = await admin.auth().getUser(targetId);
      authUid = authUser.uid;
      email = email || String(authUser.email || '').toLowerCase();
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') throw e;
    }
    if (!authUid && email) {
      try {
        authUid = (await admin.auth().getUserByEmail(email)).uid;
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
      }
    }
    if (email === ADMIN_EMAIL) {
      return res.status(400).json({ success: false, error: 'The main Administrator cannot be deleted.' });
    }
    if (authUid === decoded.uid || (email && email === String(decoded.email || '').toLowerCase())) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
    }
    if (authUid) {
      await admin.auth().revokeRefreshTokens(authUid).catch(() => {});
      await admin.auth().deleteUser(authUid);
    }

    // 2) Every users/ document for this person (exact UID, auth UID, same email)
    const refs = new Map<string, admin.firestore.DocumentReference>();
    refs.set(targetId, db.collection('users').doc(targetId));
    if (authUid) refs.set(authUid, db.collection('users').doc(authUid));
    if (email) {
      const sameEmail = await db.collection('users').where('email', '==', email).get();
      sameEmail.docs.forEach(d => refs.set(d.id, d.ref));
    }
    const batch = db.batch();
    refs.forEach(ref => batch.delete(ref));
    await batch.commit();

    res.json({ success: true, deletedAuth: !!authUid, deletedDocs: refs.size });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: error.message, code: error.code || 'UNKNOWN_ERROR' });
  }
});

// ===========================================================================
// Dashboard statistics (server-side).
// Same calculations as firestoreService.getDashboardStatsLocal(), but the
// leads are read here with only the fields the Dashboard needs, so the browser
// no longer downloads every lead. Results are cached briefly per scope.
// ===========================================================================
const DASHBOARD_CACHE_MS = 30 * 1000;
const dashboardCache = new Map<string, { at: number; body: any }>();
const DASHBOARD_LEAD_FIELDS = [
  'status', 'source', 'assigned_to', 'importId', 'importFileName',
  'callbackAt', 'createdAt', 'updatedAt'
];

// Firestore Timestamps -> { __ts: millis } so the browser can rebuild them.
function serializeDashboardValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return { __ts: value.toMillis() };
  if (value instanceof Date) return { __ts: value.getTime() };
  if (Array.isArray(value)) return value.map(serializeDashboardValue);
  if (typeof value === 'object') {
    const out: any = {};
    Object.keys(value).forEach(key => { out[key] = serializeDashboardValue(value[key]); });
    return out;
  }
  return value;
}

async function computeDashboardStats(
  requestUid: string,
  timeRange: '1d' | '1w' | '1m' | 'all',
  tzOffsetMinutes: number
) {
  // ---- Local-time helpers (browser timezone, sent by the client) ----------
  const tz = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : -240;
  const toWall = (d: Date) => new Date(d.getTime() - tz * 60000);
  const fromWall = (d: Date) => new Date(d.getTime() + tz * 60000);
  const startOfLocalDay = (d: Date) => { const w = toWall(d); w.setUTCHours(0, 0, 0, 0); return fromWall(w); };
  const addLocalDays = (d: Date, n: number) => { const w = toWall(d); w.setUTCDate(w.getUTCDate() + n); return fromWall(w); };
  const addLocalMonths = (d: Date, n: number) => { const w = toWall(d); w.setUTCMonth(w.getUTCMonth() + n); return fromWall(w); };
  const localDateKey = (d: Date) => {
    const w = toWall(d);
    return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}`;
  };

  const usersSnap = await db.collection('users').get();
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const currentUser: any = allUsers.find((u: any) => String(u.id) === String(requestUid)) || { id: requestUid };
  const currentRole = String(currentUser.role || 'Agent').trim();
  const currentTeamId = String(currentUser.teamId || '');

  const mapLead = (docSnap: any) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      status: data.status || 'New',
      source: data.source || '',
      assigned_to: data.assigned_to || '',
      importId: data.importId || '',
      importFileName: data.importFileName || '',
      callbackAt: data.callbackAt || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  };

  let visibleUsers = allUsers as any[];
  let leadLoader: Promise<any[]>;

  if (currentRole === 'Agent') {
    visibleUsers = allUsers.filter((u: any) => String(u.id) === String(currentUser.id));
    leadLoader = db.collection('leads')
      .where('assigned_to', '==', String(currentUser.id))
      .select(...DASHBOARD_LEAD_FIELDS)
      .get()
      .then(snap => snap.docs.map(mapLead));
  } else if (currentRole === 'Team Leader') {
    if (!currentTeamId) {
      visibleUsers = [currentUser].filter(Boolean);
      leadLoader = Promise.resolve([]);
    } else {
      visibleUsers = allUsers.filter((u: any) => String(u.teamId || '') === currentTeamId);
      const allowedUserIds = Array.from(new Set(
        visibleUsers
          .filter((m: any) => ['Agent', 'Team Leader'].includes(String(m.role || '')))
          .map((m: any) => String(m.id))
          .filter(Boolean)
      ));
      leadLoader = (async () => {
        if (allowedUserIds.length === 0) return [];
        const snaps = await Promise.all(allowedUserIds.map(memberId =>
          db.collection('leads').where('assigned_to', '==', memberId).select(...DASHBOARD_LEAD_FIELDS).get()
        ));
        const seen = new Set<string>();
        const rows: any[] = [];
        snaps.forEach(snap => snap.docs.forEach(docSnap => {
          if (seen.has(docSnap.id)) return;
          seen.add(docSnap.id);
          rows.push(mapLead(docSnap));
        }));
        return rows;
      })();
    }
  } else {
    // Administrator / Manager: organization-wide (same query as getLeads()).
    leadLoader = db.collection('leads')
      .orderBy('createdAt', 'desc')
      .select(...DASHBOARD_LEAD_FIELDS)
      .get()
      .then(snap => snap.docs.map(mapLead));
  }

  const now = new Date();
  const todayKey = localDateKey(now);

  const [scopedLeads, historySnap, todayShiftsSnap, importsSnap, approvedFinanceSnapshot] = await Promise.all([
    leadLoader,
    db.collection('history').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('shift_sessions').where('dateKey', '==', todayKey).get(),
    db.collection('imports').select('fileName').get(),
    db.collection('finance_deposits').where('status', '==', 'Approved').get()
  ]);

  const allLeads = scopedLeads as any[];

  const normalizeStatus = (value: any) => {
    const raw = String(value || 'New').trim();
    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    const canonical: Record<string, string> = {
      'new': 'New', 'vm': 'VM', 'no answer': 'No answer', 'deposit': 'Deposit',
      'callback': 'Callback', 'low potential': 'Low Potential', 'high potential': 'High Potential',
      'no potential': 'No Potential', 'language barrier': 'Language Barrier', 'wrong person': 'Wrong Person',
      'underage': 'Underage', 'no experience': 'No Experience', 'not interested': 'Not Interested',
      'hung up': 'Hung Up', 'hang up': 'Hung Up', 'wrong number': 'Wrong Number', 'drop': 'Drop',
      'jor': 'JOR', 'lost': 'Lost'
    };
    return canonical[key] || raw;
  };

  const toDate = (value: any) => {
    if (!value) return null;
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const normalizedLeads = allLeads.map((lead: any) => ({ ...lead, status: normalizeStatus(lead.status) }));

  const today = startOfLocalDay(now);
  const tomorrow = addLocalDays(today, 1);

  let startDate = new Date(0);
  let prevStartDate = new Date(0);
  let prevEndDate = new Date(0);

  if (timeRange === '1d') {
    startDate = new Date(today);
    prevStartDate = addLocalDays(today, -1);
    prevEndDate = new Date(today);
  } else if (timeRange === '1w') {
    startDate = addLocalDays(now, -7);
    prevStartDate = addLocalDays(startDate, -7);
    prevEndDate = new Date(startDate);
  } else if (timeRange === '1m') {
    startDate = addLocalMonths(now, -1);
    prevStartDate = addLocalMonths(startDate, -1);
    prevEndDate = new Date(startDate);
  }

  const getLeadsInPeriod = (list: any[], start: Date, end: Date = new Date()) =>
    list.filter((lead: any) => {
      const created = toDate(lead.createdAt);
      return !!created && created >= start && created < end;
    });

  const currentLeads = timeRange === 'all' ? normalizedLeads : getLeadsInPeriod(normalizedLeads, startDate);
  const previousLeads = timeRange === 'all' ? [] : getLeadsInPeriod(normalizedLeads, prevStartDate, prevEndDate);

  const terminalStatuses = new Set(['Deposit', 'Lost', 'No Potential', 'JOR']);

  const calculateStats = (list: any[]) => ({
    total: list.length,
    active: list.filter((l: any) => !terminalStatuses.has(l.status)).length,
    converted: list.filter((l: any) => l.status === 'Deposit').length,
    lost: list.filter((l: any) => ['Lost', 'No Potential'].includes(l.status)).length
  });

  const currentStats = calculateStats(currentLeads);
  const previousStats = calculateStats(previousLeads);

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const callbacksToday = normalizedLeads.filter((l: any) => {
    const cb = toDate(l.callbackAt);
    return !!cb && cb >= today && cb < tomorrow;
  }).length;

  const overdueCallbacks = normalizedLeads.filter((l: any) => {
    const cb = toDate(l.callbackAt);
    return !!cb && cb < now && l.status === 'Callback';
  }).length;

  const unassigned = normalizedLeads.filter((l: any) => !String(l.assigned_to || '').trim()).length;

  const untouched24h = normalizedLeads.filter((l: any) => {
    if (terminalStatuses.has(l.status)) return false;
    const updated = toDate(l.updatedAt) || toDate(l.createdAt);
    return !!updated && now.getTime() - updated.getTime() >= 24 * 60 * 60 * 1000;
  }).length;

  const stale7d = normalizedLeads.filter((l: any) => {
    if (terminalStatuses.has(l.status)) return false;
    const updated = toDate(l.updatedAt) || toDate(l.createdAt);
    return !!updated && now.getTime() - updated.getTime() >= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const jor = currentLeads.filter((l: any) => l.status === 'JOR').length;
  const highPotential = currentLeads.filter((l: any) => l.status === 'High Potential').length;

  const stats: any = {
    total: currentStats.total,
    totalChange: getChange(currentStats.total, previousStats.total),
    newToday: normalizedLeads.filter((l: any) => {
      const created = toDate(l.createdAt);
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
    attendance: { totalAgents: 0, ready: 0, break: 0, ended: 0, notStarted: 0, notStartedAgents: [] as any[] },
    misconfiguredUserDetails: [] as any[],
    financeReady: false
  };

  // Status distribution
  const statusMap: Record<string, number> = {};
  currentLeads.forEach((l: any) => { statusMap[l.status] = (statusMap[l.status] || 0) + 1; });
  stats.leadsByStatus = Object.entries(statusMap)
    .map(([status, count]) => ({ status, count }))
    .sort((a: any, b: any) => b.count - a.count);

  // Roles / configuration
  const roleMap: Record<string, number> = {};
  visibleUsers.forEach((u: any) => {
    const role = String(u.role || 'Undefined').trim() || 'Undefined';
    roleMap[role] = (roleMap[role] || 0) + 1;
  });
  stats.usersByRole = Object.entries(roleMap)
    .map(([role, count]) => ({ role, count }))
    .sort((a: any, b: any) => b.count - a.count);
  stats.misconfiguredUsers = Number(roleMap['Undefined'] || 0);
  stats.misconfiguredUserDetails = visibleUsers
    .filter((u: any) => { const role = String(u.role || '').trim(); return !role || role === 'Undefined'; })
    .map((u: any) => ({ id: u.id, name: u.name || u.email || 'User', email: u.email || '', role: u.role || 'Undefined', teamName: u.teamName || '' }));

  // Import file names
  const importNameMap = new Map<string, string>();
  importsSnap.docs.forEach(importDoc => {
    const data = importDoc.data() as any;
    importNameMap.set(String(importDoc.id), String(data.fileName || `Import ${importDoc.id}`));
  });
  const fileNameForLead = (lead: any) => {
    if (lead.importFileName) return String(lead.importFileName);
    if (lead.importId && importNameMap.has(String(lead.importId))) return String(importNameMap.get(String(lead.importId)));
    return 'Manual / Legacy';
  };

  // Source -> File -> Status analytics
  const sourceBuckets = new Map<string, any>();
  currentLeads.forEach((lead: any) => {
    const source = String(lead.source || 'Unknown').trim() || 'Unknown';
    const fileName = fileNameForLead(lead);
    if (!sourceBuckets.has(source)) {
      sourceBuckets.set(source, { source, count: 0, statuses: {} as Record<string, number>, files: new Map<string, any>() });
    }
    const sb = sourceBuckets.get(source);
    sb.count++;
    sb.statuses[lead.status] = (sb.statuses[lead.status] || 0) + 1;
    if (!sb.files.has(fileName)) {
      sb.files.set(fileName, { fileName, count: 0, statuses: {} as Record<string, number> });
    }
    const fb = sb.files.get(fileName);
    fb.count++;
    fb.statuses[lead.status] = (fb.statuses[lead.status] || 0) + 1;
  });

  const qualityScore = (statuses: Record<string, number>, total: number) => {
    if (!total) return 0;
    const positive = Number(statuses['Deposit'] || 0) * 3 + Number(statuses['High Potential'] || 0) * 2 + Number(statuses['Callback'] || 0);
    const negative = Number(statuses['Wrong Number'] || 0) * 2 + Number(statuses['No answer'] || 0) + Number(statuses['Hung Up'] || 0) + Number(statuses['Drop'] || 0);
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
          statuses: Object.entries(file.statuses).map(([status, count]) => ({ status, count })).sort((a: any, b: any) => b.count - a.count),
          // Not used by the UI; omitted to keep the response small.
          leadIds: [] as string[]
        }))
        .sort((a: any, b: any) => b.count - a.count);
      return {
        source: bucket.source,
        count: bucket.count,
        qualityScore: qualityScore(bucket.statuses, bucket.count),
        statuses: Object.entries(bucket.statuses).map(([status, count]) => ({ status, count })).sort((a: any, b: any) => b.count - a.count),
        files
      };
    })
    .sort((a: any, b: any) => b.count - a.count);
  stats.topSources = stats.sourceAnalytics.slice(0, 5);

  // Agent performance + approved revenue
  const agents = visibleUsers.filter((u: any) => String(u.role || '') === 'Agent');
  const visibleAgentIds = new Set(agents.map((a: any) => String(a.id)));
  const approvedRevenueByAgent = new Map<string, number>();
  const approvedDepositCountByAgent = new Map<string, number>();

  approvedFinanceSnapshot.docs.forEach(financeDoc => {
    const deposit = financeDoc.data() as any;
    if (timeRange !== 'all') {
      const financeDate = toDate(deposit.approvedAt) || toDate(deposit.receivedAtDate) || toDate(deposit.submittedAt) || toDate(deposit.depositDate);
      if (!financeDate || financeDate < startDate) return;
    }
    const allocations = Array.isArray(deposit.allocations) ? deposit.allocations : [];
    allocations.forEach((allocation: any) => {
      const userId = String(allocation.userId || '');
      if (!userId || !visibleAgentIds.has(userId)) return;
      const amount = Number(allocation.amount || 0);
      if (!Number.isFinite(amount)) return;
      approvedRevenueByAgent.set(userId, Number(approvedRevenueByAgent.get(userId) || 0) + amount);
      if (amount > 0) approvedDepositCountByAgent.set(userId, Number(approvedDepositCountByAgent.get(userId) || 0) + 1);
    });
  });

  // Group current leads by agent once (faster than filtering per agent).
  const leadsByAgent = new Map<string, any[]>();
  currentLeads.forEach((l: any) => {
    const key = String(l.assigned_to);
    if (!leadsByAgent.has(key)) leadsByAgent.set(key, []);
    leadsByAgent.get(key)!.push(l);
  });

  stats.agentPerformance = agents
    .map((agent: any) => {
      const agentLeads = leadsByAgent.get(String(agent.id)) || [];
      const deposits = agentLeads.filter((l: any) => l.status === 'Deposit').length;
      const high = agentLeads.filter((l: any) => l.status === 'High Potential').length;
      const callbacks = agentLeads.filter((l: any) => l.status === 'Callback').length;
      const approvedRevenue = Number(Number(approvedRevenueByAgent.get(String(agent.id)) || 0).toFixed(2));
      return {
        id: agent.id,
        name: agent.name || agent.email || 'Agent',
        avatar: agent.avatar || `https://i.pravatar.cc/150?u=${agent.id}`,
        teamId: agent.teamId || '',
        teamName: agent.teamName || '',
        total: agentLeads.length,
        deposits,
        approvedDepositCount: Number(approvedDepositCountByAgent.get(String(agent.id)) || 0),
        highPotential: high,
        callbacks,
        conversionRate: agentLeads.length ? Math.round((deposits / agentLeads.length) * 1000) / 10 : 0,
        revenue: approvedRevenue,
        approvedRevenue
      };
    })
    .sort((a: any, b: any) => {
      if (b.approvedRevenue !== a.approvedRevenue) return b.approvedRevenue - a.approvedRevenue;
      if (b.approvedDepositCount !== a.approvedDepositCount) return b.approvedDepositCount - a.approvedDepositCount;
      if (b.conversionRate !== a.conversionRate) return b.conversionRate - a.conversionRate;
      return String(a.name).localeCompare(String(b.name));
    });

  stats.financeReady = true;
  stats.workload = stats.agentPerformance.map((agent: any) => ({
    name: agent.name,
    new_leads: 0,
    in_progress: Math.max(0, agent.total - agent.deposits),
    completed: agent.deposits,
    total: agent.total
  }));

  // Team performance
  const teams = new Map<string, any>();
  visibleUsers
    .filter((u: any) => ['Agent', 'Team Leader'].includes(String(u.role || '')))
    .forEach((member: any) => {
      const teamId = String(member.teamId || 'unassigned-team');
      const teamName = String(member.teamName || 'No Team');
      if (!teams.has(teamId)) teams.set(teamId, { teamId, teamName, memberIds: new Set<string>(), agentCount: 0 });
      const bucket = teams.get(teamId);
      bucket.memberIds.add(String(member.id));
      if (member.role === 'Agent') bucket.agentCount++;
    });

  stats.teamPerformance = Array.from(teams.values())
    .map((team: any) => {
      const teamLeads = currentLeads.filter((l: any) => team.memberIds.has(String(l.assigned_to || '')));
      const deposits = teamLeads.filter((l: any) => l.status === 'Deposit').length;
      const high = teamLeads.filter((l: any) => l.status === 'High Potential').length;
      const lostCount = teamLeads.filter((l: any) => ['Lost', 'No Potential'].includes(l.status)).length;
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        agents: team.agentCount,
        leads: teamLeads.length,
        deposits,
        highPotential: high,
        lost: lostCount,
        conversionRate: teamLeads.length ? Math.round((deposits / teamLeads.length) * 1000) / 10 : 0
      };
    })
    .sort((a: any, b: any) => {
      if (b.deposits !== a.deposits) return b.deposits - a.deposits;
      return b.conversionRate - a.conversionRate;
    });

  // Attendance
  const shiftMap = new Map<string, any>();
  todayShiftsSnap.docs.forEach(shiftDoc => {
    const shift = { id: shiftDoc.id, ...shiftDoc.data() } as any;
    shiftMap.set(String(shift.userId), shift);
  });
  const visibleAgents = visibleUsers.filter((u: any) => String(u.role || '') === 'Agent');
  stats.attendance.totalAgents = visibleAgents.length;
  visibleAgents.forEach((agent: any) => {
    const shift = shiftMap.get(String(agent.id));
    const notStartedRow = { id: agent.id, name: agent.name || agent.email || 'Agent', email: agent.email || '', teamName: agent.teamName || '' };
    if (!shift) {
      stats.attendance.notStarted++;
      stats.attendance.notStartedAgents.push(notStartedRow);
    } else if (shift.status === 'ready') {
      stats.attendance.ready++;
    } else if (shift.status === 'break') {
      stats.attendance.break++;
    } else if (shift.status === 'ended') {
      stats.attendance.ended++;
    } else {
      stats.attendance.notStarted++;
      stats.attendance.notStartedAgents.push(notStartedRow);
    }
  });

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
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  }

  // Daily lead flow
  let flowStart: Date;
  if (timeRange === '1d') flowStart = startOfLocalDay(now);
  else if (timeRange === '1w') flowStart = startOfLocalDay(addLocalDays(now, -6));
  else if (timeRange === '1m') flowStart = startOfLocalDay(addLocalDays(now, -29));
  else flowStart = startOfLocalDay(addLocalDays(now, -13));

  const flowMap = new Map<string, number>();
  let cursor = new Date(flowStart);
  while (cursor <= now) {
    flowMap.set(localDateKey(cursor), 0);
    cursor = addLocalDays(cursor, 1);
  }
  normalizedLeads.forEach((l: any) => {
    const created = toDate(l.createdAt);
    if (!created || created < flowStart) return;
    const key = localDateKey(created);
    if (flowMap.has(key)) flowMap.set(key, Number(flowMap.get(key) || 0) + 1);
  });
  stats.dailyFlow = Array.from(flowMap.entries()).map(([date, count]) => ({ date, label: date.slice(5), count }));

  // Critical alerts
  if (unassigned > 0) stats.criticalAlerts.push({ type: 'unassigned', severity: 'high', label: 'Unassigned Leads', count: unassigned, detail: 'Leads currently have no assigned user.' });
  if (overdueCallbacks > 0) stats.criticalAlerts.push({ type: 'overdue-callbacks', severity: 'high', label: 'Overdue Callbacks', count: overdueCallbacks, detail: 'Callback time has passed while status is still Callback.' });
  if (untouched24h > 0) stats.criticalAlerts.push({ type: 'untouched', severity: 'medium', label: 'Untouched 24h+', count: untouched24h, detail: 'Active leads have not been updated for at least 24 hours.' });
  if (stats.attendance.notStarted > 0) stats.criticalAlerts.push({ type: 'shift-not-started', severity: 'medium', label: 'Shift Not Started', count: stats.attendance.notStarted, detail: 'Visible Agents have no shift record for today.' });
  if (stats.misconfiguredUsers > 0) stats.criticalAlerts.push({ type: 'user-config', severity: 'medium', label: 'User Configuration', count: stats.misconfiguredUsers, detail: 'Users have an undefined role and should be reviewed.' });

  // Recent activity (same visibility rules)
  const visibleUserIds = new Set(visibleUsers.map((u: any) => String(u.id)));
  const visibleLeadIds = new Set(normalizedLeads.map((l: any) => String(l.id)));
  const userNameById = new Map(allUsers.map((u: any) => [String(u.id), u.name]));

  stats.recentActivity = historySnap.docs
    .map(d => {
      const data = d.data() as any;
      return { id: d.id, ...data, userName: userNameById.get(String(data.user_id)) || 'Unknown User' };
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

  stats.scope = currentRole === 'Team Leader'
    ? { type: 'team', teamId: currentTeamId, teamName: currentUser.teamName || '' }
    : currentRole === 'Agent'
      ? { type: 'agent', userId: currentUser.id }
      : { type: 'organization' };

  const cacheScope = (currentRole === 'Administrator' || currentRole === 'Manager')
    ? 'org'
    : `${currentRole}:${currentRole === 'Team Leader' ? currentTeamId : currentUser.id}`;

  return { stats, cacheScope };
}

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const decoded = await getVerifiedRequestUser(req);
    const rangeParam = String(req.query.range || 'all');
    const timeRange = (['1d', '1w', '1m', 'all'].includes(rangeParam) ? rangeParam : 'all') as any;
    const tzOffset = Number(req.query.tz);

    // Short cache per user+range. Administrators/Managers share the same
    // organization-wide numbers, so their cache key is shared.
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ success: false, error: 'CRM user not found.' });
    }
    const role = String(userDoc.data()?.role || 'Agent');
    const preKey = (role === 'Administrator' || role === 'Manager')
      ? `org|${timeRange}|${tzOffset}`
      : `${decoded.uid}|${timeRange}|${tzOffset}`;

    const cached = dashboardCache.get(preKey);
    if (cached && Date.now() - cached.at < DASHBOARD_CACHE_MS && req.query.fresh !== '1') {
      return res.json({ success: true, cached: true, generatedAt: cached.at, stats: cached.body });
    }

    const { stats } = await computeDashboardStats(decoded.uid, timeRange, tzOffset);
    const body = serializeDashboardValue(stats);
    const at = Date.now();
    dashboardCache.set(preKey, { at, body });
    if (dashboardCache.size > 300) {
      const oldestKey = dashboardCache.keys().next().value;
      if (oldestKey) dashboardCache.delete(oldestKey);
    }

    res.json({ success: true, cached: false, generatedAt: at, stats: body });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load dashboard.' });
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
