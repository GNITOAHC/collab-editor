import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Calendar, ArrowRight, BookOpen } from 'lucide-react';

interface Project {
  name: string;
  markdown: string;
  updated_at: string;
}

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Load existing projects from backend database
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
    
    // Navigate directly to /project/:name which will auto-create it
    navigate(`/project/${cleanName}`);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getWordCount = (text: string) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-6xl mx-auto text-slate-100 relative">
      {/* Decorative Orbs */}
      <div className="glow-orb" style={{ top: '-10%', left: '10%' }} />
      <div className="glow-orb" style={{ bottom: '5%', right: '10%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.05) 0%, transparent 70%)' }} />
      {/* Hero Header Section */}
      <header className="mb-12 text-center md:text-left mt-8">
        <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
          <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <BookOpen size={28} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-purple-400 bg-clip-text text-transparent">
            CollabEditor
          </h1>
        </div>
        <p className="text-slate-400 text-lg max-w-2xl mt-2 font-medium">
          A real-time collaborative Markdown editor built with Yjs, Milkdown, and SQLite. 
          Create or open a project below to start editing.
        </p>
      </header>

      {/* Main Grid: Create new and Search */}
      <div className="grid md:grid-cols-3 gap-6 mb-10">
        {/* Create Card */}
        <div className="glass p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-2 text-white flex items-center gap-2">
              <Plus size={18} className="text-indigo-400" />
              New Project
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Enter a unique project name. Collaborators can join by visiting the same URL.
            </p>
          </div>
          <form onSubmit={handleCreateProject} className="space-y-3">
            <input
              type="text"
              placeholder="e.g. sprint-retro"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              required
            />
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              Open Editor
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        {/* Info Card */}
        <div className="glass p-6 rounded-2xl flex flex-col justify-between md:col-span-2">
          <div>
            <h2 className="text-lg font-semibold mb-2 text-white">How it Works</h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm text-slate-400">
              <div className="space-y-1">
                <p className="text-slate-200 font-medium">Real-Time Collab</p>
                <p className="text-xs">Multiple users can edit simultaneously. Everyone's cursor is color-coded and visible in real time.</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-medium">Auto-Saving</p>
                <p className="text-xs">Document changes are continuously saved to the SQLite database via Yjs transactions.</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-medium">Dual Editor Mode</p>
                <p className="text-xs">Seamlessly toggle between a WYSIWYG rich text editor and raw Markdown view.</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-medium">Iframe support</p>
                <p className="text-xs">Embed directly into other applications using iframe with route path parameters.</p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800/40 flex items-center justify-between text-xs text-slate-500">
            <span>Package Manager: Bun</span>
            <span>Language: TypeScript</span>
          </div>
        </div>
      </div>

      {/* Projects List Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText size={20} className="text-indigo-400" />
          Active Projects
        </h2>
        <div className="relative max-w-xs w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading projects...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="glass p-12 rounded-2xl text-center border-dashed border-slate-800">
          <FileText size={40} className="mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400 font-medium">No projects found</p>
          <p className="text-slate-500 text-xs mt-1">Create a new project above to get started.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.name}
              onClick={() => navigate(`/project/${project.name}`)}
              className="glass glass-hover p-5 rounded-2xl cursor-pointer flex flex-col justify-between h-40 group"
            >
              <div>
                <h3 className="font-bold text-white group-hover:text-indigo-400 transition text-base truncate mb-1">
                  /project/{project.name}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                  {project.markdown ? project.markdown.slice(0, 100) : <span className="italic text-slate-600">Empty note...</span>}
                </p>
              </div>
              <div className="flex items-center justify-between mt-4 text-[11px] text-slate-500 border-t border-slate-800/30 pt-3">
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  {new Date(project.updated_at).toLocaleDateString()}
                </span>
                <span>{getWordCount(project.markdown)} words</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
