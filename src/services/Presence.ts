import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { db, initFirebase } from '../config/firebase';
import { doc, setDoc, getDoc, onSnapshot, Unsubscribe, updateDoc, deleteField, collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, runTransaction } from 'firebase/firestore';
import { UserProfile, Note, MemoryObject, QueueItem, RoomHistoryEvent, RoomMemory } from '../types';
import { $ } from '../utils/dom'; 
import { debounce as debounceUtil } from '../utils/timing';
import { devLog } from '../utils/logger';

declare const __app_id: any;

export class SharedPresence {
  private bus: EventBus;
  get db() {
    return db;
  }
  
  profile: UserProfile | null = null;
  lifecycle = new LifecycleManager();
  
  appId: string;
  userId: string | null = null;
  unsub: Unsubscribe | null = null;
  isRemoteUpdate = false;
  roomCode: string | null = null;
  activeUsers: Record<string, any> = {};
  ghostUsers: Record<string, any> = {};
  
  notes: Note[] = [];
  objects: MemoryObject[] = [];
  currentVideoState: any = null;
  lastActionTimestamp = 0;
  unsubNotes: Unsubscribe | null = null;
  useSubcollectionNotes = false;
  unsubObjects: Unsubscribe | null = null;
  useSubcollectionObjects = false;
  unsubPresence: Unsubscribe | null = null;
  useSubcollectionPresence = false;
  unsubQueue: Unsubscribe | null = null;
  queue: QueueItem[] = [];
  unsubHistory: Unsubscribe | null = null;
  unsubMemories: Unsubscribe | null = null;
  history: RoomHistoryEvent[] = [];
  memories: RoomMemory[] = [];
  joinedAt = 0;
  
  pendingJoin: { room: string, theme: string | null } | null = null;
  sessionStart = Date.now();

  debouncedSyncNotes = debounceUtil((notes: Note[]) => {
      if(!this.userId || !db || !this.roomCode) return;
      console.log('[FIRESTORE_ROOM_WRITE] notes sync start:', notes);
      setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { notes }, { merge: true })
        .then(() => console.log('[FIRESTORE_ROOM_WRITE] notes sync SUCCESS'))
        .catch(err => console.error('[FIRESTORE_ROOM_WRITE] notes sync ERROR:', err));
  }, 500);

  debouncedSyncObjects = debounceUtil((objects: MemoryObject[]) => {
      if(!this.userId || !db || !this.roomCode) return;
      console.log('[FIRESTORE_ROOM_WRITE] objects sync start:', objects);
      setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { objects }, { merge: true })
        .then(() => console.log('[FIRESTORE_ROOM_WRITE] objects sync SUCCESS'))
        .catch(err => console.error('[FIRESTORE_ROOM_WRITE] objects sync ERROR:', err));
  }, 500);

  constructor(bus: EventBus) {
    this.bus = bus;
    this.appId = (typeof __app_id !== 'undefined' && __app_id && String(__app_id).trim() !== '') ? String(__app_id) : 'default-app-id';
    
    this.setupIdentityListeners();
    this.setupBusListeners();
    this.lifecycle.setInterval(() => this.updatePresence(), 30000);
    this.bootstrapFirebase();
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => this.leaveRoom());
        window.addEventListener('pagehide', () => this.leaveRoom());
        (window as any).presence = this;
        (window as any)._firestore = { doc, getDoc, collection, getDocs, deleteDoc, updateDoc };
    }
  }

  private setupBusListeners() {
    this.bus.on(APP_EVENTS.NOTE_POSTED, (note: Note) => {
        if(this.profile) note.author = this.profile.alias;
        this.notes.unshift(note);
        if(this.notes.length > 50) this.notes.pop();
        this.debouncedSyncNotes(this.notes);
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} pinned a note`, '📌');

        const alias = this.profile?.alias || 'wanderer';
        const truncatedText = note.text.substring(0, 30) + (note.text.length > 30 ? '...' : '');
        this.addHistoryEvent('note_pinned', `${alias} pinned a note: "${truncatedText}"`);

        if(db && this.roomCode) {
            const notesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'notes');
            addDoc(notesCol, {
                text: note.text,
                author: note.author,
                id: note.id,
                isEcho: note.isEcho || false,
                createdAt: Date.now()
            }).catch(err => console.error('[FIRESTORE_SUBCOL_WRITE] Error writing subcol note:', err));
        }
    });

    this.bus.on(APP_EVENTS.OBJECT_PLACED, (obj: MemoryObject) => {
        if(this.profile) obj.author = this.profile.alias;
        this.objects.unshift(obj);
        if(this.objects.length > 20) this.objects.pop();
        this.debouncedSyncObjects(this.objects);
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} placed a ${obj.label}`, obj.emoji);

        const alias = this.profile?.alias || 'wanderer';
        this.addHistoryEvent('object_placed', `${alias} placed a ${obj.label}`);

        if(db && this.roomCode) {
            const objectsCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'objects');
            addDoc(objectsCol, {
                emoji: obj.emoji,
                label: obj.label,
                author: obj.author,
                id: obj.id,
                isMythic: obj.isMythic || false,
                createdAt: Date.now()
            }).catch(err => console.error('[FIRESTORE_SUBCOL_WRITE] Error writing subcol object:', err));
        }
    });

    this.bus.on(APP_EVENTS.ROOM_JOIN_REQUEST, (data: any) => {
        devLog('[ROOM_JOIN_REQUEST_RECEIVED]', data);
        const roomKey = typeof data === 'string' ? data : data.room;
        const theme = typeof data === 'object' ? data.theme : null;
        this.joinRoom(roomKey, theme);
    });

    this.bus.on(APP_EVENTS.MEDIA_PLAY_REQUEST, (data: any) => {
        if(!this.userId || !db || !this.roomCode) return;
        const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
        if (data.type === 'spotify') {
            setDoc(ref, { state: { spotify: data.url, spotifyHost: this.profile?.alias || 'wanderer' } }, { merge: true });
        } else if (data.type === 'youtube' || data.type === 'magnet') {
            if (data.isEnqueue) {
                this.enqueueMedia(data.url, data.title || 'unnamed tape');
                return;
            }
            const currentVideo = this.currentVideoState;
            const isUrlChanging = !currentVideo || currentVideo.url !== data.url;
            const isHost = currentVideo && currentVideo.hostId === this.userId;
            
            if (isUrlChanging || isHost) {
                const hostId = isUrlChanging ? this.userId : currentVideo.hostId;
                setDoc(ref, { 
                    video: { 
                        ...data, 
                        hostId,
                        host: this.profile?.alias || 'wanderer', 
                        sender: this.userId 
                    } 
                }, { merge: true });
                
                if (isUrlChanging) {
                    const tapeTitle = data.title || 'unnamed tape';
                    this.addHistoryEvent('tape_played', `Started playing tape "${tapeTitle}"`);
                }
                if (isUrlChanging && data.type === 'magnet') {
                    this.broadcastActivity(`${this.profile?.alias || 'wanderer'} started a tape`, '📼');
                }
            } else {
                devLog('[MEDIA_CONTROL_BLOCKED] Blocked non-host media control from:', this.userId);
                const statusEl = $('wt-status');
                if (statusEl) {
                    statusEl.textContent = 'Only the host can control shared playback';
                    setTimeout(() => {
                        if (statusEl.textContent === 'Only the host can control shared playback') {
                            statusEl.textContent = '';
                        }
                    }, 3000);
                }
            }
        }
    });

    this.bus.on(APP_EVENTS.MEDIA_ENDED, (data: any) => {
        devLog('[MEDIA_ENDED_RECEIVED]', data);
        if (this.currentVideoState && this.currentVideoState.hostId === this.userId) {
            devLog('[MEDIA_ENDED_RECEIVED] We are the host. Auto-advancing queue...');
            this.playNextInQueue();
        } else {
            devLog('[MEDIA_ENDED_RECEIVED] We are not the host. Viewer ignores ended event.');
        }
    });
  }

  useFallbackUserId() {
    let storedId = localStorage.getItem('hangout_cafe_anon_uid');
    if (!storedId) {
        storedId = 'anon-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('hangout_cafe_anon_uid', storedId);
    }
    this.userId = storedId;
    devLog('[FALLBACK_USER_ID_USED]', this.userId);
    this.loadIdentity();
  }

  async bootstrapFirebase() {
    const authInstance = await initFirebase();
    if (authInstance) {
        import('firebase/auth').then(({ onAuthStateChanged }) => {
            onAuthStateChanged(authInstance, async (u) => {
                if (u) {
                    this.userId = u.uid;
                    await this.loadIdentity();
                } else {
                    this.useFallbackUserId();
                }
            });
        });
    } else {
        this.useFallbackUserId();
    }
  }

  async loadIdentity() {
    if(!db || !this.userId) return;
    try {
       const ref = doc(db, 'artifacts', this.appId, 'users', this.userId, 'userData', 'profile');
       const snap = await getDoc(ref);
       const overlay = $('identity-overlay');

       if(snap && snap.exists()) {
          this.profile = snap.data() as UserProfile;
          if (overlay) overlay.classList.add('hidden');
          this.applyIdentity();
          
          if(this.pendingJoin) {
              this.joinRoom(this.pendingJoin.room, this.pendingJoin.theme);
              this.pendingJoin = null;
          }
       } else if (overlay) overlay.classList.remove('hidden');
    } catch (err) { console.warn(err); }
  }

  setupIdentityListeners() {
     $('btn-enter-cafe')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        const alias = ($('id-alias') as HTMLInputElement)?.value.trim() || 'wanderer';
        const mood = ($('id-mood') as HTMLInputElement)?.value.trim() || 'resting quietly';
        this.profile = { alias, mood, joined: Date.now(), lastRoom: null, visits: 1, firstVisit: Date.now() };
        
        if(db && this.userId) {
           setDoc(doc(db, 'artifacts', this.appId, 'users', this.userId, 'userData', 'profile'), this.profile, {merge: true});
        }
        $('identity-overlay')?.classList.add('hidden');
        this.applyIdentity();
        if(this.pendingJoin) { this.joinRoom(this.pendingJoin.room, this.pendingJoin.theme); this.pendingJoin = null; }
     });
  }

  applyIdentity() {
     if (!this.profile) return;
     const idEl = $('my-identity'); if (idEl) idEl.textContent = `${this.profile.alias} — ${this.profile.mood}`;
     $('identity-status')?.classList.add('visible');
     const params = new URLSearchParams(window.location.search);
     const corner = params.get('corner');
     if(corner) this.joinRoom(corner);
  }

  broadcastActivity(text: string, emoji: string) {
    if(!this.userId || !db || !this.roomCode) return;
    const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
    setDoc(ref, { 
        latestAction: { text, emoji, sender: this.userId, timestamp: Date.now() } 
    }, { merge: true }).catch(err => console.warn("Failed to broadcast activity:", err));
  }

  leaveRoom() {
    if(!this.userId || !db || !this.roomCode) return;
    
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (this.unsubNotes) { this.unsubNotes(); this.unsubNotes = null; }
    if (this.unsubObjects) { this.unsubObjects(); this.unsubObjects = null; }
    if (this.unsubPresence) { this.unsubPresence(); this.unsubPresence = null; }
    if (this.unsubQueue) { this.unsubQueue(); this.unsubQueue = null; }
    if (this.unsubHistory) { this.unsubHistory(); this.unsubHistory = null; }
    if (this.unsubMemories) { this.unsubMemories(); this.unsubMemories = null; }
    this.queue = [];
    this.history = [];
    this.memories = [];

    const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
    updateDoc(ref, {
        [`presence.${this.userId}`]: deleteField()
    }).catch(err => console.warn("Failed to clean up presence on leaveRoom:", err));

    const presDocRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'presence', this.userId);
    deleteDoc(presDocRef).catch(err => console.warn("Failed to delete presence doc on leaveRoom:", err));
    this.queue = [];
    this.roomCode = null;
    this.currentVideoState = null;
  }

  joinRoom(roomKey: string, theme: string | null = null) {
    if(!this.profile) { this.pendingJoin = { room: roomKey, theme }; return; }
    
    if (this.roomCode && this.roomCode !== roomKey) {
        this.leaveRoom();
    }

    if (this.unsubQueue) { this.unsubQueue(); this.unsubQueue = null; }
    if (this.unsubHistory) { this.unsubHistory(); this.unsubHistory = null; }
    if (this.unsubMemories) { this.unsubMemories(); this.unsubMemories = null; }
    this.queue = [];
    this.history = [];
    this.memories = [];
    this.joinedAt = Date.now();

    this.roomCode = roomKey; this.ghostUsers = {}; this.activeUsers = {}; this.lastActionTimestamp = 0;
    const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(roomKey);
    devLog('[ROOM_CHANGED_EMIT] joinRoom: roomKey = ' + roomKey + ', isPrivate = ' + !isPublic + ', theme = ' + theme);
    this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: roomKey, isPrivate: !isPublic, theme: theme });

    devLog('[DEBUG_JOIN_ROOM] userId = ' + this.userId + ', dbExists = ' + !!db + ', isPublic = ' + isPublic + ', theme = ' + theme);
    if(!this.userId || !db) return;
    
    const roomRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', roomKey);
    getDoc(roomRef).then(async (snap) => {
        if (!snap.exists()) {
            const initialTheme = theme || (isPublic ? roomKey : 'window-seat');
            await setDoc(roomRef, { theme: initialTheme }, { merge: true });
            this.addHistoryEvent('room_created', `Room created with theme "${initialTheme}"`);
        } else {
            if (!isPublic && theme) {
                devLog('[THEME_SAVED]', theme);
                await setDoc(roomRef, { theme }, { merge: true }).catch(err => console.error('[FIRESTORE_ROOM_WRITE] private room metadata write ERROR:', err));
            }
        }
        this.updatePresence(); 
        this.listenToRoom();
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} entered the corner`, '🚪');
    }).catch(err => {
        console.error('[ROOM_HISTORY] Error checking room creation:', err);
        this.updatePresence(); 
        this.listenToRoom();
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} entered the corner`, '🚪');
    });
  }

  updatePresence() {
    if(!this.userId || !db || !this.profile || !this.roomCode) return;
    console.log('[FIRESTORE_ROOM_WRITE] updatePresence start for user:', this.userId, 'room:', this.roomCode);
    setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { presence: { [this.userId]: { alias: this.profile.alias, time: Date.now() } } }, { merge: true })
      .then(() => console.log('[FIRESTORE_ROOM_WRITE] updatePresence SUCCESS'))
      .catch(err => console.error('[FIRESTORE_ROOM_WRITE] updatePresence ERROR:', err));

    const presDocRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'presence', this.userId);
    setDoc(presDocRef, {
        alias: this.profile.alias,
        mood: this.profile.mood || 'resting quietly',
        time: Date.now(),
        uid: this.userId,
        joinedAt: this.joinedAt
    }).catch(err => console.error('[FIRESTORE_SUBCOL_WRITE] Error writing subcol presence:', err));
  }

  listenToRoom() {
    if(!this.userId || !db || !this.roomCode) {
      console.log('[DEBUG_LISTEN_ROOM] Skip listen: userId =', this.userId, 'dbExists =', !!db, 'roomCode =', this.roomCode);
      return;
    }
    if(this.unsub) { this.unsub(); this.unsub = null; }
    if(this.unsubNotes) { this.unsubNotes(); this.unsubNotes = null; }
    if(this.unsubObjects) { this.unsubObjects(); this.unsubObjects = null; }
    if(this.unsubPresence) { this.unsubPresence(); this.unsubPresence = null; }
    this.useSubcollectionNotes = false;
    this.useSubcollectionObjects = false;
    this.useSubcollectionPresence = false;

    const docPath = `artifacts/${this.appId}/public/data/rooms/${this.roomCode}`;
    console.log('[DEBUG_LISTEN_ROOM] Subscribing to path:', docPath, 'uid:', this.userId, 'room:', this.roomCode);

    this.unsub = onSnapshot(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), (snap) => {
      console.log('[DEBUG_LISTEN_ROOM] Callback fired! path:', docPath, 'exists:', snap.exists());
      if(snap.exists()) {
        const data = snap.data();
        if(data.latestAction && data.latestAction.sender !== this.userId) {
          const actionTime = data.latestAction.timestamp || 0;
          if (actionTime > this.lastActionTimestamp) {
            this.lastActionTimestamp = actionTime;
            const actionAge = Date.now() - actionTime;
            if (actionAge < 10000) {
                this.bus.emit(APP_EVENTS.AMBIENT_ACTION_RECEIVED, data.latestAction);
            }
          }
        }
        
        const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(this.roomCode!);
        if(data.theme) {
            devLog('[THEME_RESTORED]', data.theme);
            devLog('[ROOM_CHANGED_EMIT] listenToRoom sync theme:', { room: this.roomCode, isPrivate: !isPublic, theme: data.theme });
            this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: this.roomCode, isPrivate: !isPublic, theme: data.theme });
        }

        // Dual-read logic: fallback to legacy array only when subcollection is empty/not active
        if (!this.useSubcollectionNotes) {
            this.notes = data.notes || [];
            console.log('[DEBUG_LISTEN_ROOM] snap legacy notes.length =', this.notes.length);
            console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_NOTES_UPDATED (legacy)');
            this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, this.notes);
        }

        // Dual-read logic: fallback to legacy array only when subcollection is empty/not active
        if (!this.useSubcollectionObjects) {
            this.objects = data.objects || [];
            console.log('[DEBUG_LISTEN_ROOM] snap legacy objects.length =', this.objects.length);
            console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_OBJECTS_UPDATED (legacy)');
            this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, this.objects);
        }
        
        if(data.state && data.state.spotify) this.bus.emit(APP_EVENTS.REMOTE_MEDIA_UPDATED, { type: 'spotify', url: data.state.spotify, host: data.state.spotifyHost });

        if(data.video) {
            const oldVideo = this.currentVideoState;
            this.currentVideoState = data.video;
            const hostEl = $('local-host');
            if (hostEl) {
                if (data.video.hostId === this.userId) {
                    hostEl.textContent = 'You are controlling this tape';
                } else {
                    hostEl.textContent = `Watching with ${data.video.host || 'wanderer'}`;
                }
                hostEl.classList.add('visible');
            }
            const isUrlChanging = !oldVideo || oldVideo.url !== data.video.url;
            if (data.video.sender !== this.userId || isUrlChanging) {
                this.isRemoteUpdate = true; 
                this.bus.emit(APP_EVENTS.REMOTE_MEDIA_UPDATED, data.video);
                setTimeout(() => this.isRemoteUpdate = false, 1500);
            }
            this.checkHostContinuity();
        } else {
            this.currentVideoState = null;
            const hostEl = $('local-host');
            if (hostEl) {
                hostEl.textContent = '';
                hostEl.classList.remove('visible');
            }
        }
        
        // Dual-read logic: fallback to legacy presence only when subcollection is empty/not active
        if (!this.useSubcollectionPresence) {
            if(data.presence) {
              const now = Date.now();
              this.activeUsers = {};
              Object.entries(data.presence).forEach(([id, p]: [string, any]) => {
                  if(now - p.time < 60000) this.activeUsers[id] = p;
              });
              this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, Object.keys(this.activeUsers).length);
            } else {
              this.activeUsers = {};
              this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, 0);
            }
            this.renderPresenceUI();
        }
      } else {
          this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, []);
          this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, []);
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] onSnapshot error:', err);
    });

    const notesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'notes');
    const notesQuery = query(notesCol, orderBy('createdAt', 'desc'), limit(50));
    
    this.unsubNotes = onSnapshot(notesQuery, (subcolSnap) => {
      console.log('[DEBUG_LISTEN_ROOM] Subcollection notes snapshot fired! empty:', subcolSnap.empty);
      if (!subcolSnap.empty) {
        this.useSubcollectionNotes = true;
        this.notes = subcolSnap.docs.map(doc => {
            const data = doc.data();
            return {
                text: data.text || '',
                author: data.author || 'wanderer',
                id: data.id || 0,
                isEcho: data.isEcho || false
            } as Note;
        });
        console.log('[DEBUG_LISTEN_ROOM] snap subcol notes.length =', this.notes.length);
        console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_NOTES_UPDATED (subcollection)');
        this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, this.notes);
      } else {
        if (this.useSubcollectionNotes) {
            this.notes = [];
            this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, this.notes);
        }
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Subcollection notes snapshot error:', err);
    });

    const objectsCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'objects');
    const objectsQuery = query(objectsCol, orderBy('createdAt', 'desc'), limit(20));
    
    this.unsubObjects = onSnapshot(objectsQuery, (subcolSnap) => {
      console.log('[DEBUG_LISTEN_ROOM] Subcollection objects snapshot fired! empty:', subcolSnap.empty);
      if (!subcolSnap.empty) {
        this.useSubcollectionObjects = true;
        this.objects = subcolSnap.docs.map(doc => {
            const data = doc.data();
            return {
                emoji: data.emoji || '',
                label: data.label || '',
                author: data.author || 'wanderer',
                id: data.id || 0,
                isMythic: data.isMythic || false
            } as MemoryObject;
        });
        console.log('[DEBUG_LISTEN_ROOM] snap subcol objects.length =', this.objects.length);
        console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_OBJECTS_UPDATED (subcollection)');
        this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, this.objects);
      } else {
        if (this.useSubcollectionObjects) {
            this.objects = [];
            this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, this.objects);
        }
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Subcollection objects snapshot error:', err);
    });

    const presenceCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'presence');
    this.unsubPresence = onSnapshot(presenceCol, (subcolSnap) => {
      console.log('[DEBUG_LISTEN_ROOM] Subcollection presence snapshot fired! empty:', subcolSnap.empty);
      if (!subcolSnap.empty) {
        this.useSubcollectionPresence = true;
        const now = Date.now();
        this.activeUsers = {};
        subcolSnap.docs.forEach(doc => {
            const p = doc.data();
            if (now - p.time < 60000) {
                this.activeUsers[p.uid || doc.id] = {
                    alias: p.alias || 'wanderer',
                    time: p.time,
                    joinedAt: p.joinedAt || p.time
                };
            }
        });
        this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, Object.keys(this.activeUsers).length);
        this.renderPresenceUI();

        // Host Continuity Check
        this.checkHostContinuity();
      } else {
        if (this.useSubcollectionPresence) {
            this.activeUsers = {};
            this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, 0);
            this.renderPresenceUI();
        }
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Subcollection presence snapshot error:', err);
    });

    const queueCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue');
    const queueQuery = query(queueCol, orderBy('addedAt', 'asc'));
    this.unsubQueue = onSnapshot(queueQuery, (snap) => {
      this.queue = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          url: data.url || '',
          title: data.title || '',
          addedBy: data.addedBy || '',
          addedAt: data.addedAt || 0,
          status: data.status || 'pending'
        } as QueueItem;
      });
      devLog('[QUEUE_SYNC] Realtime queue update received. Count:', this.queue.length);
      this.bus.emit(APP_EVENTS.SYNC_QUEUE, this.queue);
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Queue snapshot error:', err);
    });

    const historyCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'history');
    const historyQuery = query(historyCol, orderBy('createdAt', 'desc'), limit(50));
    this.unsubHistory = onSnapshot(historyQuery, (snap) => {
      const historyList = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || 'room_created',
          text: data.text || '',
          createdAt: data.createdAt || 0,
          createdBy: data.createdBy || 'wanderer'
        } as RoomHistoryEvent;
      });
      devLog('[HISTORY_SYNC] Realtime history update received. Count:', historyList.length);
      this.history = historyList;
      this.bus.emit(APP_EVENTS.SYNC_HISTORY, historyList);
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] History snapshot error:', err);
    });

    const memoriesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories');
    const memoriesQuery = query(memoriesCol, orderBy('createdAt', 'desc'), limit(100));
    this.unsubMemories = onSnapshot(memoriesQuery, (snap) => {
      this.memories = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || 'moment',
          title: data.title || '',
          description: data.description || '',
          createdAt: data.createdAt || 0,
          createdBy: data.createdBy || 'wanderer',
          creatorUid: data.creatorUid || '',
          payload: data.payload || null
        } as RoomMemory;
      });
      devLog('[MEMORIES_SYNC] Realtime memories update received. Count:', this.memories.length);
      this.bus.emit(APP_EVENTS.SYNC_MEMORIES, this.memories);
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Memories snapshot error:', err);
    });
  }

  renderPresenceUI() {
    const activeEntries = Object.entries(this.activeUsers); 
    const count = activeEntries.length; 
    const presList = $('room-presence-list');
    const soulCount = $('soul-count');
    if(!presList || !soulCount) return;

    presList.innerHTML = '';
    soulCount.textContent = count > 1 ? `${count} souls resting here` : 'you are resting alone';
    
    if (count > 0) {
        const hostId = this.currentVideoState?.hostId;
        const formattedUsers = activeEntries.map(([uid, u]: [string, any]) => {
            const isHost = hostId && uid === hostId;
            return isHost ? `${u.alias} (📼 host)` : u.alias;
        });
        presList.textContent = `currently here: ${formattedUsers.join(' · ')}`;
    }
  }

  async enqueueMedia(url: string, title: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[QUEUE_OPERATION] Enqueuing media:', title, url);
      const queueCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue');
      await addDoc(queueCol, {
          url,
          title,
          addedBy: this.profile?.alias || 'wanderer',
          addedAt: Date.now(),
          status: 'pending'
      }).catch(err => console.error('[QUEUE_OPERATION] Error enqueuing media:', err));
  }

  async startQueuedMedia(itemId: string) {
      if (!this.userId || !db || !this.roomCode) return;
      if (this.currentVideoState && this.currentVideoState.hostId !== this.userId) {
          devLog('[QUEUE_OPERATION] Blocked non-host startQueuedMedia');
          return;
      }
      
      devLog('[QUEUE_OPERATION] Starting queued media:', itemId);
      const targetItem = this.queue.find(q => q.id === itemId);
      if (!targetItem) return;

      for (const item of this.queue) {
          const itemRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue', item.id);
          if (item.id === itemId) {
              await updateDoc(itemRef, { status: 'playing' }).catch(err => console.error('[QUEUE_OPERATION] update target doc status playing error:', err));
          } else if (item.status === 'playing') {
              await updateDoc(itemRef, { status: 'completed' }).catch(err => console.error('[QUEUE_OPERATION] update previous doc status completed error:', err));
          }
      }

      const type = targetItem.url.includes('youtube.com') || targetItem.url.includes('youtu.be') ? 'youtube' : 'magnet';
      const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
      await setDoc(ref, {
          video: {
              type,
              url: targetItem.url,
              action: 'play',
              time: 0,
              title: targetItem.title,
              timestamp: Date.now(),
              hostId: this.userId,
              host: this.profile?.alias || 'wanderer',
              sender: this.userId
          }
      }, { merge: true }).then(() => {
          this.addHistoryEvent('tape_played', `Started playing queued tape "${targetItem.title}"`);
      }).catch(err => console.error('[QUEUE_OPERATION] Error updating root video state:', err));
  }

  async playNextInQueue() {
      if (!this.userId || !db || !this.roomCode) return;
      if (this.currentVideoState && this.currentVideoState.hostId !== this.userId) {
          devLog('[QUEUE_OPERATION] Blocked non-host playNextInQueue');
          return;
      }

      devLog('[QUEUE_OPERATION] Playing next in queue...');
      const nextItem = this.queue.find(q => q.status === 'pending');
      
      for (const item of this.queue) {
          if (item.status === 'playing') {
              const itemRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue', item.id);
              await updateDoc(itemRef, { status: 'completed' }).catch(err => console.error('[QUEUE_OPERATION] update status completed error:', err));
          }
      }

      if (nextItem) {
          devLog('[QUEUE_OPERATION] Found next item:', nextItem.title);
          const itemRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue', nextItem.id);
          await updateDoc(itemRef, { status: 'playing' }).catch(err => console.error('[QUEUE_OPERATION] update status playing error:', err));

          const type = nextItem.url.includes('youtube.com') || nextItem.url.includes('youtu.be') ? 'youtube' : 'magnet';
          const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
          await setDoc(ref, {
              video: {
                  type,
                  url: nextItem.url,
                  action: 'play',
                  time: 0,
                  title: nextItem.title,
                  timestamp: Date.now(),
                  hostId: this.userId,
                  host: this.profile?.alias || 'wanderer',
                  sender: this.userId
              }
          }, { merge: true }).then(() => {
              this.addHistoryEvent('tape_played', `Queue auto-advanced to "${nextItem.title}"`);
          }).catch(err => console.error('[QUEUE_OPERATION] Error updating root video state:', err));
      } else {
          devLog('[QUEUE_OPERATION] No pending items left in queue. Clearing root video.');
          const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
          await updateDoc(ref, {
              video: deleteField()
          }).catch(err => console.error('[QUEUE_OPERATION] Error clearing root video:', err));
      }
  }

  checkHostContinuity() {
      if (!this.userId || !db || !this.roomCode) return;
      if (this.currentVideoState && this.currentVideoState.hostId) {
          const currentHostId = this.currentVideoState.hostId;
          if (!this.activeUsers[currentHostId]) {
              devLog('[HOST_CONTINUITY] Current host has departed:', currentHostId);
              const activeEntries = Object.entries(this.activeUsers);
              if (activeEntries.length > 0) {
                  activeEntries.sort((a, b) => {
                      const joinedA = a[1].joinedAt || 0;
                      const joinedB = b[1].joinedAt || 0;
                      if (joinedA !== joinedB) return joinedA - joinedB;
                      return a[0].localeCompare(b[0]);
                  });
                  const oldestUid = activeEntries[0][0];
                  devLog('[HOST_CONTINUITY] Oldest active participant is:', oldestUid);
                  
                  if (oldestUid === this.userId) {
                      devLog('[HOST_CONTINUITY] We are the oldest active participant. Initiating takeover...');
                      const fs = db;
                      const roomRef = doc(fs, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
                      runTransaction(fs, async (transaction) => {
                          const roomDoc = await transaction.get(roomRef);
                          if (roomDoc.exists()) {
                              const currentVideo = roomDoc.data().video;
                              if (currentVideo && currentVideo.hostId === currentHostId) {
                                  devLog('[HOST_CONTINUITY] Takeover conditions met. Claiming host authority...');
                                  transaction.update(roomRef, {
                                      'video.hostId': this.userId,
                                      'video.host': this.profile?.alias || 'wanderer',
                                      'video.sender': this.userId
                                  });
                              } else {
                                  devLog('[HOST_CONTINUITY] Takeover aborted: hostId already changed.');
                              }
                          }
                      }).then(() => {
                          devLog('[HOST_CONTINUITY] Takeover transaction completed successfully.');
                          this.addHistoryEvent('host_changed', `Host authority transferred to ${this.profile?.alias || 'wanderer'}`);
                      }).catch(err => {
                          console.error('[HOST_CONTINUITY] Takeover transaction failed:', err);
                      });
                  }
              }
          }
      }
  }

  async addHistoryEvent(type: 'tape_played' | 'note_pinned' | 'object_placed' | 'host_changed' | 'room_created', text: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_HISTORY] Writing history event:', type, text);
      const historyCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'history');
      await addDoc(historyCol, {
          type,
          text,
          createdAt: Date.now(),
          createdBy: this.profile?.alias || 'wanderer'
      }).catch(err => {
          console.error('[ROOM_HISTORY] Error writing history event:', err);
      });
  }

  async saveMemory(memory: Omit<RoomMemory, 'id' | 'createdAt' | 'createdBy' | 'creatorUid'>) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_MEMORIES] Saving memory:', memory);
      const memoriesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories');
      await addDoc(memoriesCol, {
          type: memory.type,
          title: memory.title,
          description: memory.description || '',
          createdAt: Date.now(),
          createdBy: this.profile?.alias || 'wanderer',
          creatorUid: this.userId,
          payload: memory.payload
      }).catch(err => console.error('[ROOM_MEMORIES] Error saving memory:', err));
  }

  async removeMemory(memoryId: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_MEMORIES] Removing memory:', memoryId);
      const memoryRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories', memoryId);
      await deleteDoc(memoryRef).catch(err => console.error('[ROOM_MEMORIES] Error removing memory:', err));
  }

  async loadRoomMemories(): Promise<RoomMemory[]> {
      if (!this.userId || !db || !this.roomCode) return [];
      if (this.memories && this.memories.length > 0) return this.memories;
      const memoriesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories');
      const q = query(memoriesCol, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q).catch(() => null);
      if (!snap) return [];
      return snap.docs.map(doc => {
          const data = doc.data();
          return {
              id: doc.id,
              type: data.type || '',
              title: data.title || '',
              description: data.description || '',
              createdAt: data.createdAt || 0,
              createdBy: data.createdBy || 'wanderer',
              creatorUid: data.creatorUid || '',
              payload: data.payload || null
          } as RoomMemory;
      });
  }
}

