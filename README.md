# CollabEditor 📝✨

A real-time collaborative Markdown editor featuring a modern WYSIWYG editor and raw Markdown editor. This is a fullstack application built using **Bun**, **TypeScript**, **React**, **Yjs**, **Milkdown**, and **SQLite**.

It allows multiple users to edit documents concurrently with live color-coded cursor indicators, persistent storage in SQLite, and has built-in support for embedding inside iframes.

---

## Key Features 🚀

- **Real-Time Collaboration**: Powered by **Yjs** CRDTs and a custom **WebSocket server**. Updates are synchronized across all active users in real-time.
- **Presence Cursors**: Every user gets a color-coded cursor displaying their name floating above their editing carets.
- **Dual Editing Modes**:
  - **WYSIWYG Mode**: Rich, interactive editing powered by **Milkdown (Crepe)**.
  - **Raw Markdown Mode**: An IDE-like code editing panel with synchronized scrollable line numbers.
- **Persistent Storage**: Note history is saved as binary document states (`Y.Doc` blobs) in a **SQLite** database on the backend. It also saves plain-text Markdown content for search/indexing purposes.
- **Iframe Compatibility**: Easily embed the editor inside other web applications. Append `?iframe=true` to any `/project/<project-name>` URL to automatically hide headers and maximize screen estate.
- **Simple, Fast Routing**: Instantly create or join projects via `/project/<project-name>`. The project name serves as the primary key.
- **Monorepo Architecture**: Clean, organized workspaces using Bun workspaces.

---

## Monorepo Layout 📁

```text
collab-editor/
├── packages/
│   ├── frontend/             # Vite + React + TypeScript + Milkdown (port 3000)
│   └── backend/              # Bun + Express + WebSocket + SQLite (port 3001)
├── package.json              # Monorepo Workspace configuration
└── README.md
```

---

## Getting Started 🛠️

### Prerequisites

Bun is only required when running from source or building locally. The release binary does not require Bun or Node.js.

```bash
curl -fsSL https://bun.sh/install | bash
```

### Install a Release Binary

Download and decompress the latest release for your platform:

```bash
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

curl -L "https://github.com/GNITOAHC/collab-editor/releases/latest/download/collab-editor-${OS}-${ARCH}.tar.gz" -o collab-editor.tar.gz
tar -xzf collab-editor.tar.gz
chmod +x "collab-editor-${OS}-${ARCH}"
./collab-editor-${OS}-${ARCH}
```

The release binary serves the embedded frontend and stores project data in `collab.sqlite` in the current directory. Pass `--port <port>` to change the serving port:

```bash
./collab-editor-${OS}-${ARCH} --port 4000
```

### Install From Source

Install all dependencies for both workspaces from the root of the repository:

```bash
bun install
```

---

## Running the Application 💻

### 1. Run Everything (Frontend & Backend)

You can launch both the frontend dev server and the backend server concurrently with a single command:

```bash
bun run dev
```

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: `http://localhost:3001`
- **WebSocket Server**: `ws://localhost:3001`

### 2. Run Individually

If you prefer to run the workspaces in separate terminals:

**Start the Backend server:**
```bash
bun run dev:backend
```

**Start the Frontend dev server:**
```bash
bun run dev:frontend
```

---

## Production Build & Standalone Binary 🏗️

### 1. Compile as a Standalone Single Binary (Recommended)

To compile the entire fullstack project (database handler, REST API, Yjs WebSocket server, and React frontend static assets) into a **single standalone executable binary**:

```bash
bun run build:binary
```

This generates a file named `collab-editor-app` in the root directory. You can distribute this single file and run it on any target machine without needing Bun or Node.js installed:

```bash
./collab-editor-app
```

- When run, it will automatically serve the embedded frontend assets directly from memory and initialize/read from the local `collab.sqlite` file.

### 2. Export Frontend Statically

If you only want to compile and export the frontend as standard static web files:

```bash
bun run build:frontend
```

The output files will be compiled and saved to `packages/frontend/dist/`, ready to be hosted on Netlify, Vercel, S3, or any static hosting service.

---

## Architecture & Sync Logic 🧠

1. **Collaboration Protocol**: The Milkdown editor uses `@milkdown/plugin-collab` to bind to a Yjs `Doc`. The client communicates with the server via `y-websocket` using standard binary sync updates.
2. **SQLite Integration**: The backend Yjs server implements persistence using `setPersistence` from `y-websocket/bin/utils`.
   - On room creation: The backend loads the binary state blob from SQLite and applies it using `Y.applyUpdate(ydoc, persistedState)`.
   - On updates: The backend debounces writes to SQLite to ensure high performance under heavy keystroke traffic.
   - On room destruction (all clients disconnect): The backend immediately writes the final state back to the SQLite table.
3. **Markdown Text Sync**: In addition to saving the binary state, the frontend debounces plain-text Markdown updates to `PUT /api/project/:name` so that raw note contents are kept in sync in a human-readable column.
4. **Editor Toggling**: The application keeps the Milkdown WYSIWYG editor mounted in the DOM (but hidden using `display: none`) when in Markdown mode. When switching back to WYSIWYG, the parent component invokes a programmatic `replaceAll(markdown)` action to synchronize all text changes.

---

## Technologies Used 🛠️

- **Runtime**: Bun
- **Frontend Framework**: React, Vite, TypeScript
- **WYSIWYG Editor**: Milkdown, Milkdown Crepe
- **CRDT / Real-Time Sync**: Yjs, y-websocket, y-prosemirror
- **Backend HTTP Server**: Express, CORS, ws
- **Database**: SQLite (via `bun:sqlite`)
- **Icons**: Lucide React
