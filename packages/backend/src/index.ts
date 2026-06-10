import http from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import * as Y from 'yjs';
import { setupWSConnection, setPersistence } from './yjs-utils.js';
import { Database } from 'bun:sqlite';

const PORT = process.env.PORT || 3001;

// 1. Initialize SQLite Database using Bun's native SQLite module
const db = new Database('collab.sqlite');
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    ydoc BLOB,
    markdown TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('SQLite database initialized successfully.');

// Map to keep track of debounce save timers for each project
const saveDebounceTimers = new Map<string, Timer>();

// Helper to save Yjs state immediately to the database
function saveStateToDb(docName: string, ydoc: Y.Doc) {
  const state = Y.encodeStateAsUpdate(ydoc);
  
  // We insert or update the ydoc blob. We preserve existing markdown if it's there.
  db.prepare(`
    INSERT INTO projects (name, ydoc, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      ydoc = excluded.ydoc,
      updated_at = CURRENT_TIMESTAMP
  `).run(docName, Buffer.from(state));
  
  console.log(`[Database] Saved binary state for project "${docName}". Size: ${state.byteLength} bytes.`);
}

// 2. Set up Yjs persistence
setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    console.log(`[Yjs Persistence] Binding state for room: ${docName}`);
    
    // Load persisted binary state from SQLite
    const row = db.prepare('SELECT ydoc FROM projects WHERE name = ?').get(docName) as { ydoc: Buffer } | undefined;
    
    if (row && row.ydoc) {
      Y.applyUpdate(ydoc, new Uint8Array(row.ydoc));
      console.log(`[Yjs Persistence] Loaded existing state for project "${docName}"`);
    } else {
      console.log(`[Yjs Persistence] No existing state found for project "${docName}". Starting fresh.`);
      // Insert an empty project entry so it exists in our records
      db.prepare(`
        INSERT INTO projects (name, markdown, updated_at)
        VALUES (?, '', CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO NOTHING
      `).run(docName);
    }

    // Bind update listener to save changes incrementally with debounce
    ydoc.on('update', () => {
      // Clear existing debounce timer
      const existingTimer = saveDebounceTimers.get(docName);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Debounce saving the Yjs document state to SQLite (2 seconds)
      const timer = setTimeout(() => {
        saveStateToDb(docName, ydoc);
        saveDebounceTimers.delete(docName);
      }, 2000);
      
      saveDebounceTimers.set(docName, timer);
    });
  },
  
  writeState: async (docName: string, ydoc: Y.Doc) => {
    console.log(`[Yjs Persistence] Writing final state for room (all clients disconnected): ${docName}`);
    
    // Clear any pending debounced save
    const existingTimer = saveDebounceTimers.get(docName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      saveDebounceTimers.delete(docName);
    }
    
    saveStateToDb(docName, ydoc);
  }
});

import path from 'path';
import { assets } from './frontend-assets.js';

const isCompiled = Object.keys(assets).length > 0;

if (isCompiled) {
  console.log(`[VFS] Server compiled with ${Object.keys(assets).length} embedded static assets.`);
}

// 3. Set up Express Server
const app = express();
app.use(cors());
app.use(express.json());

// Serve embedded static files in compiled mode
app.use((req, res, next) => {
  if (!isCompiled) {
    return next();
  }

  const reqPath = req.path;
  const lookupPath = reqPath === '/' ? '/index.html' : reqPath;

  const embeddedFile = assets[lookupPath];
  if (embeddedFile) {
    const ext = lookupPath.slice(lookupPath.lastIndexOf('.')).toLowerCase();
    const MIME_TYPES: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.mjs':  'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg':  'image/svg+xml',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico':  'image/x-icon',
      '.woff': 'font/woff',
      '.woff2':'font/woff2',
      '.ttf':  'font/ttf',
      '.otf':  'font/otf',
      '.eot':  'application/vnd.ms-fontobject',
      '.map':  'application/json',
      '.txt':  'text/plain; charset=utf-8',
    };
    const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    // Allow browsers to cache static assets
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    embeddedFile.arrayBuffer().then((buf: ArrayBuffer) => {
      res.send(Buffer.from(buf));
    }).catch((err: any) => {
      console.error('Error reading embedded file:', err);
      res.status(500).send('Internal Server Error');
    });
  } else {
    // Fallback to index.html for SPA routes (e.g. /project/room-name)
    if (!reqPath.startsWith('/api') && !reqPath.startsWith('/ws')) {
      const indexFile = assets['/index.html'];
      if (indexFile) {
        res.setHeader('Content-Type', 'text/html');
        indexFile.arrayBuffer().then((buf: ArrayBuffer) => {
          res.send(Buffer.from(buf));
        }).catch(() => {
          res.status(500).send('Internal Server Error');
        });
        return;
      }
    }
    next();
  }
});

// Serve static files in local development mode
const staticPath = path.join(import.meta.dir, '../../frontend/dist');
app.use(express.static(staticPath));

// REST API Endpoints
// List all projects
app.get('/api/projects', (_req, res) => {
  try {
    const rows = db.prepare('SELECT name, markdown, updated_at FROM projects ORDER BY updated_at DESC').all();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single project (or create it if it doesn't exist)
app.get('/api/project/:name', (req, res) => {
  const { name } = req.params;
  try {
    let row = db.prepare('SELECT name, markdown, updated_at FROM projects WHERE name = ?').get(name) as any;
    
    if (!row) {
      // Create a default new project in the DB
      db.prepare(`
        INSERT INTO projects (name, markdown, updated_at)
        VALUES (?, '', CURRENT_TIMESTAMP)
      `).run(name);
      
      row = { name, markdown: '', updated_at: new Date().toISOString() };
      console.log(`[Database] Created new project entry: ${name}`);
    }
    
    res.json(row);
  } catch (error) {
    console.error(`Error fetching project ${name}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save plain markdown content for a project
app.put('/api/project/:name', (req, res) => {
  const { name } = req.params;
  const { markdown } = req.body;
  
  if (markdown === undefined) {
    return res.status(400).json({ error: 'Missing markdown field' });
  }
  
  try {
    db.prepare(`
      INSERT INTO projects (name, markdown, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        markdown = excluded.markdown,
        updated_at = CURRENT_TIMESTAMP
    `).run(name, markdown);
    
    console.log(`[Database] Updated plain markdown text for project "${name}" (${markdown.length} chars).`);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error updating markdown for project ${name}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Create Node.js HTTP server and attach WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle HTTP upgrade to WebSockets
server.on('upgrade', (request, socket, head) => {
  // Only upgrade connection if it matches the websocket request
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Handle connection sync via y-websocket utility
wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] New client connection request: ${req.url}`);
  
  // y-websocket setupWSConnection expects a standard Node req and ws
  // It uses the req.url to determine the room name (e.g. /my-project-room)
  setupWSConnection(ws, req);
});

// Fallback SPA routing in local development mode
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(staticPath, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  Collaborative Editor Backend is running:     `);
  console.log(`  - HTTP API: http://localhost:${PORT}        `);
  console.log(`  - WebSocket Server: ws://localhost:${PORT}  `);
  console.log(`===============================================`);
});
