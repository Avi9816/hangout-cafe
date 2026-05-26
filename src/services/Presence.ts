import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { db, initFirebase } from '../config/firebase';
import { doc, setDoc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { UserProfile, Note, MemoryObject } from '../types';
import { $ } from '../utils/dom'; 
import { debounce as debounceUtil } from '../utils/timing';
import { devLog } from '../utils/logger';

declare const __app_id: any;

export class SharedPresence {
  private bus: EventBus;
  
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
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as any).presence = this;
    }
  }

  private setupBusListeners() {
    this.bus.on(APP_EVENTS.NOTE_POSTED, (note: Note) => {
        if(this.profile) note.author = this.profile.alias;
        this.notes.unshift(note);
        if(this.notes.length > 50) this.notes.pop();
        this.debouncedSyncNotes(this.notes);
    });

    this.bus.on(APP_EVENTS.OBJECT_PLACED, (obj: MemoryObject) => {
        if(this.profile) obj.author = this.profile.alias;
        this.objects.unshift(obj);
        if(this.objects.length > 20) this.objects.pop();
        this.debouncedSyncObjects(this.objects);
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
            } else {
                devLog('[MEDIA_CONTROL_BLOCKED] Blocked non-host media control from:', this.userId);
            }
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

  joinRoom(roomKey: string, theme: string | null = null) {
    if(!this.profile) { this.pendingJoin = { room: roomKey, theme }; return; }
    
    this.roomCode = roomKey; this.ghostUsers = {}; this.activeUsers = {};
    const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(roomKey);
    devLog('[ROOM_CHANGED_EMIT] joinRoom: roomKey = ' + roomKey + ', isPrivate = ' + !isPublic + ', theme = ' + theme);
    this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: roomKey, isPrivate: !isPublic, theme: theme });

    devLog('[DEBUG_JOIN_ROOM] userId = ' + this.userId + ', dbExists = ' + !!db + ', isPublic = ' + isPublic + ', theme = ' + theme);
    if(!this.userId || !db) return;
    if(!isPublic && theme) {
        devLog('[THEME_SAVED]', theme);
        console.log('[FIRESTORE_ROOM_WRITE] private room metadata write start:', { roomKey, theme });
        setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', roomKey), { theme }, { merge: true })
          .then(() => console.log('[FIRESTORE_ROOM_WRITE] private room metadata write SUCCESS'))
          .catch(err => console.error('[FIRESTORE_ROOM_WRITE] private room metadata write ERROR:', err));
    }
    this.updatePresence(); this.listenToRoom();
  }

  updatePresence() {
    if(!this.userId || !db || !this.profile || !this.roomCode) return;
    console.log('[FIRESTORE_ROOM_WRITE] updatePresence start for user:', this.userId, 'room:', this.roomCode);
    setDoc(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), { presence: { [this.userId]: { alias: this.profile.alias, time: Date.now() } } }, { merge: true })
      .then(() => console.log('[FIRESTORE_ROOM_WRITE] updatePresence SUCCESS'))
      .catch(err => console.error('[FIRESTORE_ROOM_WRITE] updatePresence ERROR:', err));
  }

  listenToRoom() {
    if(!this.userId || !db || !this.roomCode) {
      console.log('[DEBUG_LISTEN_ROOM] Skip listen: userId =', this.userId, 'dbExists =', !!db, 'roomCode =', this.roomCode);
      return;
    }
    if(this.unsub) { this.unsub(); this.unsub = null; }

    const docPath = `artifacts/${this.appId}/public/data/rooms/${this.roomCode}`;
    console.log('[DEBUG_LISTEN_ROOM] Subscribing to path:', docPath, 'uid:', this.userId, 'room:', this.roomCode);

    this.unsub = onSnapshot(doc(db, 'artifacts', this.appId, 'public', 'data', 'rooms', this.roomCode), (snap) => {
      console.log('[DEBUG_LISTEN_ROOM] Callback fired! path:', docPath, 'exists:', snap.exists());
      if(snap.exists()) {
        const data = snap.data();
        if(data.latestAction) this.bus.emit(APP_EVENTS.AMBIENT_ACTION_RECEIVED, data.latestAction);
        
        const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(this.roomCode!);
        if(data.theme) {
            devLog('[THEME_RESTORED]', data.theme);
            devLog('[ROOM_CHANGED_EMIT] listenToRoom sync theme:', { room: this.roomCode, isPrivate: !isPublic, theme: data.theme });
            this.bus.emit(APP_EVENTS.ROOM_CHANGED, { room: this.roomCode, isPrivate: !isPublic, theme: data.theme });
        }

        // Force UI updates with current state
        this.notes = data.notes || [];
        console.log('[DEBUG_LISTEN_ROOM] snap notes.length =', this.notes.length);
        console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_NOTES_UPDATED');
        this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, this.notes);

        this.objects = data.objects || [];
        console.log('[DEBUG_LISTEN_ROOM] snap objects.length =', this.objects.length);
        console.log('[DEBUG_LISTEN_ROOM] Emitting REMOTE_OBJECTS_UPDATED');
        this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, this.objects);
        
        if(data.state && data.state.spotify) this.bus.emit(APP_EVENTS.REMOTE_MEDIA_UPDATED, { type: 'spotify', url: data.state.spotify, host: data.state.spotifyHost });

        if(data.video) {
            this.currentVideoState = data.video;
            if (data.video.sender !== this.userId) {
                this.isRemoteUpdate = true; 
                this.bus.emit(APP_EVENTS.REMOTE_MEDIA_UPDATED, data.video);
                setTimeout(() => this.isRemoteUpdate = false, 1500);
            }
        } else {
            this.currentVideoState = null;
        }
        
        if(data.presence) {
          const now = Date.now();
          this.activeUsers = {};
          Object.entries(data.presence).forEach(([id, p]: [string, any]) => {
              if(now - p.time < 60000) this.activeUsers[id] = p;
          });
          this.bus.emit(APP_EVENTS.USER_COUNT_UPDATED, Object.keys(this.activeUsers).length);
          this.renderPresenceUI();
        }
      } else {
          this.bus.emit(APP_EVENTS.REMOTE_NOTES_UPDATED, []);
          this.bus.emit(APP_EVENTS.REMOTE_OBJECTS_UPDATED, []);
      }
    }, (err) => {
      console.error('[DEBUG_LISTEN_ROOM] onSnapshot error:', err);
    });
  }

  renderPresenceUI() {
    const activeArray = Object.values(this.activeUsers); 
    const count = activeArray.length; 
    const presList = $('room-presence-list');
    const soulCount = $('soul-count');
    if(!presList || !soulCount) return;

    presList.innerHTML = '';
    soulCount.textContent = count > 1 ? `${count} souls resting here` : 'you are resting alone';
    if(count > 1) presList.appendChild(document.createTextNode(`currently here: ${activeArray.map(u => u.alias).join(' · ')}`));
  }
}
