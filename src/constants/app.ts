export interface RoomTheme {
  name: string;
  desc: string;
  weather: 'rain' | 'snow' | 'motes' | 'aurora' | 'streaks';
  top: string;
  bot: string;
  accent: string;
  audioProfile: 'train' | 'rain' | 'library' | 'ethereal';
}

export const ROOM_CONFIG: Record<string, RoomTheme> = {
  'last-train': { 
    name: 'The Last Train', 
    desc: 'a rhythmic journey through the sleeping city suburbs.', 
    weather: 'streaks', 
    top: '#05051a', 
    bot: '#0a0a2b', 
    accent: '#5a67d8',
    audioProfile: 'train'
  },
  'window-seat': { 
    name: 'Window Seat', 
    desc: 'watching heavy drops race down the glass in silence.', 
    weather: 'rain', 
    top: '#0a0b12', 
    bot: '#1a1c2c', 
    accent: '#63b3ed',
    audioProfile: 'rain'
  },
  'between-pages': { 
    name: 'Between Pages', 
    desc: 'a sanctuary of old paper and the smell of ancient ink.', 
    weather: 'motes', 
    top: '#1a0f0a', 
    bot: '#2d1b12', 
    accent: '#ed8936',
    audioProfile: 'library'
  },
  'northern-lights': { 
    name: 'Northern Lights', 
    desc: 'where the sky dances in violet and shimmering emerald.', 
    weather: 'aurora', 
    top: '#0d0221', 
    bot: '#1a0b2e', 
    accent: '#48bb78',
    audioProfile: 'ethereal'
  }
};

export const DEFAULT_ROOM = 'window-seat';

export const MYTHIC_ECHO_LINES = [
    "did you see the sky change just now?", "i stayed awake to watch the lights.", "listening to the train from a long time ago.",
    "it feels warmer in here tonight.", "leaving a page open for you.", "the city looks beautiful from this high up."
];

export const AMBIENT_THOUGHTS = [
    "the world feels smaller from here.", "someone is reading the same page elsewhere.", "the train never seems to stop.", "it's okay to just exist right now.",
    "the café hums softly tonight.", "the lights flicker like they remember something...", "a quiet draft brushes past...",
    "a distant melody lingers in the air.", "the dust motes drift endlessly.", "this room feels older tonight."
];
