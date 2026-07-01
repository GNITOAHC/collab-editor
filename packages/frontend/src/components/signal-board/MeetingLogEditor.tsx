import React, { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { Milkdown, useEditor } from '@milkdown/react';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame-dark.css';

interface MeetingLogEditorProps {
  initialValue: string;
  onChange: (markdown: string) => void;
}

export const MeetingLogEditor: React.FC<MeetingLogEditorProps> = ({ initialValue, onChange }) => {
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialValueRef.current || '',
      features: {
        // @ts-expect-error CrepeFeature keys vary across bundled versions.
        sourceEditor: false,
      },
    });

    crepe.editor.use(listener).config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });

    return crepe;
  }, []);

  return (
    <div className="signal-board-meeting-log h-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 transition focus-within:border-indigo-400">
      <Milkdown />
    </div>
  );
};

export default MeetingLogEditor;
