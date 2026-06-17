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
    name: 'Vinyl Corner', 
    desc: 'warm record shop / late-night listening corner. music discovery, favorite albums, music taste.', 
    weather: 'streaks', 
    top: '#05051a', 
    bot: '#0a0a2b', 
    accent: '#5a67d8',
    audioProfile: 'train'
  },
  'window-seat': { 
    name: 'Rooftop', 
    desc: 'late-night city skyline. casual conversation, icebreakers, low-pressure social discovery.', 
    weather: 'rain', 
    top: '#0a0b12', 
    bot: '#1a1c2c', 
    accent: '#63b3ed',
    audioProfile: 'rain'
  },
  'between-pages': { 
    name: 'Between The Pages', 
    desc: 'warm digital library. books, quotes, recommendations, currently reading, thoughtful discussions.', 
    weather: 'motes', 
    top: '#1a0f0a', 
    bot: '#2d1b12', 
    accent: '#ed8936',
    audioProfile: 'library'
  },
  'northern-lights': { 
    name: 'Northern Lights', 
    desc: 'quiet and contemplative. reflections, daily prompts, anonymous thoughts, deeper discussion.', 
    weather: 'aurora', 
    top: '#0d0221', 
    bot: '#1a0b2e', 
    accent: '#48bb78',
    audioProfile: 'ethereal'
  }
};

export const DEFAULT_ROOM = 'window-seat';

export const MYTHIC_ECHO_LINES = [
    "did you see the sky change just now?", "i stayed awake to watch the lights.", "listening to the record from a long time ago.",
    "it feels warmer in here tonight.", "leaving a page open for you.", "the city looks beautiful from this high up."
];

export const AMBIENT_THOUGHTS = [
    "the world feels smaller from here.", "someone is reading the same page elsewhere.", "the record never seems to stop.", "it's okay to just exist right now.",
    "the space hums softly tonight.", "the lights flicker like they remember something...", "a quiet draft brushes past...",
    "a distant melody lingers in the air.", "the dust motes drift endlessly.", "this space feels older tonight."
];
