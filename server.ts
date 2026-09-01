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



// Atlant Auto Dialer session support.
// Existing manual Click2Call remains unchanged. Auto Dialer sessions are isolated
// in their own collection and only control the next-call queue for signed-in Agents.
const ATLANT_DIALER_SESSIONS_COL = 'atlant_dialer_sessions';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const userDoc = await db.collection('users').doc(decoded.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'CRM user profile was not found.' });
    }

    const userData = userDoc.data() || {};
    if (String(userData.role || 'Agent') !== 'Agent') {
      return res.status(403).json({ success: false, error: 'Auto Dialer is available to Agents only.' });
    }

    const agentExtension = String(userData.atlantExtension || '').trim();
    if (!agentExtension) {
      return res.status(400).json({
        success: false,
        error: 'Atlant extension is not configured for your CRM account.'
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

    if (existing.exists) {
      const existingData = existing.data() || {};
      if (existingData.enabled === true && String(existingData.currentCallId || '').trim()) {
        return res.status(409).json({
          success: false,
          error: 'Auto Dialer already has an active call.'
        });
      }
    }

    await sessionRef.set({
      userId: decoded.uid,
      userEmail: decoded.email || userData.email || '',
      agentExtension,
      enabled: true,
      state: 'starting',
      queue,
      queueSize: queue.length,
      nextIndex: 0,
      currentIndex: -1,
      currentLeadId: '',
      currentLeadName: '',
      currentPhone: '',
      currentCallId: '',
      lastCompletedCallId: '',
      lastDisposition: '',
      lastEndReason: '',
      lastError: '',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });

    const result = await startNextAtlantDialerCall(decoded.uid);

    if (!result.started) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Auto Dialer could not start the first call.'
      });
    }

    return res.status(200).json({
      success: true,
      session: {
        enabled: true,
        state: 'dialing',
        queueSize: queue.length,
        currentLeadId: result.leadId,
        currentLeadName: result.leadName,
        currentCallId: result.callId,
        nextIndex: 1
      }
    });
  } catch (error: any) {
    console.error('Atlant Auto Dialer start error:', error);
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

    // Correlate the provider Call ID with an active Auto Dialer session.
    // "answered" only updates UI state. "hangup" is the terminal event that
    // unlocks the next Lead after a 2-second safety delay.
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

        let shouldAdvance = false;

        await db.runTransaction(async transaction => {
          const latestSnap = await transaction.get(sessionRef);
          if (!latestSnap.exists) return;

          const latest = latestSnap.data() || {};
          if (String(latest.currentCallId || '') !== callId) return;
          if (String(latest.lastCompletedCallId || '') === callId) return;

          const stillEnabled = latest.enabled === true;

          transaction.set(sessionRef, {
            currentCallId: '',
            state: stillEnabled ? 'waiting' : 'stopped',
            lastCompletedCallId: callId,
            lastDisposition: String(record.disposition || ''),
            lastEndReason: String(record.endReason || ''),
            lastDuration: record.duration || null,
            lastCallEndedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          shouldAdvance = stillEnabled;
        });

        if (shouldAdvance) {
          await sleep(2000);

          const latestAfterDelay = await sessionRef.get();
          const latestData = latestAfterDelay.exists ? (latestAfterDelay.data() || {}) : {};

          if (
            latestData.enabled === true &&
            !String(latestData.currentCallId || '').trim() &&
            String(latestData.lastCompletedCallId || '') === callId
          ) {
            await startNextAtlantDialerCall(sessionDoc.id);
          }
        }
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
