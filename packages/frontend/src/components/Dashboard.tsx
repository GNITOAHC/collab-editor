import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Calendar, Github, KanbanSquare } from 'lucide-react';

interface Project {
  name: string;
  markdown: string;
  updated_at: string;
}

const REPO_URL = 'https://github.com/GNITOAHC/collab-editor';

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newProjectName.trim().replace(/\s+/g, '-').toLowerCase();
    if (!cleanName) return;
    navigate(`/project/${cleanName}`);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col px-6 py-10 max-w-3xl mx-auto text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          CollabEditor
        </h1>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white transition flex items-center gap-2 text-sm"
          aria-label="View source on GitHub"
        >
          <Github size={18} />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </header>

      {/* Create */}
      <form onSubmit={handleCreateProject} className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="New project name…"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          className="flex-1 bg-slate-950/50 border border-slate-800 rounded-lg py-2.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          required
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition cursor-pointer"
        >
          <Plus size={16} />
          Create
        </button>
      </form>

      <button
        type="button"
        onClick={() => navigate('/board')}
        className="mb-8 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-left transition hover:border-indigo-500/60 hover:bg-slate-900/70 cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-300">
            <KanbanSquare size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-100">Signal Board</span>
            <span className="block truncate text-xs text-slate-500">Weekly sync tasks, owners, notes, and archive</span>
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-indigo-300">Open</span>
      </button>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search projects"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent border border-slate-800/80 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
        />
      </div>

      {/* Projects */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          {searchQuery ? 'No matches.' : 'No projects yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {filteredProjects.map((project) => (
            <li
              key={project.name}
              onClick={() => navigate(`/project/${project.name}`)}
              className="py-3 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-slate-900/40 transition flex items-center justify-between group"
            >
              <span className="font-medium text-slate-200 group-hover:text-indigo-300 transition truncate">
                {project.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0 ml-4">
                <Calendar size={12} />
                {new Date(project.updated_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
