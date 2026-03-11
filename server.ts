import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'morganex-60185'
  });
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

// Delete All Leads Endpoint
app.post('/api/leads/delete-all', async (req, res) => {
  const startTime = Date.now();
  let deletedCount = 0;
  let failedCount = 0;

  try {
    const leadsRef = db.collection('leads');
    const snapshot = await leadsRef.get();
    
    if (snapshot.empty) {
      return res.json({ success: true, deletedCount: 0, failedCount: 0, duration: 0 });
    }

    const chunks = [];
    for (let i = 0; i < snapshot.docs.length; i += 500) {
      chunks.push(snapshot.docs.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedCount += chunk.length;
    }

    const duration = (Date.now() - startTime) / 1000;
    res.json({ success: true, deletedCount, failedCount, duration });
  } catch (error: any) {
    console.error('Delete all error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Selected Leads Endpoint
app.post('/api/leads/delete-selected', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ success: false, error: 'Invalid IDs provided' });
  }

  const startTime = Date.now();
  let deletedCount = 0;
  let failedCount = 0;

  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) {
      chunks.push(ids.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(id => {
        const docRef = db.collection('leads').doc(id);
        batch.delete(docRef);
      });
      await batch.commit();
      deletedCount += chunk.length;
    }

    const duration = (Date.now() - startTime) / 1000;
    res.json({ success: true, deletedCount, failedCount, duration });
  } catch (error: any) {
    console.error('Delete selected error:', error);
    res.status(500).json({ success: false, error: error.message });
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
