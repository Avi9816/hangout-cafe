export const APP_EVENTS = {
  // Identity & Auth
  AUTH_STATE_CHANGED: 'auth:state_changed',
  IDENTITY_READY: 'auth:identity_ready',

  // Room & World
  ROOM_JOIN_REQUEST: 'world:join_request',
  ROOM_CHANGED: 'world:room_changed',
  TIME_TICK: 'world:time_tick',
  USER_COUNT_UPDATED: 'world:user_count',

  // Interaction (Local -> Service)
  NOTE_POSTED: 'local:note_posted',
  OBJECT_PLACED: 'local:object_placed',
  MEDIA_PLAY_REQUEST: 'local:media_play',
  MEDIA_ENDED: 'local:media_ended',

  // Sync (Service -> UI/Engines)
  REMOTE_NOTES_UPDATED: 'sync:notes',
  REMOTE_OBJECTS_UPDATED: 'sync:objects',
  REMOTE_MEDIA_UPDATED: 'sync:media',
  SYNC_QUEUE: 'sync:queue',
  SYNC_HISTORY: 'sync:history',
  SYNC_MEMORIES: 'sync:memories',
  AMBIENT_ACTION_RECEIVED: 'sync:action',

  // Feedback (Engines -> UI)
  UI_SFX_REQUEST: 'ui:play_sfx',
  FEED_PUSH_REQUEST: 'ui:feed_push'
} as const;

export type AppEvent = typeof APP_EVENTS[keyof typeof APP_EVENTS];
