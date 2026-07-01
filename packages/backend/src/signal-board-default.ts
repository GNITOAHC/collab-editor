export const SIGNAL_BOARD_STATE_KEY = 'signal-board';

export function createDefaultSignalBoardState() {
  return {
    meta: {
      meetLink: '',
      meetSchedule: '',
    },
    sections: [
      {
        id: 'section_general',
        name: 'General',
        accent: '#818cf8',
        notes: '',
        groups: [],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
