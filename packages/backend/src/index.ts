import http from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import path from 'path';
import * as Y from 'yjs';
import { setupWSConnection, setPersistence } from './yjs-utils.js';
import { Database } from 'bun:sqlite';
import { assets } from './frontend-assets.js';
import { SIGNAL_BOARD_STATE_KEY, createDefaultSignalBoardState } from './signal-board-default.js';

const DEFAULT_PORT = 3001;

function printUsage() {
  console.log(`Usage: collab-editor-app [options]

Options:
  -h, --help           Show this help message and exit.
  --port <port>        Port to serve HTTP and WebSocket traffic on.
  --port=<port>        Port to serve HTTP and WebSocket traffic on.

Environment:
  PORT                 Fallback port when --port is not provided.

Defaults:
  port                 ${DEFAULT_PORT}
`);
}

function parsePort(value: string | undefined, source: string): number | undefined {
  if (value === undefined) return undefined;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid ${source}: "${value}". Expected an integer from 1 to 65535.`);
    process.exit(1);
  }

  return port;
}

function hasHelpArg(argv: string[]): boolean {
  return argv.includes('-h') || argv.includes('--help');
}

function parsePortArg(argv: string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--port') {
      if (argv[index + 1] === undefined) {
        console.error('Invalid --port: missing value. Expected an integer from 1 to 65535.');
        process.exit(1);
      }
      return parsePort(argv[index + 1], '--port');
    }

    if (arg.startsWith('--port=')) {
      return parsePort(arg.slice('--port='.length), '--port');
    }
  }

  return undefined;
}

const argv = process.argv.slice(2);

if (hasHelpArg(argv)) {
  printUsage();
  process.exit(0);
}

const PORT = parsePortArg(argv) ?? parsePort(process.env.PORT, 'PORT') ?? DEFAULT_PORT;

const db = new Database('collab.sqlite');
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    ydoc BLOB,
    markdown TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('SQLite database initialized successfully.');

const saveDebounceTimers = new Map<string, Timer>();

function saveStateToDb(docName: string, ydoc: Y.Doc) {
  const state = Y.encodeStateAsUpdate(ydoc);
  db.prepare(`
    INSERT INTO projects (name, ydoc, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      ydoc = excluded.ydoc,
      updated_at = CURRENT_TIMESTAMP
  `).run(docName, Buffer.from(state));
  console.log(`[Database] Saved binary state for project "${docName}". Size: ${state.byteLength} bytes.`);
}

setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    console.log(`[Yjs Persistence] Binding state for room: ${docName}`);
    const row = db.prepare('SELECT ydoc FROM projects WHERE name = ?').get(docName) as { ydoc: Buffer } | undefined;

    if (row && row.ydoc) {
      Y.applyUpdate(ydoc, new Uint8Array(row.ydoc));
      console.log(`[Yjs Persistence] Loaded existing state for project "${docName}"`);
    } else {
      console.log(`[Yjs Persistence] No existing state found for project "${docName}". Starting fresh.`);
      db.prepare(`
        INSERT INTO projects (name, markdown, updated_at)
        VALUES (?, '', CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO NOTHING
      `).run(docName);
    }

    ydoc.on('update', () => {
      const existing = saveDebounceTimers.get(docName);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        saveStateToDb(docName, ydoc);
        saveDebounceTimers.delete(docName);
      }, 2000);
      saveDebounceTimers.set(docName, timer);
    });
  },

  writeState: async (docName: string, ydoc: Y.Doc) => {
    console.log(`[Yjs Persistence] Writing final state for room: ${docName}`);
    const existing = saveDebounceTimers.get(docName);
    if (existing) {
      clearTimeout(existing);
      saveDebounceTimers.delete(docName);
    }
    saveStateToDb(docName, ydoc);
  },
});

const isCompiled = assets.size > 0;

if (isCompiled) {
  console.log(`[VFS] Server compiled with ${assets.size} embedded static assets.`);
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve embedded assets in compiled mode
app.use((req, res, next) => {
  if (!isCompiled) return next();

  const reqPath = req.path;
  const lookupPath = reqPath === '/' ? '/index.html' : reqPath;
  const asset = assets.get(lookupPath);

  if (asset) {
    res.setHeader('Content-Type', asset.mime);
    if (!lookupPath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.send(asset.data);
    return;
  }

  // SPA fallback for non-API routes
  if (!reqPath.startsWith('/api') && !reqPath.startsWith('/ws')) {
    const index = assets.get('/index.html');
    if (index) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(index.data);
      return;
    }
  }

  next();
});

// Serve static files in local development mode
const staticPath = path.join(import.meta.dir, '../../frontend/dist');
app.use(express.static(staticPath));

// REST API
app.get('/api/projects', (_req, res) => {
  try {
    const rows = db.prepare('SELECT name, markdown, updated_at FROM projects ORDER BY updated_at DESC').all();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/state/:key', (req, res) => {
  const { key } = req.params;
  try {
    let row = db.prepare('SELECT key, value, updated_at FROM app_state WHERE key = ?').get(key) as
      | { key: string; value: string; updated_at: string }
      | undefined;

    if (!row) {
      if (key !== SIGNAL_BOARD_STATE_KEY) {
        res.status(404).json({ error: 'State not found' });
        return;
      }

      const value = JSON.stringify(createDefaultSignalBoardState());
      db.prepare(`
        INSERT INTO app_state (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(key, value);
      row = db.prepare('SELECT key, value, updated_at FROM app_state WHERE key = ?').get(key) as {
        key: string;
        value: string;
        updated_at: string;
      };
    }

    res.json(row);
  } catch (error) {
    console.error(`Error fetching state "${key}":`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/state/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'Missing string value field' });
  }

  try {
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error updating state "${key}":`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/project/:name', (req, res) => {
  const { name } = req.params;
  try {
    let row = db.prepare('SELECT name, markdown, updated_at FROM projects WHERE name = ?').get(name) as any;
    if (!row) {
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
    console.log(`[Database] Updated plain markdown for project "${name}" (${markdown.length} chars).`);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error updating markdown for project ${name}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SPA fallback in local development mode
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(staticPath, 'index.html'), (err) => {
    if (err) next();
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] New client connection: ${req.url}`);
  setupWSConnection(ws, req);
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  Collaborative Editor Backend is running:     `);
  console.log(`  - HTTP API: http://localhost:${PORT}        `);
  console.log(`  - WebSocket Server: ws://localhost:${PORT}  `);
  console.log(`===============================================`);
});
