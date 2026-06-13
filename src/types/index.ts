export interface UserProfile {
  alias: string;
  mood: string;
  awakeReason?: string;
  joined: number;
  lastRoom?: string | null;
  visits: number;
  firstVisit: number;
}

export interface Note {
  text: string;
  author: string;
  id: number;
  isEcho?: boolean;
}

export interface MemoryObject {
  emoji: string;
  label: string;
  author: string;
  id: number;
  isMythic?: boolean;
}

export interface VideoState {
  type: 'youtube' | 'magnet';
  url: string;
  action: 'play' | 'pause';
  time: number;
  host: string;
  title?: string;
  sender?: string;
  timestamp?: number;
  hostId?: string;
}

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  addedBy: string;
  addedAt: number;
  status: 'pending' | 'playing' | 'completed';
}

export interface RoomState {
  spotify?: string;
  spotifyHost?: string;
}

export interface ActionLog {
  text: string;
  emoji: string;
  time: number;
  id: number;
  isTrace: boolean;
}

export interface RoomHistoryEvent {
  id: string;
  type:
    | 'tape_played'
    | 'note_pinned'
    | 'object_placed'
    | 'host_changed'
    | 'room_created'
    | 'photo_added';
  text: string;
  createdAt: number;
  createdBy: string;
}

export interface RoomPhoto {
  id: string;
  url: string;
  caption: string;
  uploadedBy: string;
  creatorUid: string;
  createdAt: number;
}

export interface RoomMemory {
  id: string;
  type:
    | 'note'
    | 'object'
    | 'tape'
    | 'moment';
  title: string;
  description?: string;
  createdAt: number;
  createdBy: string;
  creatorUid?: string;
  payload: any;
}

declare global {
  interface Window {
    app?: any;
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
    WebTorrent?: any;
  }
}
