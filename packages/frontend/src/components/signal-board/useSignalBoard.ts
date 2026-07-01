import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSignalBoard, saveSignalBoard } from './api';
import { ACCENTS, FINISH_LONG_PRESS_MS } from './constants';
import {
  activeChildren,
  cloneBoard,
  collectArchive,
  countTasks,
  createId,
  createTask,
  findSection,
  findTaskDeep,
  findTaskInSection,
  normalizeLink,
} from './boardModel';
import type { BoardState, PendingFinishStatus } from './types';

export const useSignalBoard = () => {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [openAdders, setOpenAdders] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingFinish, setPendingFinish] = useState<Record<string, PendingFinishStatus | undefined>>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishPressCommittedRef = useRef(false);

  const loadBoard = useCallback(async () => {
    hydratedRef.current = false;
    setIsLoading(true);
    setLoadError(null);

    try {
      const next = await fetchSignalBoard();
      setBoard(next);
      setCurrentSectionId(next.sections[0]?.id ?? '');
      hydratedRef.current = true;
    } catch (error) {
      console.error('Error loading signal board:', error);
      setBoard(null);
      setLoadError('Unable to load the board from the database.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const persistBoard = useCallback(async (next: BoardState) => {
    try {
      await saveSignalBoard(next);
    } catch (error) {
      console.error('Error saving signal board:', error);
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !board) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistBoard(board);
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [board, persistBoard]);

  useEffect(() => {
    if (!board || board.sections.length === 0) return;
    if (!currentSectionId || !findSection(board, currentSectionId)) {
      setCurrentSectionId(board.sections[0].id);
      setActiveFilter(null);
    }
  }, [board, currentSectionId]);

  const section = useMemo(
    () => (board ? findSection(board, currentSectionId) ?? board.sections[0] : undefined),
    [board, currentSectionId]
  );

  const ownerFilters = useMemo(() => {
    if (!section) return [];
    return Array.from(new Set(section.groups.map((group) => group.owner)));
  }, [section]);

  const archiveItems = useMemo(() => {
    if (!section) return [];
    return section.groups
      .flatMap((group) => collectArchive(group.tasks, [group.owner]))
      .sort((a, b) => new Date(b.task.completedAt ?? 0).getTime() - new Date(a.task.completedAt ?? 0).getTime());
  }, [section]);

  const sectionTaskCount = useMemo(() => {
    if (!section) return 0;
    return section.groups.reduce((total, group) => total + countTasks(group.tasks), 0);
  }, [section]);

  const visibleGroups = useMemo(() => {
    if (!section) return [];
    return activeFilter ? section.groups.filter((group) => group.owner === activeFilter) : section.groups;
  }, [activeFilter, section]);

  const updateBoard = useCallback((mutate: (draft: BoardState) => void) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const next = cloneBoard(prev);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      return next;
    });
  }, []);

  const finishTask = useCallback(
    (taskId: string, status: PendingFinishStatus) => {
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const found = findTaskInSection(draftSection, taskId);
        if (!found) return;
        found.task.status = status;
        found.task.completedAt = new Date().toISOString();
        if (status === 'done') found.task.percent = 100;
      });
    },
    [currentSectionId, updateBoard]
  );

  const clearFinishPressTimer = useCallback(() => {
    if (finishPressTimerRef.current) {
      clearTimeout(finishPressTimerRef.current);
      finishPressTimerRef.current = null;
    }
  }, []);

  const cyclePendingFinish = useCallback((taskId: string) => {
    if (finishPressCommittedRef.current) {
      finishPressCommittedRef.current = false;
      return;
    }

    setPendingFinish((prev) => {
      const current = prev[taskId];
      const next = { ...prev };
      if (!current) next[taskId] = 'done';
      else if (current === 'done') next[taskId] = 'cancelled';
      else delete next[taskId];
      return next;
    });
  }, []);

  const startFinishLongPress = useCallback(
    (taskId: string) => {
      clearFinishPressTimer();
      finishPressCommittedRef.current = false;

      const status = pendingFinish[taskId];
      if (!status) return;

      finishPressTimerRef.current = setTimeout(() => {
        finishPressCommittedRef.current = true;
        finishTask(taskId, status);
        setPendingFinish((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        finishPressTimerRef.current = null;
      }, FINISH_LONG_PRESS_MS);
    },
    [clearFinishPressTimer, finishTask, pendingFinish]
  );

  useEffect(() => () => clearFinishPressTimer(), [clearFinishPressTimer]);

  const toggleStar = useCallback(
    (taskId: string) => {
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const found = findTaskInSection(draftSection, taskId);
        if (found) found.task.starred = !found.task.starred;
      });
    },
    [currentSectionId, updateBoard]
  );

  const editTaskText = useCallback(
    (taskId: string, text: string | null) => {
      const nextText = text?.trim();
      if (!nextText) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const found = findTaskInSection(draftSection, taskId);
        if (found) found.task.text = nextText;
      });
    },
    [currentSectionId, updateBoard]
  );

  const editOwner = useCallback(
    (groupId: string, owner: string | null) => {
      const nextOwner = owner?.trim();
      if (!nextOwner) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        const group = draftSection?.groups.find((item) => item.id === groupId);
        if (group) group.owner = nextOwner;
      });
    },
    [currentSectionId, updateBoard]
  );

  const editPercent = useCallback(
    (taskId: string) => {
      const current = section ? findTaskInSection(section, taskId)?.task.percent : null;
      const value = window.prompt('Progress percent, 0-100. Leave blank to clear.', current == null ? '' : String(current));
      if (value === null) return;

      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const found = findTaskInSection(draftSection, taskId);
        if (!found) return;

        if (!value.trim()) {
          found.task.percent = null;
          return;
        }

        const percent = Math.max(0, Math.min(100, Number.parseInt(value, 10) || 0));
        found.task.percent = percent;
        if (percent > 0 && found.task.status === 'todo') found.task.status = 'in_progress';
      });
    },
    [currentSectionId, section, updateBoard]
  );

  const editLink = useCallback(
    (taskId: string) => {
      const current = section ? findTaskInSection(section, taskId)?.task.link : null;
      const value = window.prompt('Task link. Leave blank to remove.', current ?? '');
      if (value === null) return;

      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const found = findTaskInSection(draftSection, taskId);
        if (found) found.task.link = normalizeLink(value);
      });
    },
    [currentSectionId, section, updateBoard]
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      if (!window.confirm('Delete this task?')) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        for (const group of draftSection.groups) {
          const found = findTaskDeep(group.tasks, taskId);
          if (found) {
            found.list.splice(found.list.indexOf(found.task), 1);
            return;
          }
        }
      });
    },
    [currentSectionId, updateBoard]
  );

  const deleteGroup = useCallback(
    (groupId: string) => {
      if (!window.confirm('Delete this group and all of its tasks?')) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (draftSection) draftSection.groups = draftSection.groups.filter((group) => group.id !== groupId);
      });
    },
    [currentSectionId, updateBoard]
  );

  const addTask = useCallback(
    (groupId: string | null, parentTaskId: string | null, text: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (!draftSection) return;
        const newTask = createTask(cleanText);
        if (parentTaskId) {
          const found = findTaskInSection(draftSection, parentTaskId);
          if (found) found.task.children.push(newTask);
          return;
        }
        const group = draftSection.groups.find((item) => item.id === groupId);
        if (group) group.tasks.push(newTask);
      });
    },
    [currentSectionId, updateBoard]
  );

  const addGroup = useCallback(
    (ownerName: string) => {
      const owner = ownerName.trim();
      if (!owner) return;
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (draftSection) draftSection.groups.push({ id: createId('group'), owner, tasks: [] });
      });
      setNewGroupName('');
    },
    [currentSectionId, updateBoard]
  );

  const addSection = useCallback(() => {
    const name = window.prompt('New section name:');
    if (!name?.trim()) return;
    const cleanName = name.trim();
    const nextId = createId('section');
    updateBoard((draft) => {
      draft.sections.push({
        id: nextId,
        name: cleanName,
        accent: ACCENTS[draft.sections.length % ACCENTS.length],
        notes: '',
        groups: [],
      });
    });
    setCurrentSectionId(nextId);
    setActiveFilter(null);
  }, [updateBoard]);

  const deleteSection = useCallback(() => {
    if (!board || !section) return;

    if (board.sections.length <= 1) {
      window.alert('At least one section must remain.');
      return;
    }

    const sectionIndex = board.sections.findIndex((item) => item.id === section.id);
    if (sectionIndex === -1) return;

    const nextSection = board.sections[sectionIndex + 1] ?? board.sections[sectionIndex - 1];
    const confirmation = window.prompt(
      `Delete section "${section.name}"?\n\n` +
        `This removes ${section.groups.length} groups and ${sectionTaskCount} tasks, including archived tasks.\n\n` +
        `Type the exact section name to confirm:`,
      ''
    );

    if (confirmation === null) return;
    if (confirmation !== section.name) {
      window.alert('Section name did not match. Nothing was deleted.');
      return;
    }

    updateBoard((draft) => {
      if (draft.sections.length <= 1) return;
      draft.sections = draft.sections.filter((item) => item.id !== section.id);
    });

    if (nextSection) setCurrentSectionId(nextSection.id);
    setActiveFilter(null);
    setArchiveOpen(false);
    setOpenAdders(new Set());
  }, [board, section, sectionTaskCount, updateBoard]);

  const updateNotes = useCallback(
    (value: string) => {
      updateBoard((draft) => {
        const draftSection = findSection(draft, currentSectionId);
        if (draftSection) draftSection.notes = value;
      });
    },
    [currentSectionId, updateBoard]
  );

  const toggleAdder = useCallback((key: string) => {
    setOpenAdders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const submitAdd = useCallback(
    (key: string, groupId: string | null, parentTaskId: string | null) => {
      const value = drafts[key] ?? '';
      if (!value.trim()) return;
      addTask(groupId, parentTaskId, value);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setOpenAdders((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [addTask, drafts]
  );

  return {
    activeFilter,
    addGroup,
    addSection,
    archiveItems,
    archiveOpen,
    board,
    clearFinishPressTimer,
    currentSectionId,
    cyclePendingFinish,
    deleteGroup,
    deleteSection,
    deleteTask,
    drafts,
    editLink,
    editOwner,
    editPercent,
    editTaskText,
    isLoading,
    loadBoard,
    loadError,
    newGroupName,
    openAdders,
    ownerFilters,
    pendingFinish,
    section,
    setActiveFilter,
    setArchiveOpen,
    setCurrentSectionId,
    setDrafts,
    setNewGroupName,
    startFinishLongPress,
    submitAdd,
    toggleAdder,
    toggleStar,
    updateNotes,
    visibleGroups,
  };
};
