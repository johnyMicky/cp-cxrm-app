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
