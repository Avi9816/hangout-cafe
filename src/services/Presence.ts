import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { db, initFirebase } from '../config/firebase';
import { doc, setDoc, getDoc, onSnapshot, Unsubscribe, updateDoc, deleteField, collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, runTransaction, where, increment } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UserProfile, Note, MemoryObject, QueueItem, RoomHistoryEvent, RoomMemory, RoomPhoto, RoomDirectoryItem } from '../types';
import { $ } from '../utils/dom'; 
import { debounce as debounceUtil } from '../utils/timing';
import { devLog } from '../utils/logger';
import { isPublicSpace } from '../config/spaceCapabilities';
import { isValidString } from '../utils/validation';


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
  
  favorites: any[] = [];
  private favoritesUnsubs: Record<string, Unsubscribe> = {};
  private unsubFavoritesList: Unsubscribe | null = null;
  
  notes: Note[] = [];
  objects: MemoryObject[] = [];
  currentVideoState: any = null;
  currentRoomMetadata: any | null = null;
  lastActionTimestamp = 0;
  unsubNotes: Unsubscribe | null = null;
  useSubcollectionNotes = false;
  unsubPresence: Unsubscribe | null = null;
  useSubcollectionPresence = false;
  unsubQueue: Unsubscribe | null = null;
  queue: QueueItem[] = [];
  unsubHistory: Unsubscribe | null = null;
  unsubMemories: Unsubscribe | null = null;
  history: RoomHistoryEvent[] = [];
  memories: RoomMemory[] = [];
  unsubPhotos: Unsubscribe | null = null;
  photos: RoomPhoto[] = [];
  joinedAt = 0;
  
  pendingJoin: { room: string, theme: string | null } | null = null;
  sessionStart = Date.now();

  debouncedSyncNotes = debounceUtil((notes: Note[]) => {
      if(!this.userId || !db || !this.roomCode) return;
      devLog('[FIRESTORE_ROOM_WRITE] notes sync start, count:', notes.length);
      setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { notes }, { merge: true })
        .then(() => devLog('[FIRESTORE_ROOM_WRITE] notes sync SUCCESS'))
        .catch(err => console.error('[FIRESTORE_ROOM_WRITE] notes sync ERROR:', err));
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
        (window as any)._firestore = { doc, getDoc, setDoc, collection, getDocs, deleteDoc, updateDoc };
        if (import.meta.env.DEV) {
            (window as any)._storage = { getStorage, ref, uploadBytes, getDownloadURL };
        }
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
        console.warn('[DEPRECATED] OBJECT_PLACED received. Table objects feature is removed. No database writes performed.');
        if (this.profile) obj.author = this.profile.alias;
        
        // Still log history event for backward/test compatibility
        const alias = (this.profile?.alias && this.profile.alias.toLowerCase() !== 'wanderer') ? this.profile.alias : 'wanderer';
        this.addHistoryEvent('object_placed', `${alias} placed a ${obj.label}`);
    });

    this.bus.on(APP_EVENTS.ROOM_JOIN_REQUEST, (data: any) => {
        devLog('[ROOM_JOIN_REQUEST_RECEIVED]');
        const roomKey = typeof data === 'string' ? data : data.room;
        const theme = typeof data === 'object' ? data.theme : null;
        this.joinRoom(roomKey, theme);
    });

    this.bus.on(APP_EVENTS.MEDIA_PLAY_REQUEST, (data: any) => {
        if(!this.userId || !db || !this.roomCode) return;
        if (isPublicSpace(this.roomCode)) {
            devLog('[MEDIA_CONTROL_BLOCKED] Media sync is not allowed in public spaces.');
            return;
        }
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
                     },
                     currentTapeTitle: data.title || 'unnamed tape',
                     currentHost: this.profile?.alias || 'wanderer',
                     updatedAt: Date.now()
                 }, { merge: true });
                 
                 if (isUrlChanging) {
                     const tapeTitle = data.title || 'unnamed tape';
                     this.addHistoryEvent('tape_played', `Started playing tape "${tapeTitle}"`);
                 }
                 if (isUrlChanging && data.type === 'magnet') {
                     this.broadcastActivity(`${this.profile?.alias || 'wanderer'} started a tape`, '📼');
                 }
             } else {
                 devLog('[MEDIA_CONTROL_BLOCKED] Blocked non-host media control');
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
 
     this.bus.on(APP_EVENTS.MEDIA_ENDED, () => {
         if(!this.userId || !db || !this.roomCode) return;
         if (isPublicSpace(this.roomCode)) return;
         devLog('[MEDIA_ENDED_RECEIVED]');
         if (this.currentVideoState && this.currentVideoState.hostId === this.userId) {
             devLog('[MEDIA_ENDED_RECEIVED] We are the host. Auto-advancing queue...');
             this.playNextInQueue();
         } else {
             devLog('[MEDIA_ENDED_RECEIVED] We are not the host. Viewer ignores ended event.');
         }
     });
  }

  useFallbackUserId() {
    this.cleanupFavorites();
    let storedId = localStorage.getItem('hangout_cafe_anon_uid');
    if (!storedId) {
        storedId = 'anon-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('hangout_cafe_anon_uid', storedId);
    }
    this.userId = storedId;
    devLog('[FALLBACK_USER_ID_USED]');
    this.loadIdentity();
  }

  async bootstrapFirebase() {
    const authInstance = await initFirebase();
    if (authInstance) {
        import('firebase/auth').then(({ onAuthStateChanged }) => {
            onAuthStateChanged(authInstance, async (u) => {
                this.cleanupFavorites();
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
          const data = snap.data();
          
          // Check for legacy fields or missing fields to trigger clean migration
          const hasLegacyFields = data.mood !== undefined || data.visits !== undefined || data.joined !== undefined;
          const missingFields = data.alias === undefined || data.bio === undefined || data.joinedAt === undefined ||
                                data.favoriteTheme === undefined || data.roomsVisited === undefined ||
                                data.roomsFavorited === undefined || data.memoriesCreated === undefined ||
                                data.photosUploaded === undefined || data.updatedAt === undefined;

          if (hasLegacyFields || missingFields) {
              const normalizedProfile = {
                  alias: data.alias || 'wanderer',
                  bio: data.bio || '',
                  joinedAt: data.joinedAt || data.joined || Date.now(),
                  favoriteTheme: data.favoriteTheme || 'window-seat',
                  avatarUrl: data.avatarUrl || '',
                  roomsVisited: data.roomsVisited !== undefined ? data.roomsVisited : 0,
                  roomsFavorited: data.roomsFavorited !== undefined ? data.roomsFavorited : 0,
                  memoriesCreated: data.memoriesCreated !== undefined ? data.memoriesCreated : 0,
                  photosUploaded: data.photosUploaded !== undefined ? data.photosUploaded : 0,
                  updatedAt: Date.now()
              };
              await setDoc(ref, normalizedProfile); // Overwrite to delete legacy fields
              this.profile = normalizedProfile;
          } else {
              this.profile = data as UserProfile;
          }
          
          // Keep legacy mood in-memory for presence list rendering
          if (data.mood) this.profile.mood = data.mood;

          if (overlay) overlay.classList.add('hidden');
          this.applyIdentity();
          this.listenToFavorites();
          
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
        
        // Client side validation
        if (alias.length > 32) {
            alert('Alias cannot exceed 32 characters');
            return;
        }
        if (/<[^>]*>|javascript:/i.test(alias) || /<[^>]*>|javascript:/i.test(mood)) {
            alert('HTML or script tags are not allowed');
            return;
        }

        const cleanProfile = {
            alias: alias,
            bio: '',
            joinedAt: Date.now(),
            favoriteTheme: 'window-seat',
            avatarUrl: '',
            roomsVisited: 1, // first room visit starting now
            roomsFavorited: 0,
            memoriesCreated: 0,
            photosUploaded: 0,
            updatedAt: Date.now()
        };

        this.profile = { ...cleanProfile, mood }; // Keep mood locally in memory
        
        if(db && this.userId) {
           const ref = doc(db, 'artifacts', this.appId, 'users', this.userId, 'userData', 'profile');
           setDoc(ref, cleanProfile).then(() => {
               $('identity-overlay')?.classList.add('hidden');
               this.applyIdentity();
               this.listenToFavorites();
               if(this.pendingJoin) { this.joinRoom(this.pendingJoin.room, this.pendingJoin.theme); this.pendingJoin = null; }
           }).catch(err => {
               console.error('[IDENTITY] Error creating profile:', err);
               alert('Failed to enter the café. Please try again.');
           });
        } else {
           $('identity-overlay')?.classList.add('hidden');
           this.applyIdentity();
           this.listenToFavorites();
           if(this.pendingJoin) { this.joinRoom(this.pendingJoin.room, this.pendingJoin.theme); this.pendingJoin = null; }
        }
     });
  }

  applyIdentity() {
     if (!this.profile) return;
     const idEl = $('my-identity');
     if (idEl) {
        const alias = (this.profile.alias && this.profile.alias !== 'undefined') ? this.profile.alias : 'wanderer';
        const mood = (this.profile.mood && this.profile.mood.trim() !== '' && this.profile.mood !== 'undefined') ? this.profile.mood.trim() : 'resting quietly';
        idEl.textContent = `${alias} — ${mood}`;
     }
     $('identity-status')?.classList.add('visible');
     this.bus.emit(APP_EVENTS.IDENTITY_READY, { profile: this.profile });
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
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (this.unsubNotes) { this.unsubNotes(); this.unsubNotes = null; }
    if (this.unsubPresence) { this.unsubPresence(); this.unsubPresence = null; }
    if (this.unsubQueue) { this.unsubQueue(); this.unsubQueue = null; }
    if (this.unsubHistory) { this.unsubHistory(); this.unsubHistory = null; }
    if (this.unsubMemories) { this.unsubMemories(); this.unsubMemories = null; }
    if (this.unsubPhotos) { this.unsubPhotos(); this.unsubPhotos = null; }
    this.queue = [];
    this.history = [];
    this.memories = [];
    this.photos = [];

    const oldRoomCode = this.roomCode;
    this.roomCode = null;
    this.currentVideoState = null;
    this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: null, isPrivate: false, theme: null });

    if(!this.userId || !db || !oldRoomCode) return;

    const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', oldRoomCode);
    updateDoc(ref, {
        [`presence.${this.userId}`]: deleteField(),
        activeCount: increment(-1),
        lastActiveAt: Date.now()
    }).catch(err => console.warn("Failed to clean up presence on leaveRoom:", err));

    const presDocRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', oldRoomCode, 'presence', this.userId);
    deleteDoc(presDocRef).catch(err => console.warn("Failed to delete presence doc on leaveRoom:", err));
  }

  destroy() {
    this.leaveRoom();
    this.cleanupFavorites();
    this.lifecycle.clearAll();
  }

  joinRoom(roomKey: string, theme: string | null = null) {
    if(!this.profile) { this.pendingJoin = { room: roomKey, theme }; return; }
    
    if (this.roomCode && this.roomCode !== roomKey) {
        this.leaveRoom();
    }

    if (this.unsubQueue) { this.unsubQueue(); this.unsubQueue = null; }
    if (this.unsubHistory) { this.unsubHistory(); this.unsubHistory = null; }
    if (this.unsubMemories) { this.unsubMemories(); this.unsubMemories = null; }
    if (this.unsubPhotos) { this.unsubPhotos(); this.unsubPhotos = null; }
    this.queue = [];
    this.history = [];
    this.memories = [];
    this.photos = [];
    this.joinedAt = Date.now();

    this.roomCode = roomKey; this.ghostUsers = {}; this.activeUsers = {}; this.lastActionTimestamp = 0;
    const isPublic = isPublicSpace(roomKey);
    devLog('[ROOM_CHANGED_EMIT] joinRoom: isPrivate = ' + !isPublic + ', theme = ' + theme);
    this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: roomKey, isPrivate: !isPublic, theme: theme });

    devLog('[DEBUG_JOIN_ROOM] dbExists = ' + !!db + ', isPublic = ' + isPublic + ', theme = ' + theme);
    if(!this.userId || !db) return;
    
    const roomRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', roomKey);
    const visitorRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', roomKey, 'visitors', this.userId);

    const executeTx = () => runTransaction(db!, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        const visitorSnap = await transaction.get(visitorRef);
        
        const initialTheme = theme || (isPublic ? roomKey : 'window-seat');
        const displayName = isPublic ? 
            (roomKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) : 
            `corner: ${roomKey}`;
        
        const isNewVisitor = !visitorSnap.exists();
        if (!roomSnap.exists()) {
            transaction.set(roomRef, {
                roomCode: roomKey,
                displayName: displayName,
                theme: initialTheme,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastActiveAt: Date.now(),
                activeCount: 1,
                memoryCount: 0,
                photoCount: 0,
                queueCount: 0,
                isPrivate: !isPublic,
                visitorCount: 1,
                visitCount: 1
            }, { merge: true });

            transaction.set(visitorRef, {
                uid: this.userId,
                visitedAt: Date.now()
            }, { merge: true });
        } else {
            const data = roomSnap.data();
            const updates: any = {
                lastActiveAt: Date.now(),
                updatedAt: Date.now(),
                visitCount: (data.visitCount || 0) + 1
            };
            if (isNewVisitor) {
                updates.visitorCount = (data.visitorCount || 0) + 1;
                transaction.set(visitorRef, {
                    uid: this.userId,
                    visitedAt: Date.now()
                }, { merge: true });
            } else {
                updates.visitorCount = data.visitorCount || 1;
            }
            if (!data.roomCode) updates.roomCode = roomKey;
            if (!data.displayName) {
                updates.displayName = isPublic ? 
                    (roomKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) : 
                    `corner: ${roomKey}`;
            }
            if (data.isPrivate === undefined) updates.isPrivate = !isPublic;
            if (!isPublic && theme) {
                devLog('[THEME_SAVED]', theme);
                updates.theme = theme;
            }
            transaction.update(roomRef, updates);
        }

        return { isNewRoom: !roomSnap.exists(), initialTheme, isNewVisitor };
    });

    const runWithRetry = async (retries = 5): Promise<{ isNewRoom: boolean, initialTheme: string, isNewVisitor: boolean }> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await executeTx() as { isNewRoom: boolean, initialTheme: string, isNewVisitor: boolean };
            } catch (err: any) {
                if (attempt === retries) {
                    throw err;
                }
                devLog(`[ROOM_JOIN_TX] Transaction failed (attempt ${attempt}/${retries}), retrying: ` + (err.message || err));
                await new Promise(r => setTimeout(r, 200 + Math.random() * 300 * attempt));
            }
        }
        throw new Error('Transaction retries exhausted');
    };

    runWithRetry().then(({ isNewRoom, initialTheme, isNewVisitor }) => {
        if (isNewRoom) {
            this.addHistoryEvent('room_created', `Room created with theme "${initialTheme}"`);
        }
        if (isNewVisitor && this.profile) {
            const profileRef = doc(db!, 'artifacts', this.appId, 'users', this.userId!, 'userData', 'profile');
            updateDoc(profileRef, {
                roomsVisited: increment(1),
                updatedAt: Date.now()
            }).then(() => {
                if (this.profile) this.profile.roomsVisited = (this.profile.roomsVisited || 0) + 1;
                this.applyIdentity();
            }).catch(err => console.error('[ROOM_VISITED_SYNC] Error incrementing roomsVisited:', err));
        }
        this.updatePresence(); 
        this.listenToRoom();
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} entered the corner`, '🚪');
    }).catch(err => {
        console.error('[ROOM_HISTORY] Error in joinRoom transaction:', err);
        this.updatePresence(); 
        this.listenToRoom();
        this.broadcastActivity(`${this.profile?.alias || 'wanderer'} entered the corner`, '🚪');
    });
  }

  updatePresence() {
    if(!this.userId || !db || !this.profile || !this.roomCode) return;
    devLog('[FIRESTORE_ROOM_WRITE] updatePresence start');
    const activeCount = Object.keys(this.activeUsers).length || 1;
    const isPublic = isPublicSpace(this.roomCode);
    setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { 
        presence: { [this.userId]: { alias: this.profile.alias, time: Date.now() } },
        lastActiveAt: Date.now(),
        activeCount: activeCount,
        isPrivate: !isPublic
    }, { merge: true })
      .then(() => devLog('[FIRESTORE_ROOM_WRITE] updatePresence SUCCESS'))
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
      devLog('[DEBUG_LISTEN_ROOM] Skip listen: dbExists =', !!db);
      return;
    }
    if(this.unsub) { this.unsub(); this.unsub = null; }
    if(this.unsubNotes) { this.unsubNotes(); this.unsubNotes = null; }
    if(this.unsubPresence) { this.unsubPresence(); this.unsubPresence = null; }
    if(this.unsubPhotos) { this.unsubPhotos(); this.unsubPhotos = null; }
    if(this.unsubQueue) { this.unsubQueue(); this.unsubQueue = null; }
    if(this.unsubHistory) { this.unsubHistory(); this.unsubHistory = null; }
    if(this.unsubMemories) { this.unsubMemories(); this.unsubMemories = null; }
    this.useSubcollectionNotes = false;
    this.useSubcollectionPresence = false;

    devLog('[DEBUG_LISTEN_ROOM] Subscribing to room path');

    this.unsub = onSnapshot(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), (snap) => {
      devLog('[DEBUG_LISTEN_ROOM] Callback fired! exists:', snap.exists());
      if(snap.exists()) {
        const data = snap.data();
        this.currentRoomMetadata = {
            roomCode: this.roomCode,
            displayName: data.displayName || this.roomCode,
            theme: data.theme || 'window-seat',
            createdAt: data.createdAt || 0,
            lastActiveAt: data.lastActiveAt || 0,
            activeCount: data.activeCount || 0,
            memoryCount: data.memoryCount || 0,
            photoCount: data.photoCount || 0,
            visitorCount: data.visitorCount || 0,
            visitCount: data.visitCount || 0,
            currentTapeTitle: data.currentTapeTitle,
            currentHost: data.currentHost
        };
        this.bus.emit(APP_EVENTS.ROOM_METADATA_UPDATED, this.currentRoomMetadata);

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
        
        const isPublic = isPublicSpace(this.roomCode!);
        if(data.theme) {
            devLog('[THEME_RESTORED]', data.theme);
            devLog('[ROOM_CHANGED_EMIT] listenToRoom sync theme:', { isPrivate: !isPublic, theme: data.theme });
            this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: this.roomCode, isPrivate: !isPublic, theme: data.theme });
        }

        // Dual-read logic: fallback to legacy array only when subcollection is empty/not active
        if (!this.useSubcollectionNotes) {
            this.notes = data.notes || [];
            devLog('[DEBUG_LISTEN_ROOM] snap legacy notes.length =', this.notes.length);
            devLog('[DEBUG_LISTEN_ROOM] Emitting REMOTE_NOTES_UPDATED (legacy)');
            this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, this.notes);
        }

        // Dual-read logic: fallback to legacy array
        this.objects = data.objects || [];
        devLog('[DEBUG_LISTEN_ROOM] snap legacy objects.length =', this.objects.length);
        devLog('[DEBUG_LISTEN_ROOM] Emitting REMOTE_OBJECTS_UPDATED (legacy)');
        this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, this.objects);
        
        if (!isPublic) {
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
          this.currentRoomMetadata = null;
          this.bus.emit(APP_EVENTS.ROOM_METADATA_UPDATED, null);
          this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, []);
          this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, []);
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] onSnapshot error:', err);
    });

    const notesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'notes');
    const notesQuery = query(notesCol, orderBy('createdAt', 'desc'), limit(50));
    
    this.unsubNotes = onSnapshot(notesQuery, (subcolSnap) => {
      devLog('[DEBUG_LISTEN_ROOM] Subcollection notes snapshot fired! empty:', subcolSnap.empty);
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
        devLog('[DEBUG_LISTEN_ROOM] snap subcol notes.length =', this.notes.length);
        devLog('[DEBUG_LISTEN_ROOM] Emitting REMOTE_NOTES_UPDATED (subcollection)');
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



    const presenceCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'presence');
    this.unsubPresence = onSnapshot(presenceCol, (subcolSnap) => {
      devLog('[DEBUG_LISTEN_ROOM] Subcollection presence snapshot fired! empty:', subcolSnap.empty);
      if (!subcolSnap.empty) {
        this.useSubcollectionPresence = true;
        const now = Date.now();
        this.activeUsers = {};
        subcolSnap.docs.forEach(doc => {
            const p = doc.data();
            if (now - p.time < 60000) {
                const aliasVal = (p.alias && p.alias !== 'undefined') ? p.alias : 'wanderer';
                const moodVal = (p.mood && p.mood !== 'undefined') ? p.mood : 'resting quietly';
                this.activeUsers[p.uid || doc.id] = {
                    alias: aliasVal,
                    mood: moodVal,
                    time: p.time,
                    joinedAt: p.joinedAt || p.time
                };
            }
        });
        const currentCount = Object.keys(this.activeUsers).length;
        this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, currentCount);
        this.renderPresenceUI();

        // Host Continuity Check - if takeover is initiated, it will batch activeCount/lastActiveAt updates inside the transaction
        const takeoverInitiated = this.checkHostContinuity(currentCount);

        // Sync activeCount and lastActiveAt on root document if we are the oldest active user AND no takeover was initiated
        if (!takeoverInitiated) {
            const activeEntries = Object.entries(this.activeUsers);
            if (activeEntries.length > 0) {
                activeEntries.sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
                const oldestUid = activeEntries[0][0];
                if (oldestUid === this.userId) {
                    const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
                    updateDoc(roomRef, {
                        activeCount: currentCount,
                        lastActiveAt: Date.now()
                    }).catch(err => devLog('Oldest user failed to sync activeCount:', err));
                }
            }
        }
      } else {
        if (this.useSubcollectionPresence) {
            this.activeUsers = {};
            this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, 0);
            this.renderPresenceUI();

            // Sync activeCount to 0
            const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
            updateDoc(roomRef, {
                activeCount: 0
            }).catch(err => devLog('Failed to sync activeCount to 0:', err));
        }
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] Subcollection presence snapshot error:', err);
    });

    const isPublic = isPublicSpace(this.roomCode);
    if (!isPublic) {
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
    } else {
        this.queue = [];
        this.bus.emit(APP_EVENTS.SYNC_QUEUE, []);
    }

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

    if (!isPublic) {
        const photosCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'photos');
        const photosQuery = query(photosCol, orderBy('createdAt', 'desc'), limit(100));
        this.unsubPhotos = onSnapshot(photosQuery, (snap) => {
          this.photos = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              url: data.url || '',
              caption: data.caption || '',
              uploadedBy: data.uploadedBy || 'wanderer',
              creatorUid: data.creatorUid || '',
              createdAt: data.createdAt || 0
            } as RoomPhoto;
          });
          devLog('[PHOTOS_SYNC] Realtime photos update received. Count:', this.photos.length);
          this.bus.emit(APP_EVENTS.SYNC_PHOTOS, this.photos);
        }, (err) => {
          console.error('[DEBUG_LISTEN_ROOM] Photos snapshot error:', err);
        });
    } else {
        this.photos = [];
        this.bus.emit(APP_EVENTS.SYNC_PHOTOS, []);
    }
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
        const frag = document.createDocumentFragment();
        
        activeEntries.forEach(([uid, u]: [string, any]) => {
            const isHost = hostId && uid === hostId;
            
            const userPill = document.createElement('div');
            userPill.className = 'presence-user-pill';
            
            const dot = document.createElement('span');
            dot.className = 'presence-dot';
            dot.style.background = isHost ? 'var(--accent)' : '#4ade80';
            dot.style.boxShadow = isHost ? '0 0 8px var(--accent)' : '0 0 8px #4ade80';
            userPill.appendChild(dot);
            
            const nameSpan = document.createElement('span');
            const aliasVal = (u.alias && String(u.alias).trim() !== '' && String(u.alias).trim() !== 'undefined') ? String(u.alias).trim() : 'wanderer';
            nameSpan.textContent = aliasVal;
            nameSpan.style.fontWeight = '500';
            userPill.appendChild(nameSpan);

            userPill.style.cursor = 'pointer';
            userPill.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                if ((window as any).spatialUI) {
                    (window as any).spatialUI.openPublicProfile(uid);
                }
            });

            if (isHost) {
                const badge = document.createElement('span');
                badge.className = 'badge-host';
                badge.textContent = 'host';
                userPill.appendChild(badge);
            }

            const rawMood = u.mood && String(u.mood).trim() !== '' && String(u.mood).trim() !== 'undefined' ? String(u.mood).trim() : 'resting quietly';
            const moodSpan = document.createElement('span');
            moodSpan.style.opacity = '0.5';
            moodSpan.style.fontSize = '0.7rem';
            moodSpan.style.marginLeft = '6px';
            moodSpan.style.fontStyle = 'italic';
            moodSpan.textContent = `(${rawMood})`;
            userPill.appendChild(moodSpan);

            frag.appendChild(userPill);
        });
        presList.appendChild(frag);
    }
  }

  async enqueueMedia(url: string, title: string) {
      if (!this.userId || !db || !this.roomCode) return;
      if (isPublicSpace(this.roomCode)) {
          devLog('[QUEUE_OPERATION] Enqueuing media is not allowed in public spaces.');
          return;
      }
      devLog('[QUEUE_OPERATION] Enqueuing media');
      const queueCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue');
      await addDoc(queueCol, {
          url,
          title,
          addedBy: this.profile?.alias || 'wanderer',
          addedAt: Date.now(),
          status: 'pending'
      }).then(async () => {
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
          await updateDoc(roomRef, {
              queueCount: increment(1),
              updatedAt: Date.now()
          }).catch(err => console.error('Error updating queueCount:', err));
      }).catch(err => console.error('[QUEUE_OPERATION] Error enqueuing media:', err));
  }

  async startQueuedMedia(itemId: string) {
      if (!this.userId || !db || !this.roomCode) return;
      if (isPublicSpace(this.roomCode)) return;
      if (this.currentVideoState && this.currentVideoState.hostId !== this.userId) {
          devLog('[QUEUE_OPERATION] Blocked non-host startQueuedMedia');
          return;
      }
      
      devLog('[QUEUE_OPERATION] Starting queued media');
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
      const remainingQueueCount = this.queue.filter(q => q.id !== itemId && q.status === 'pending').length;

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
          },
          currentTapeTitle: targetItem.title,
          currentHost: this.profile?.alias || 'wanderer',
          queueCount: remainingQueueCount,
          updatedAt: Date.now()
      }, { merge: true }).then(() => {
          this.addHistoryEvent('tape_played', `Started playing queued tape "${targetItem.title}"`);
      }).catch(err => console.error('[QUEUE_OPERATION] Error updating root video state:', err));
  }

  async playNextInQueue() {
      if (!this.userId || !db || !this.roomCode) return;
      if (isPublicSpace(this.roomCode)) return;
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
          devLog('[QUEUE_OPERATION] Found next item');
          const itemRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'queue', nextItem.id);
          await updateDoc(itemRef, { status: 'playing' }).catch(err => console.error('[QUEUE_OPERATION] update status playing error:', err));

          const type = nextItem.url.includes('youtube.com') || nextItem.url.includes('youtu.be') ? 'youtube' : 'magnet';
          const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
          const remainingQueueCount = this.queue.filter(q => q.id !== nextItem.id && q.status === 'pending').length;

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
              },
              currentTapeTitle: nextItem.title,
              currentHost: this.profile?.alias || 'wanderer',
              queueCount: remainingQueueCount,
              updatedAt: Date.now()
          }, { merge: true }).then(() => {
              this.addHistoryEvent('tape_played', `Queue auto-advanced to "${nextItem.title}"`);
          }).catch(err => console.error('[QUEUE_OPERATION] Error updating root video state:', err));
      } else {
          devLog('[QUEUE_OPERATION] No pending items left in queue. Clearing root video.');
          const ref = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
          await updateDoc(ref, {
              video: deleteField(),
              currentTapeTitle: deleteField(),
              currentHost: deleteField(),
              queueCount: 0,
              updatedAt: Date.now()
          }).catch(err => console.error('[QUEUE_OPERATION] Error clearing root video:', err));
      }
  }

  checkHostContinuity(currentCount?: number): boolean {
      if (!this.userId || !db || !this.roomCode) return false;
      if (isPublicSpace(this.roomCode)) return false;
      if (this.currentVideoState && this.currentVideoState.hostId) {
          const currentHostId = this.currentVideoState.hostId;
          if (!this.activeUsers[currentHostId]) {
              devLog('[HOST_CONTINUITY] Current host has departed');
              const activeEntries = Object.entries(this.activeUsers);
              if (activeEntries.length > 0) {
                  activeEntries.sort((a, b) => {
                      const joinedA = a[1].joinedAt || 0;
                      const joinedB = b[1].joinedAt || 0;
                      if (joinedA !== joinedB) return joinedA - joinedB;
                      return a[0].localeCompare(b[0]);
                  });
                  const oldestUid = activeEntries[0][0];
                  devLog('[HOST_CONTINUITY] Oldest active participant identified');
                  
                  if (oldestUid === this.userId) {
                      devLog('[HOST_CONTINUITY] We are the oldest active participant. Initiating takeover...');
                      const fs = db;
                      const roomRef = doc(fs, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode);
                      
                      const executeTakeoverTx = () => runTransaction(fs, async (transaction) => {
                           const roomDoc = await transaction.get(roomRef);
                           if (roomDoc.exists()) {
                               const currentVideo = roomDoc.data().video;
                               if (currentVideo && currentVideo.hostId === currentHostId) {
                                   devLog('[HOST_CONTINUITY] Takeover conditions met. Claiming host authority...');
                                   const updatePayload: any = {
                                       'video.hostId': this.userId,
                                       'video.host': this.profile?.alias || 'wanderer',
                                       'video.sender': this.userId,
                                       currentHost: this.profile?.alias || 'wanderer',
                                       updatedAt: Date.now()
                                   };
                                   if (typeof currentCount === 'number') {
                                       updatePayload.activeCount = currentCount;
                                       updatePayload.lastActiveAt = Date.now();
                                   }
                                   transaction.update(roomRef, updatePayload);
                               } else {
                                   devLog('[HOST_CONTINUITY] Takeover aborted: hostId already changed.');
                               }
                           }
                       });

                       const runTakeoverWithRetry = async (retries = 5) => {
                           for (let attempt = 1; attempt <= retries; attempt++) {
                               try {
                                   await executeTakeoverTx();
                                   return;
                               } catch (err: any) {
                                   if (attempt === retries) {
                                       throw err;
                                   }
                                   devLog(`[HOST_CONTINUITY_TX] Takeover failed (attempt ${attempt}/${retries}), retrying: ` + (err.message || err));
                                   await new Promise(r => setTimeout(r, 200 + Math.random() * 300 * attempt));
                               }
                           }
                       };

                       runTakeoverWithRetry().then(() => {
                           devLog('[HOST_CONTINUITY] Takeover transaction completed successfully.');
                           this.addHistoryEvent('host_changed', `Host authority transferred to ${this.profile?.alias || 'wanderer'}`);
                       }).catch(err => {
                           console.error('[HOST_CONTINUITY] Takeover transaction failed:', err);
                       });
                      return true;
                  }
              }
          }
      }
      return false;
  }

  async addHistoryEvent(type: 'tape_played' | 'note_pinned' | 'object_placed' | 'host_changed' | 'room_created' | 'photo_added' | 'whisper_left', text: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_HISTORY] Writing history event of type:', type);
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
      devLog('[ROOM_MEMORIES] Saving memory');

      const title = typeof memory.title === 'string' ? memory.title.trim() : '';
      const description = typeof memory.description === 'string' ? memory.description.trim() : '';

      if (!isValidString(title, 1, 80)) {
          throw new Error('Invalid memory title');
      }

      if (!isValidString(description, 0, 280)) {
          throw new Error('Invalid memory description');
      }

      const payload: any = {};
      if (memory.payload) {
          for (const key of Object.keys(memory.payload)) {
              let val = memory.payload[key];
              if (typeof val === 'string') {
                  val = val.trim();
                  const shortFields = ['title', 'author', 'artist', 'album', 'songOrAlbum', 'emoji', 'label', 'type'];
                  const longFields = ['text', 'review', 'thoughts', 'memory', 'description'];
                  
                  if (shortFields.includes(key)) {
                      if (!isValidString(val, 1, 80)) {
                          throw new Error(`Invalid value for payload field: ${key}`);
                      }
                  } else if (longFields.includes(key)) {
                      if (!isValidString(val, 1, 280)) {
                          throw new Error(`Invalid value for payload field: ${key}`);
                      }
                  } else if (key === 'url') {
                      if (!isValidString(val, 1, 2048)) {
                          throw new Error(`Invalid value for payload field: ${key}`);
                      }
                  } else {
                      if (!isValidString(val, 0, 280)) {
                          throw new Error(`Invalid value for payload field: ${key}`);
                      }
                  }
                  payload[key] = val;
              } else if (typeof val === 'boolean') {
                  payload[key] = val;
              } else if (val && typeof val === 'object') {
                  if (key === 'prompt') {
                      const id = typeof val.id === 'string' ? val.id.trim() : '';
                      const text = typeof val.text === 'string' ? val.text.trim() : '';
                      if (!isValidString(id, 1, 80) || !isValidString(text, 1, 280)) {
                          throw new Error('Invalid memory prompt details');
                      }
                      payload[key] = { id, text };
                  } else {
                      throw new Error('Invalid payload structure');
                  }
              } else {
                  payload[key] = val;
              }
          }
      }

      const memoriesCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories');
      const createdBy = (payload && payload.anonymous) ? 'Someone' : (this.profile?.alias || 'wanderer');
      await addDoc(memoriesCol, {
          type: memory.type,
          title,
          description,
          createdAt: Date.now(),
          createdBy,
          creatorUid: this.userId,
          payload
      }).then(() => {
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
          updateDoc(roomRef, {
              memoryCount: increment(1),
              updatedAt: Date.now()
          }).catch(err => console.error('Error updating memoryCount:', err));

          if (memory.type === 'whisper') {
              this.addHistoryEvent('whisper_left', `${this.profile?.alias || 'wanderer'} left a whisper for later.`);
          }

          if (this.profile) {
              const profileRef = doc(db!, 'artifacts', this.appId, 'users', this.userId!, 'userData', 'profile');
              updateDoc(profileRef, {
                  memoriesCreated: increment(1),
                  updatedAt: Date.now()
              }).then(() => {
                  if (this.profile) this.profile.memoriesCreated = (this.profile.memoriesCreated || 0) + 1;
              }).catch(err => console.error('[MEMORIES_COUNT_SYNC] Error:', err));
          }
      }).catch(err => {
          console.error('[ROOM_MEMORIES] Error saving memory:', err);
          throw err;
      });
  }

  async removeMemory(memoryId: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_MEMORIES] Removing memory');
      const memoryRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'memories', memoryId);
      await deleteDoc(memoryRef).then(() => {
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
          updateDoc(roomRef, {
              memoryCount: increment(-1),
              updatedAt: Date.now()
          }).catch(err => console.error('Error updating memoryCount on delete:', err));
      }).catch(err => console.error('[ROOM_MEMORIES] Error removing memory:', err));
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

  async savePhoto(url: string, caption: string) {
      if (!this.userId || !db || !this.roomCode) return;
      if (isPublicSpace(this.roomCode)) {
          throw new Error('Photo uploads not permitted in public spaces');
      }

      const trimmedUrl = url.trim();
      const trimmedCaption = caption.trim();
      if (!isValidString(trimmedUrl, 1, 2048) || !isValidString(trimmedCaption, 1, 280)) {
          throw new Error('Invalid photo input values');
      }

      devLog('[ROOM_PHOTOS] Saving photo');
      const photosCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'photos');
      const alias = this.profile?.alias || 'wanderer';
      
      await addDoc(photosCol, {
          url: trimmedUrl,
          caption: trimmedCaption,
          uploadedBy: alias,
          creatorUid: this.userId,
          createdAt: Date.now()
      }).then(async () => {
          this.addHistoryEvent('photo_added', `${alias} pinned a photograph`);
          
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
          await updateDoc(roomRef, {
              photoCount: increment(1),
              updatedAt: Date.now()
          }).catch(err => console.error('Error updating photoCount:', err));

          if (this.profile) {
              const profileRef = doc(db!, 'artifacts', this.appId, 'users', this.userId!, 'userData', 'profile');
              await updateDoc(profileRef, {
                  photosUploaded: increment(1),
                  updatedAt: Date.now()
              }).then(() => {
                  if (this.profile) this.profile.photosUploaded = (this.profile.photosUploaded || 0) + 1;
              }).catch(err => console.error('[PHOTOS_COUNT_SYNC] Error:', err));
          }
      }).catch(err => {
          console.error('[ROOM_PHOTOS] Error saving photo:', err);
          throw err;
      });
  }

  async deletePhoto(photoId: string) {
      if (!this.userId || !db || !this.roomCode) return;
      devLog('[ROOM_PHOTOS] Deleting photo');
      const photoRef = doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'photos', photoId);
      await deleteDoc(photoRef).then(async () => {
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode!);
          await updateDoc(roomRef, {
              photoCount: increment(-1),
              updatedAt: Date.now()
          }).catch(err => console.error('Error updating photoCount on delete:', err));
      }).catch(err => console.error('[ROOM_PHOTOS] Error deleting photo:', err));
  }

  async loadPhotos(): Promise<RoomPhoto[]> {
      if (!this.userId || !db || !this.roomCode) return [];
      if (this.photos && this.photos.length > 0) return this.photos;
      const photosCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode, 'photos');
      const q = query(photosCol, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q).catch(() => null);
      if (!snap) return [];
      return snap.docs.map(doc => {
          const data = doc.data();
          return {
              id: doc.id,
              url: data.url || '',
              caption: data.caption || '',
              uploadedBy: data.uploadedBy || 'wanderer',
              creatorUid: data.creatorUid || '',
              createdAt: data.createdAt || 0
          } as RoomPhoto;
      });
  }

  async loadExploreRooms(tab: string): Promise<RoomDirectoryItem[]> {
      if (!db) return [];
      const roomsCol = collection(db, 'artifacts', this.appId, 'public', 'data', 'rooms');
      let q;
      if (tab === 'active') {
          q = query(roomsCol, where('activeCount', '>', 0), orderBy('activeCount', 'desc'), limit(20));
      } else if (tab === 'recent') {
          q = query(roomsCol, orderBy('lastActiveAt', 'desc'), limit(20));
      } else if (tab === 'memories') {
          q = query(roomsCol, orderBy('memoryCount', 'desc'), limit(20));
      } else if (tab === 'photos') {
          q = query(roomsCol, orderBy('photoCount', 'desc'), limit(20));
      } else if (tab === 'watching') {
          q = query(roomsCol, where('currentTapeTitle', '!=', null), limit(50));
      } else {
          q = query(roomsCol, orderBy('lastActiveAt', 'desc'), limit(20));
      }

      const snap = await getDocs(q).catch((err) => {
          console.error('[loadExploreRooms ERR]', tab, err);
          return null;
      });
      if (!snap) return [];

      let rooms = snap.docs.map(doc => {
          const data = doc.data();
          return {
              roomCode: doc.id,
              displayName: data.displayName || doc.id,
              theme: data.theme || 'window-seat',
              createdAt: data.createdAt || 0,
              updatedAt: data.updatedAt || 0,
              lastActiveAt: data.lastActiveAt || 0,
              activeCount: data.activeCount || 0,
              memoryCount: data.memoryCount || 0,
              photoCount: data.photoCount || 0,
              queueCount: data.queueCount || 0,
              currentTapeTitle: data.currentTapeTitle,
              currentHost: data.currentHost,
              isPrivate: data.isPrivate || false,
              visitorCount: data.visitorCount || 0,
              visitCount: data.visitCount || 0
          } as RoomDirectoryItem;
      });

      // Filter out private rooms
      rooms = rooms.filter(r => !r.isPrivate);

      // In-memory sort for currently watching to avoid composite index requirements
      if (tab === 'watching') {
          rooms.sort((a, b) => b.updatedAt - a.updatedAt);
          rooms = rooms.slice(0, 20);
      }

      return rooms;
  }

  async saveFavoriteRoom(roomCode: string, displayName: string, theme: string) {
    if (!this.userId || !db) return;
    const favRef = doc(db, 'artifacts', this.appId, 'users', this.userId, 'favorites', roomCode);
    await setDoc(favRef, {
      roomCode,
      displayName,
      theme,
      savedAt: Date.now()
    });
  }

  async removeFavoriteRoom(roomCode: string) {
    if (!this.userId || !db) return;
    const favRef = doc(db, 'artifacts', this.appId, 'users', this.userId, 'favorites', roomCode);
    await deleteDoc(favRef);
  }

  listenToFavorites() {
    if (!this.userId || !db) return;
    
    if (this.unsubFavoritesList) {
      this.unsubFavoritesList();
      this.unsubFavoritesList = null;
    }
    Object.values(this.favoritesUnsubs).forEach(unsub => unsub());
    this.favoritesUnsubs = {};

    const favsCol = collection(db, 'artifacts', this.appId, 'users', this.userId, 'favorites');
    const q = query(favsCol, orderBy('savedAt', 'desc'));
    
    this.unsubFavoritesList = onSnapshot(q, (snap) => {
      const currentFavs = snap.docs.map(d => d.data());
      const newFavCodes = new Set(currentFavs.map(f => f.roomCode));

      Object.keys(this.favoritesUnsubs).forEach(code => {
        if (!newFavCodes.has(code)) {
          this.favoritesUnsubs[code]();
          delete this.favoritesUnsubs[code];
        }
      });

      currentFavs.forEach(fav => {
        const code = fav.roomCode;
        if (!this.favoritesUnsubs[code]) {
          const roomRef = doc(db!, 'artifacts', this.appId, 'public', 'data', 'rooms', code);
          this.favoritesUnsubs[code] = onSnapshot(roomRef, (roomSnap) => {
            if (roomSnap.exists()) {
              const rData = roomSnap.data();
              const target = this.favorites.find(f => f.roomCode === code);
              if (target) {
                target.activeCount = rData.activeCount || 0;
                target.lastActiveAt = rData.lastActiveAt || 0;
                target.createdAt = rData.createdAt || 0;
                target.memoryCount = rData.memoryCount || 0;
                target.photoCount = rData.photoCount || 0;
                target.visitorCount = rData.visitorCount || 0;
                target.visitCount = rData.visitCount || 0;
                this.bus.emit(APP_EVENTS.FAVORITES_UPDATED, this.favorites);
              }
            }
          }, (err) => {
            console.error(`Error listening to room metadata for fav ${code}:`, err);
          });
        }
      });

      this.favorites = currentFavs.map(fav => {
        const code = fav.roomCode;
        return {
          roomCode: code,
          displayName: fav.displayName,
          theme: fav.theme,
          savedAt: fav.savedAt,
          activeCount: 0,
          lastActiveAt: 0,
          createdAt: 0,
          memoryCount: 0,
          photoCount: 0,
          visitorCount: 0,
          visitCount: 0
        };
      });

      // Self-healing stats synchronization for roomsFavorited
      if (this.profile && this.profile.roomsFavorited !== this.favorites.length) {
        this.profile.roomsFavorited = this.favorites.length;
        const profileRef = doc(db!, 'artifacts', this.appId, 'users', this.userId!, 'userData', 'profile');
        updateDoc(profileRef, {
          roomsFavorited: this.favorites.length,
          updatedAt: Date.now()
        }).catch(err => console.error('[FAVORITES_COUNT_SYNC] Error updating user profile favorited stats:', err));
      }

      this.bus.emit(APP_EVENTS.FAVORITES_UPDATED, this.favorites);
    }, (err) => {
      console.error('Error listening to user favorites:', err);
    });
  }

  cleanupFavorites() {
    if (this.unsubFavoritesList) {
      this.unsubFavoritesList();
      this.unsubFavoritesList = null;
    }
    Object.values(this.favoritesUnsubs).forEach(unsub => unsub());
    this.favoritesUnsubs = {};
    this.favorites = [];
  }

  async saveProfile(updated: { alias: string, bio: string, favoriteTheme: string, avatarUrl?: string }) {
    if (!this.userId || !db || !this.profile) return;
    
    if (updated.alias.length > 32) throw new Error('Alias too long');
    if (updated.bio.length > 160) throw new Error('Bio too long');
    if (!['window-seat', 'last-train', 'between-pages', 'northern-lights'].includes(updated.favoriteTheme)) {
        throw new Error('Invalid theme');
    }
    
    if (/<[^>]*>|javascript:/i.test(updated.alias) || /<[^>]*>|javascript:/i.test(updated.bio)) {
        throw new Error('HTML/Script tags are not allowed');
    }

    if (updated.avatarUrl) {
      const decodedUrl = decodeURIComponent(updated.avatarUrl);
      const isExpectedPath = (updated.avatarUrl.startsWith('https://firebasestorage.googleapis.com/') || updated.avatarUrl.includes('.firebasestorage.app'))
        && decodedUrl.includes(`avatars/${this.userId}/`);
      if (!isExpectedPath) {
        throw new Error('Invalid avatar image source path');
      }
    }
    
    const cleanProfile = {
      alias: updated.alias,
      bio: updated.bio,
      joinedAt: this.profile.joinedAt || Date.now(),
      favoriteTheme: updated.favoriteTheme,
      avatarUrl: updated.avatarUrl || '',
      roomsVisited: this.profile.roomsVisited || 0,
      roomsFavorited: this.profile.roomsFavorited || 0,
      memoriesCreated: this.profile.memoriesCreated || 0,
      photosUploaded: this.profile.photosUploaded || 0,
      updatedAt: Date.now()
    };
    
    const ref = doc(db, 'artifacts', this.appId, 'users', this.userId, 'userData', 'profile');
    await setDoc(ref, cleanProfile);
    
    const mood = this.profile.mood;
    this.profile = { ...cleanProfile, mood };
    this.applyIdentity();
  }

  async uploadAvatar(file: File): Promise<string> {
    if (!this.userId || !db) throw new Error('Not authenticated');
    
    if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
    }
    if (file.size > 2 * 1024 * 1024) {
        throw new Error('File size must be less than 2MB');
    }
    
    if (typeof window !== 'undefined' && (window as any).mockUploadAvatar) {
        return await (window as any).mockUploadAvatar(file);
    }
    
    const storage = getStorage();
    const fileName = `${Date.now()}_${file.name}`;
    const avatarRef = ref(storage, `avatars/${this.userId}/${fileName}`);
    
    await uploadBytes(avatarRef, file);
    return await getDownloadURL(avatarRef);
  }
}

export async function uploadPhoto(file: File): Promise<string> {
  const presence = (window as any).presence;
  const roomCode = presence?.roomCode || 'default-room';
  if (isPublicSpace(roomCode)) {
    throw new Error('Photo uploads not permitted in public spaces');
  }
  if (typeof window !== 'undefined' && (window as any).mockUploadPhoto) {
    return (window as any).mockUploadPhoto(file);
  }
  devLog('[ROOM_PHOTOS] Uploading photo');
  const storage = getStorage();
  const storageRef = ref(storage, `photos/${roomCode}/${Date.now()}_${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}

