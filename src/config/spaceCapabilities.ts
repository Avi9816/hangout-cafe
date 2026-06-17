export interface SpaceCapabilities {
  allowsMediaSync: boolean;
  allowsHostControl: boolean;
  allowsPhotos: boolean;
  allowsNotes: boolean;
  allowsWhispers: boolean;
  allowsPublicActivities: boolean;
  allowsPresence: boolean;
  allowsRoomMemory: boolean;
}

export function isPublicSpace(roomCode: string): boolean {
  return ['between-pages', 'window-seat', 'northern-lights', 'last-train'].includes(roomCode);
}

export function isPrivateGathering(roomCode: string): boolean {
  return !isPublicSpace(roomCode);
}

export function getSpaceCapabilities(roomCode: string): SpaceCapabilities {
  const isPublic = isPublicSpace(roomCode);
  return {
    allowsMediaSync: !isPublic,
    allowsHostControl: !isPublic,
    allowsPhotos: !isPublic,
    allowsNotes: true,
    allowsWhispers: true,
    allowsPublicActivities: isPublic,
    allowsPresence: true,
    allowsRoomMemory: true
  };
}

export interface PublicActivityPrompt {
  id: string;
  text: string;
}

export interface PublicSpaceActivityConfig {
  roomCode: string;
  title: string;
  subtitle: string;
  prompts: PublicActivityPrompt[];
  defaultPromptIndex: number;
}

export const PUBLIC_SPACE_CONFIGS: Record<string, PublicSpaceActivityConfig> = {
  'between-pages': {
    roomCode: 'between-pages',
    title: 'Between The Pages',
    subtitle: 'warm digital library. books, quotes, recommendations, currently reading.',
    prompts: [
      { id: 'bp-1', text: 'What book changed how you look at the world?' },
      { id: 'bp-2', text: 'Share a quote that you found yourself reading twice.' },
      { id: 'bp-3', text: 'Which book do you always return to when the nights are cold?' },
      { id: 'bp-4', text: 'What is a book you think everyone should read at least once?' }
    ],
    defaultPromptIndex: 0
  },
  'window-seat': {
    roomCode: 'window-seat',
    title: 'Rooftop',
    subtitle: 'late-night city skyline. casual conversation, icebreakers, low-pressure social discovery.',
    prompts: [
      { id: 'ws-1', text: 'If you could watch the sunrise from anywhere in the world tomorrow, where would you be?' },
      { id: 'ws-2', text: 'What is a small, quiet thing that brought you joy today?' },
      { id: 'ws-3', text: 'If you had to choose a theme song for the hour you are in, what would it be?' },
      { id: 'ws-4', text: 'What is a habit or a hobby you picked up recently?' }
    ],
    defaultPromptIndex: 0
  },
  'northern-lights': {
    roomCode: 'northern-lights',
    title: 'Northern Lights',
    subtitle: 'quiet and contemplative. reflections, daily prompts, anonymous thoughts, deeper discussion.',
    prompts: [
      { id: 'nl-1', text: 'What did you learn about yourself today?' },
      { id: 'nl-2', text: 'What is something you are holding onto that you should let go of?' },
      { id: 'nl-3', text: 'In this quiet hour, what are you most grateful for?' },
      { id: 'nl-4', text: 'What does peace feel like to you right now?' }
    ],
    defaultPromptIndex: 0
  },
  'last-train': {
    roomCode: 'last-train',
    title: 'Vinyl Corner',
    subtitle: 'warm record shop / late-night listening corner. music discovery, favorite albums, music taste.',
    prompts: [
      { id: 'lt-1', text: 'What album matches the weather outside right now?' },
      { id: 'lt-2', text: 'Tell us about a song that reminds you of someone you miss.' },
      { id: 'lt-3', text: 'What is your go-to record after midnight?' },
      { id: 'lt-4', text: 'Which album has no skipped tracks for you?' }
    ],
    defaultPromptIndex: 0
  }
};

export function getPublicSpaceActivityConfig(roomCode: string): PublicSpaceActivityConfig | null {
  return PUBLIC_SPACE_CONFIGS[roomCode] || null;
}
