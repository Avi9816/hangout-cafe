import { RoomHistoryEvent } from '../types';
import { RoomMetadata } from './roomSoul';

export interface RoomEcho {
  id: string;
  text: string;
  tone: 'quiet' | 'warm' | 'memory' | 'media' | 'visitor';
  sourceType: 'history' | 'metadata';
  createdAt?: number;
}

export function getRoomEchoes(input: {
  history?: RoomHistoryEvent[];
  metadata?: Partial<RoomMetadata>;
  max?: number;
}): RoomEcho[] {
  const { history = [], metadata = {}, max = 3 } = input;
  const echoes: RoomEcho[] = [];

  // Helper to check if an alias is available and valid
  const getEventAlias = (event: RoomHistoryEvent): string | null => {
    if (!event.createdBy) return null;
    const clean = event.createdBy.trim();
    if (!clean || clean.toLowerCase() === 'wanderer') return null;
    return clean;
  };

  // 1. Process history events
  // Group and count events by type (excluding 'room_created')
  const historyByType: Record<string, RoomHistoryEvent[]> = {};

  const validHistory = history.filter(h => h && h.type && h.type !== 'room_created');
  
  // Sort history events newest first to ensure correct latest timestamp and alias
  const sortedHistory = [...validHistory].sort((a, b) => {
    const timeA = typeof a.createdAt === 'number' && !isNaN(a.createdAt) ? a.createdAt : 0;
    const timeB = typeof b.createdAt === 'number' && !isNaN(b.createdAt) ? b.createdAt : 0;
    return timeB - timeA;
  });

  for (const event of sortedHistory) {
    if (!historyByType[event.type]) {
      historyByType[event.type] = [];
    }
    historyByType[event.type].push(event);
  }

  for (const type of Object.keys(historyByType)) {
    const events = historyByType[type];
    if (events.length === 0) continue;

    const newestEvent = events[0];
    const count = events.length;
    const alias = getEventAlias(newestEvent);

    let text = '';
    let tone: 'quiet' | 'warm' | 'memory' | 'media' | 'visitor' = 'memory';

    switch (type) {
      case 'note_pinned':
        if (count > 1) {
          text = 'A few thoughts were pinned to the wall.';
        } else {
          text = alias 
            ? `${alias} pinned a thought to the wall.`
            : 'Someone pinned a thought to the wall.';
        }
        tone = 'memory';
        break;

      case 'object_placed':
        if (count > 1) {
          text = 'A few things were left behind.';
        } else {
          text = alias 
            ? `${alias} left something behind.`
            : 'Someone left something behind.';
        }
        tone = 'warm';
        break;

      case 'photo_added':
        if (count > 1) {
          text = 'Some photographs were left behind.';
        } else {
          text = 'A photograph was left behind.';
        }
        tone = 'memory';
        break;

      case 'tape_played':
        if (count > 1) {
          text = 'Tapes played here recently.';
        } else {
          text = 'A tape played here recently.';
        }
        tone = 'media';
        break;

      case 'host_changed':
        if (count > 1) {
          text = 'The space passed the tape around.';
        } else {
          text = 'The space passed the tape to someone else.';
        }
        tone = 'media';
        break;

      case 'whisper_left':
        if (count > 1) {
          text = 'A few whispers were left for later.';
        } else {
          text = alias 
            ? `${alias} left a whisper for later.`
            : 'Someone left a whisper for later.';
        }
        tone = 'memory';
        break;

      default:
        continue;
    }

    if (text) {
      echoes.push({
        id: `history-${type}`,
        text,
        tone,
        sourceType: 'history',
        createdAt: typeof newestEvent.createdAt === 'number' && !isNaN(newestEvent.createdAt) && newestEvent.createdAt > 0 
          ? newestEvent.createdAt 
          : undefined
      });
    }
  }

  // Sort history echoes by newest first
  echoes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // 2. Process metadata events (as soft room-level traces if they exist)
  const metadataEchoes: RoomEcho[] = [];

  const visitCount = typeof metadata.visitCount === 'number' && !isNaN(metadata.visitCount) ? metadata.visitCount : 0;
  const visitorCount = typeof metadata.visitorCount === 'number' && !isNaN(metadata.visitorCount) ? metadata.visitorCount : 0;
  const memoryCount = typeof metadata.memoryCount === 'number' && !isNaN(metadata.memoryCount) ? metadata.memoryCount : 0;
  const photoCount = typeof metadata.photoCount === 'number' && !isNaN(metadata.photoCount) ? metadata.photoCount : 0;

  if (visitCount > 1) {
    metadataEchoes.push({
      id: 'metadata-visit',
      text: 'This space has been returned to.',
      tone: 'warm',
      sourceType: 'metadata'
    });
  }

  if (visitorCount > 1) {
    metadataEchoes.push({
      id: 'metadata-visitor',
      text: 'More than one wanderer has passed through here.',
      tone: 'visitor',
      sourceType: 'metadata'
    });
  }

  if (memoryCount > 0) {
    metadataEchoes.push({
      id: 'metadata-memory',
      text: 'This space has started keeping memories.',
      tone: 'memory',
      sourceType: 'metadata'
    });
  }

  if (photoCount > 0) {
    metadataEchoes.push({
      id: 'metadata-photo',
      text: 'There are photographs tucked into this space.',
      tone: 'memory',
      sourceType: 'metadata'
    });
  }

  if (metadata.currentTapeTitle) {
    metadataEchoes.push({
      id: 'metadata-tape',
      text: 'A tape is waiting here.',
      tone: 'media',
      sourceType: 'metadata'
    });
  }

  // Combine history echoes first, then metadata-level traces, up to max
  const combined = [...echoes, ...metadataEchoes];

  return combined.slice(0, max);
}
