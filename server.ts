import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(':memory:');

// Initialize database
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      country TEXT,
      source TEXT,
      status TEXT NOT NULL,
      assigned_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
} catch (err) {
  console.error('Database initialization error:', err);
}

// Seed data if empty
try {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const insertUser = db.prepare('INSERT INTO users (name, email, role, avatar) VALUES (?, ?, ?, ?)');
    insertUser.run('Admin User', 'admin@cpcrm.com', 'Administrator', 'https://i.pravatar.cc/150?u=admin');
    insertUser.run('Manager One', 'manager1@cpcrm.com', 'Manager', 'https://i.pravatar.cc/150?u=manager1');
    insertUser.run('Agent Alpha', 'agent.alpha@cpcrm.com', 'Agent', 'https://i.pravatar.cc/150?u=alpha');
    insertUser.run('Agent Beta', 'agent.beta@cpcrm.com', 'Agent', 'https://i.pravatar.cc/150?u=beta');
    insertUser.run('Agent Gamma', 'agent.gamma@cpcrm.com', 'Agent', 'https://i.pravatar.cc/150?u=gamma');

    const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number };
    if (leadCount.count === 0) {
      console.log('Seeding leads...');
      const insertLead = db.prepare('INSERT INTO leads (name, phone, email, country, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const statuses = ['New', 'VM', 'No answer', 'Deposit', 'Callback', 'Low Potential', 'Language Barrier', 'Wrong Person', 'Underage', 'No Experience'];
      const sources = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Partner'];
      const countries = ['USA', 'UK', 'Canada', 'Germany', 'France', 'Australia'];

      for (let i = 1; i <= 50; i++) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const source = sources[Math.floor(Math.random() * sources.length)];
        const country = countries[Math.floor(Math.random() * countries.length)];
        const assignedTo = Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 3 : null; 
        insertLead.run(`Lead ${i}`, `+1555000${i.toString().padStart(4, '0')}`, `lead${i}@example.com`, country, source, status, assignedTo);
      }
      console.log('Seeding complete.');
    }
  }
} catch (err) {
  console.error('Database seeding error:', err);
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get() as any;
    res.json({ 
      status: 'ok', 
      db: 'sqlite', 
      tables, 
      userCount: userCount?.count,
      leadCount: leadCount?.count 
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/leads/bulk-status', (req, res) => {
  const { lead_ids, status, user_id } = req.body;
  
  if (!lead_ids || !Array.isArray(lead_ids) || !status) {
    return res.status(400).json({ error: 'Missing lead IDs or status' });
  }

  const stmt = db.prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  
  const transaction = db.transaction((ids) => {
    for (const id of ids) {
      const oldLead = db.prepare('SELECT status FROM leads WHERE id = ?').get(id) as any;
      if (oldLead && oldLead.status !== status) {
        stmt.run(status, id);
        historyStmt.run(id, user_id || 1, 'Status Changed', `Bulk status update to ${status}`);
      }
    }
  });
  
  transaction(lead_ids);
  res.json({ success: true });
});

app.post('/api/leads/reshuffle', (req, res) => {
  const { agent_ids, user_id, status_filter } = req.body;
  
  if (!agent_ids || !Array.isArray(agent_ids) || agent_ids.length === 0) {
    return res.status(400).json({ error: 'Missing agents for reshuffling' });
  }

  try {
    let query = 'SELECT id FROM leads WHERE assigned_to IS NOT NULL';
    const params: any[] = [];
    
    if (status_filter && Array.isArray(status_filter) && status_filter.length > 0) {
      query += ` AND status IN (${status_filter.map(() => '?').join(',')})`;
      params.push(...status_filter);
    }

    const leadsToReshuffle = db.prepare(query).all(...params) as any[];
    
    if (leadsToReshuffle.length === 0) {
      return res.json({ success: true, message: 'No leads found to reshuffle' });
    }

    const stmt = db.prepare('UPDATE leads SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
    
    const transaction = db.transaction((leads, agents) => {
      let agentIndex = 0;
      for (const lead of leads) {
        const agentId = agents[agentIndex];
        const agent = db.prepare('SELECT name FROM users WHERE id = ?').get(agentId) as any;
        
        stmt.run(agentId, lead.id);
        historyStmt.run(lead.id, user_id || 1, 'Reshuffled', `Lead reshuffled to ${agent.name}`);
        
        agentIndex = (agentIndex + 1) % agents.length;
      }
    });
    
    transaction(leadsToReshuffle, agent_ids);
    res.json({ success: true, reshuffledCount: leadsToReshuffle.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get() as any;
    const newToday = db.prepare("SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date('now')").get() as any;
    const activeLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status NOT IN ('Deposit', 'Lost')").get() as any;
    const convertedLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'Deposit'").get() as any;
    const lostLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'Lost'").get() as any;
    
    const leadsByStatus = db.prepare('SELECT status, COUNT(*) as count FROM leads GROUP BY status').all();
    const usersByRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
    
    const topSources = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC LIMIT 5').all();
    
    const duplicatesCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM leads 
      WHERE phone IN (
        SELECT phone 
        FROM leads 
        WHERE phone IS NOT NULL AND phone != ''
        GROUP BY phone 
        HAVING COUNT(*) > 1
      )
    `).get() as any;
    
    const workload = db.prepare(`
      SELECT u.id, u.name, u.avatar,
             COUNT(l.id) as total_assigned
      FROM users u
      LEFT JOIN leads l ON u.id = l.assigned_to
      GROUP BY u.id
      HAVING total_assigned > 0
      LIMIT 10
    `).all().map((row: any) => ({
      ...row,
      new_leads: Math.floor(row.total_assigned * 0.3),
      in_progress: Math.floor(row.total_assigned * 0.5),
      completed: Math.floor(row.total_assigned * 0.2)
    }));

    res.json({
      total: totalLeads?.count ?? 0,
      newToday: newToday?.count ?? 0,
      active: activeLeads?.count ?? 0,
      converted: convertedLeads?.count ?? 0,
      lost: lostLeads?.count ?? 0,
      leadsByStatus: leadsByStatus || [],
      usersByRole: usersByRole || [],
      topSources: topSources || [],
      workload: workload || [],
      duplicates: duplicatesCount?.count ?? 0
    });
  } catch (error: any) {
    console.error('Dashboard API Error:', error);
    res.status(500).json({ 
      error: 'Database query failed', 
      details: error.message
    });
  }
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const { name, email, role, avatar } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO users (name, email, role, avatar) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, email, role, avatar || `https://i.pravatar.cc/150?u=${email}`);
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  const { name, email, role, avatar } = req.body;
  const { id } = req.params;
  try {
    const stmt = db.prepare('UPDATE users SET name = ?, email = ?, role = ?, avatar = ? WHERE id = ?');
    stmt.run(name, email, role, avatar, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  try {
    const leads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE assigned_to = ?').get(id) as any;
    if (leads.count > 0) {
      return res.status(400).json({ error: 'Cannot delete user with assigned leads. Reassign leads first.' });
    }
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/leads', (req, res) => {
  const leads = db.prepare(`
    SELECT leads.*, users.name as assigned_to_name, users.avatar as assigned_to_avatar
    FROM leads
    LEFT JOIN users ON leads.assigned_to = users.id
    ORDER BY leads.created_at DESC
  `).all();
  res.json(leads);
});

app.get('/api/leads/:id', (req, res) => {
  const lead = db.prepare(`
    SELECT leads.*, users.name as assigned_to_name, users.avatar as assigned_to_avatar
    FROM leads
    LEFT JOIN users ON leads.assigned_to = users.id
    WHERE leads.id = ?
  `).get(req.params.id);
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  const notes = db.prepare(`
    SELECT notes.*, users.name as user_name, users.avatar as user_avatar
    FROM notes
    JOIN users ON notes.user_id = users.id
    WHERE notes.lead_id = ?
    ORDER BY notes.created_at DESC
  `).all(req.params.id);
  
  const history = db.prepare(`
    SELECT history.*, users.name as user_name, users.avatar as user_avatar
    FROM history
    JOIN users ON history.user_id = users.id
    WHERE history.lead_id = ?
    ORDER BY history.created_at DESC
  `).all(req.params.id);
  
  res.json({ ...lead, notes, history });
});

app.post('/api/leads', (req, res) => {
  const { name, phone, email, country, source, status, assigned_to, user_id, notes } = req.body;
  try {
    if (phone) {
      const existing = db.prepare('SELECT id FROM leads WHERE phone = ?').get(phone) as any;
      if (existing) {
        return res.status(400).json({ error: 'A lead with this phone number already exists.' });
      }
    }

    const stmt = db.prepare('INSERT INTO leads (name, phone, email, country, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(name, phone || null, email || null, country || null, source || 'Website', status || 'New', assigned_to || null);
    const leadId = result.lastInsertRowid;
    
    const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
    historyStmt.run(leadId, user_id || 1, 'Created', 'Lead created');

    if (notes && notes.trim()) {
      const noteStmt = db.prepare('INSERT INTO notes (lead_id, user_id, content) VALUES (?, ?, ?)');
      noteStmt.run(leadId, user_id || 1, notes);
    }
    
    res.json({ id: leadId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/leads/:id', (req, res) => {
  const { name, phone, email, country, source, status, assigned_to, user_id } = req.body;
  const leadId = req.params.id;
  
  const oldLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as any;
  
  const stmt = db.prepare('UPDATE leads SET name = ?, phone = ?, email = ?, country = ?, source = ?, status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(name, phone, email, country, source, status, assigned_to, leadId);
  
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  
  if (oldLead.status !== status) {
    historyStmt.run(leadId, user_id, 'Status Changed', `Status changed from ${oldLead.status} to ${status}`);
  }
  if (oldLead.assigned_to !== assigned_to) {
    const assignedUser = assigned_to ? db.prepare('SELECT name FROM users WHERE id = ?').get(assigned_to) as any : { name: 'Unassigned' };
    historyStmt.run(leadId, user_id, 'Reassigned', `Assigned to ${assignedUser.name}`);
  }
  
  res.json({ success: true });
});

app.post('/api/leads/:id/notes', (req, res) => {
  const { user_id, content } = req.body;
  const leadId = req.params.id;
  
  const stmt = db.prepare('INSERT INTO notes (lead_id, user_id, content) VALUES (?, ?, ?)');
  stmt.run(leadId, user_id, content);
  
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  historyStmt.run(leadId, user_id, 'Note Added', 'Added a new note');
  
  res.json({ success: true });
});

app.post('/api/leads/assign', (req, res) => {
  const { lead_ids, assigned_to, user_id } = req.body;
  
  const stmt = db.prepare('UPDATE leads SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  const assignedUser = assigned_to ? db.prepare('SELECT name FROM users WHERE id = ?').get(assigned_to) as any : { name: 'Unassigned' };
  
  const transaction = db.transaction((leads) => {
    for (const id of leads) {
      const oldLead = db.prepare('SELECT assigned_to FROM leads WHERE id = ?').get(id) as any;
      if (oldLead.assigned_to !== assigned_to) {
        stmt.run(assigned_to, id);
        historyStmt.run(id, user_id, 'Reassigned', `Assigned to ${assignedUser.name}`);
      }
    }
  });
  
  transaction(lead_ids);
  res.json({ success: true });
});

app.post('/api/leads/distribute', (req, res) => {
  const { lead_ids, agent_ids, user_id } = req.body;
  
  if (!lead_ids.length || !agent_ids.length) {
    return res.status(400).json({ error: 'Missing leads or agents' });
  }

  const stmt = db.prepare('UPDATE leads SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  
  const transaction = db.transaction((leads, agents) => {
    let agentIndex = 0;
    for (const id of leads) {
      const agentId = agents[agentIndex];
      const assignedUser = db.prepare('SELECT name FROM users WHERE id = ?').get(agentId) as any;
      
      stmt.run(agentId, id);
      historyStmt.run(id, user_id, 'Auto-Distributed', `Assigned to ${assignedUser.name}`);
      
      agentIndex = (agentIndex + 1) % agents.length;
    }
  });
  
  transaction(lead_ids, agent_ids);
  res.json({ success: true });
});

app.get('/api/history', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT history.*, users.name as user_name, users.avatar as user_avatar
      FROM history
      JOIN users ON history.user_id = users.id
      ORDER BY history.created_at DESC
      LIMIT 100
    `).all();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads/bulk', (req, res) => {
  const { leads, user_id } = req.body;
  
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'Leads must be an array' });
  }

  const results = {
    total: leads.length,
    imported: 0,
    duplicates: 0,
    errors: 0
  };

  const checkStmt = db.prepare('SELECT id FROM leads WHERE phone = ?');
  const insertStmt = db.prepare('INSERT INTO leads (name, phone, email, country, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
  const noteStmt = db.prepare('INSERT INTO notes (lead_id, user_id, content) VALUES (?, ?, ?)');

  const transaction = db.transaction((leadsList) => {
    for (const lead of leadsList) {
      try {
        if (lead.phone) {
          const existing = checkStmt.get(lead.phone);
          if (existing) {
            results.duplicates++;
            continue;
          }
        }

        const result = insertStmt.run(
          lead.name, 
          lead.phone || null, 
          lead.email || null, 
          lead.country || null, 
          lead.source || 'Website', 
          lead.status || 'New', 
          lead.assigned_to || null
        );
        
        const leadId = result.lastInsertRowid;
        historyStmt.run(leadId, user_id, 'Imported', 'Lead imported via bulk upload');

        if (lead.notes && lead.notes.trim()) {
          noteStmt.run(leadId, user_id, lead.notes);
        }

        results.imported++;
      } catch (err) {
        console.error('Error importing lead:', err);
        results.errors++;
      }
    }
  });

  transaction(leads);
  res.json(results);
});

app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM notes WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM history WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    const indexPath = path.resolve(distPath, 'index.html');
    
    // In production on Vercel, static files are served by Vercel's Edge Network.
    // This code remains as a fallback for other production environments.
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    
    app.use('/api', (req, res) => {
      res.status(404).json({ error: 'API route not found' });
    });

    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // If we're here, it means Vercel's rewrite didn't find the file either
        res.status(404).send('Not Found');
      }
    });
  }
}

setupVite();

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
