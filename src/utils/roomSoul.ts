export type RoomSoulLevel = 'quiet' | 'remembered' | 'lived-in' | 'old-soul';

export interface RoomSoul {
  level: RoomSoulLevel;
  label: string;
  shortDescription: string;
  description: string;
  score: number;
  cssClass: string;
  accentHint: string;
}

export interface RoomMetadata {
  memoryCount?: number;
  photoCount?: number;
  visitorCount?: number;
  visitCount?: number;
  activeCount?: number;
  createdAt?: any;
  lastActiveAt?: any;
  currentTapeTitle?: string;
  currentHost?: string;
}

export function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

export function safeTimestampToMillis(value: any): number | null {
  if (value === null || value === undefined) return null;

  // 1. Firestore Timestamp
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    try {
      const ms = value.toMillis();
      if (typeof ms === 'number' && !isNaN(ms)) return ms;
    } catch (_) {}
  }

  // 2. Date object
  if (value instanceof Date) {
    const time = value.getTime();
    return isNaN(time) ? null : time;
  }

  // 3. Number (milliseconds)
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  // 4. String (date string or numeric string)
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return parsed;

    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') return num;
  }

  return null;
}

export function getRoomSoul(roomMeta: Partial<RoomMetadata>): RoomSoul {
  const memoryCount = safeNumber(roomMeta.memoryCount, 0);
  const photoCount = safeNumber(roomMeta.photoCount, 0);
  const visitorCount = safeNumber(roomMeta.visitorCount, 0);
  const visitCount = safeNumber(roomMeta.visitCount, 0);

  // 1. Calculate weighted score contributions
  const scoreMemories = Math.min(memoryCount * 3, 30);
  const scorePhotos = Math.min(photoCount * 2, 20);
  const scoreVisitors = Math.min(visitorCount * 1, 20);
  const scoreVisits = Math.min(visitCount * 0.5, 20);

  // 2. Calculate age contribution
  let scoreAge = 0;
  const createdAtMs = safeTimestampToMillis(roomMeta.createdAt);
  if (createdAtMs !== null) {
    const ageMs = Date.now() - createdAtMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 90) {
      scoreAge = 24;
    } else if (ageDays > 30) {
      scoreAge = 16;
    } else if (ageDays > 7) {
      scoreAge = 8;
    }
  }

  // 3. Calculate active contribution
  let scoreActive = 0;
  const lastActiveMs = safeTimestampToMillis(roomMeta.lastActiveAt);
  if (lastActiveMs !== null) {
    const recencyMs = Date.now() - lastActiveMs;
    const recencyHours = recencyMs / (1000 * 60 * 60);
    if (recencyHours <= 24) {
      scoreActive = 5;
    } else if (recencyHours <= 7 * 24) {
      scoreActive = 3;
    }
  }

  // 4. Sum and clamp
  const totalScore = Math.min(
    Math.max(
      scoreMemories + scorePhotos + scoreVisitors + scoreVisits + scoreAge + scoreActive,
      0
    ),
    100
  );

  // 5. Determine level
  let level: RoomSoulLevel = 'quiet';
  let label = 'Quiet space';
  let shortDescription = 'Still quiet.';
  let description = 'This space is still quiet. A few traces may be all it needs.';
  let cssClass = 'room-soul-quiet';
  let accentHint = 'muted';

  if (totalScore >= 70) {
    level = 'old-soul';
    label = 'Old soul';
    shortDescription = 'Old enough to keep secrets.';
    description = 'This space has been returned to, remembered, and left with stories.';
    cssClass = 'room-soul-old-soul';
    accentHint = 'gold';
  } else if (totalScore >= 40) {
    level = 'lived-in';
    label = 'Lived-in space';
    shortDescription = 'Feels lived-in.';
    description = 'This space has gathered notes, visits, and small pieces of people.';
    cssClass = 'room-soul-lived-in';
    accentHint = 'orange';
  } else if (totalScore >= 15) {
    level = 'remembered';
    label = 'Remembered space';
    shortDescription = 'Beginning to remember.';
    description = 'People have started leaving small traces here.';
    cssClass = 'room-soul-remembered';
    accentHint = 'amber';
  }

  return {
    level,
    label,
    shortDescription,
    description,
    score: totalScore,
    cssClass,
    accentHint,
  };
}
