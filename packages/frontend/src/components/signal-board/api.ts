import { STATE_API_KEY } from './constants';
import { parseBoard } from './boardModel';
import type { BoardState, StateApiResponse } from './types';

export const fetchSignalBoard = async (): Promise<BoardState> => {
  const response = await fetch(`/api/state/${STATE_API_KEY}`);
  if (!response.ok) {
    throw new Error(`Board API returned ${response.status}`);
  }

  const data = (await response.json()) as StateApiResponse;
  const board = parseBoard(data.value);
  if (!board) {
    throw new Error('Board API returned invalid board state');
  }

  return board;
};

export const saveSignalBoard = async (board: BoardState) => {
  const response = await fetch(`/api/state/${STATE_API_KEY}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(board) }),
  });

  if (!response.ok) {
    throw new Error(`Board API save failed with ${response.status}`);
  }
};
