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

declare global {
  interface Window {
    app?: any;
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
    WebTorrent?: any;
  }
}
