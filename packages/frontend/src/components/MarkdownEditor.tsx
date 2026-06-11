import React, { useRef, useEffect } from 'react';
import { Hash } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  projectName?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, projectName }) => {
  const lineCount = value.split('\n').length;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 30) }, (_, i) => i + 1);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const syncScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(() => {
    syncScroll();
  }, [value]);

  // Handle Tab key for indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden glass">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Hash size={13} className="text-indigo-400" />
          <span className="font-medium text-slate-300">Raw Markdown</span>
          {projectName && (
            <span className="text-slate-600 font-mono">{projectName}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono">
          <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
          <span>{charCount} chars</span>
        </div>
      </div>

      {/* Editor body — min-h-0 prevents flex children from overflowing their flex parent */}
      <div className="flex flex-1 min-h-0 font-mono text-sm">
        {/* Line numbers — scrolled in sync with textarea via JS */}
        <div
          ref={lineNumbersRef}
          className="w-14 shrink-0 bg-slate-950/50 text-slate-700 text-right pr-3 pl-1 py-4 select-none overflow-hidden border-r border-slate-900/80"
          style={{ lineHeight: '1.625rem' }}
        >
          {lineNumbers.map((num) => (
            <div
              key={num}
              style={{ height: '1.625rem' }}
              className={num <= lineCount ? 'text-slate-600' : 'text-slate-800/30'}
            >
              {num}
            </div>
          ))}
        </div>

        {/* Textarea — flex-1 fills remaining width/height; no explicit height needed */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-slate-200 py-4 px-5 focus:outline-none resize-none overflow-y-auto"
          placeholder="# Start writing Markdown…&#10;&#10;**Bold**, _italic_, `code`, and more."
          spellCheck={false}
          style={{
            lineHeight: '1.625rem',
            caretColor: '#818cf8',
          }}
        />
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-slate-800/50 bg-slate-950/40 text-[11px] text-slate-600">
        <span>Markdown Mode — changes sync live to collaborators</span>
        <span className="flex items-center gap-1 text-slate-500">
          <kbd className="bg-slate-800/60 border border-slate-700/50 rounded px-1 py-0.5 text-[10px]">Tab</kbd>
          <span>= 2 spaces</span>
        </span>
      </div>
    </div>
  );
};

export default MarkdownEditor;
