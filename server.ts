import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('crm.db');

// Initialize database
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

// Seed data if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const insertUser = db.prepare('INSERT INTO users (name, email, role, avatar) VALUES (?, ?, ?, ?)');
  insertUser.run('Admin User', 'admin@cpcrm.com', 'admin', 'https://i.pravatar.cc/150?u=admin');
  insertUser.run('Manager One', 'manager1@cpcrm.com', 'manager', 'https://i.pravatar.cc/150?u=manager1');
  insertUser.run('Agent Alpha', 'agent.alpha@cpcrm.com', 'agent', 'https://i.pravatar.cc/150?u=alpha');
  insertUser.run('Agent Beta', 'agent.beta@cpcrm.com', 'agent', 'https://i.pravatar.cc/150?u=beta');
  insertUser.run('Agent Gamma', 'agent.gamma@cpcrm.com', 'agent', 'https://i.pravatar.cc/150?u=gamma');

  const insertLead = db.prepare('INSERT INTO leads (name, phone, email, country, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const statuses = ['New', 'Contacted', 'In Progress', 'Converted', 'Lost'];
  const sources = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Partner'];
  const countries = ['USA', 'UK', 'Canada', 'Germany', 'France', 'Australia'];

  for (let i = 1; i <= 50; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const country = countries[Math.floor(Math.random() * countries.length)];
    const assignedTo = Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 3 : null; // Randomly assign to agents or leave unassigned
    insertLead.run(`Lead ${i}`, `+1555000${i.toString().padStart(4, '0')}`, `lead${i}@example.com`, country, source, status, assignedTo);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users').all();
    res.json(users);
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
    const stmt = db.prepare('INSERT INTO leads (name, phone, email, country, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(name, phone, email, country, source, status, assigned_to);
    const leadId = result.lastInsertRowid;
    
    const historyStmt = db.prepare('INSERT INTO history (lead_id, user_id, action, details) VALUES (?, ?, ?, ?)');
    historyStmt.run(leadId, user_id, 'Created', 'Lead created');

    if (notes && notes.trim()) {
      const noteStmt = db.prepare('INSERT INTO notes (lead_id, user_id, content) VALUES (?, ?, ?)');
      noteStmt.run(leadId, user_id, notes);
    }
    
    res.json({ id: leadId });
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

  app.get('/api/dashboard', (req, res) => {
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get() as any;
    const newToday = db.prepare('SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date("now")').get() as any;
    const activeLeads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE status NOT IN ("Converted", "Lost")').get() as any;
    const convertedLeads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE status = "Converted"').get() as any;
    const lostLeads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE status = "Lost"').get() as any;
    
    const topSources = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC LIMIT 5').all();
    
    const workload = db.prepare(`
      SELECT users.id, users.name, users.avatar,
             COUNT(leads.id) as total_assigned,
             SUM(CASE WHEN leads.status = 'New' THEN 1 ELSE 0 END) as new_leads,
             SUM(CASE WHEN leads.status IN ('Contacted', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
             SUM(CASE WHEN leads.status IN ('Converted', 'Lost') THEN 1 ELSE 0 END) as completed
      FROM users
      LEFT JOIN leads ON users.id = leads.assigned_to
      WHERE users.role = 'agent'
      GROUP BY users.id
    `).all();

    res.json({
      total: totalLeads.count,
      newToday: newToday.count,
      active: activeLeads.count,
      converted: convertedLeads.count,
      lost: lostLeads.count,
      topSources,
      workload
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
