import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { Note, MemoryObject, QueueItem, RoomHistoryEvent, RoomMemory, RoomPhoto, RoomDirectoryItem } from '../types';
import { $, $$, createSafeElement } from '../utils/dom';
import { devLog } from '../utils/logger';
import { uploadPhoto } from '../services/Presence';
import { db } from '../config/firebase';
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { ROOM_CONFIG } from '../constants/app';
import { getIcon } from './icons';
import { getRoomSoul } from '../utils/roomSoul';
import { getRoomEchoes } from '../utils/roomEchoes';

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export class SpatialUI {
  private bus: EventBus;
  
  notes: Note[] = [];
  objects: MemoryObject[] = [];
  queue: QueueItem[] = [];
  history: RoomHistoryEvent[] = [];
  memories: RoomMemory[] = [];
  photos: RoomPhoto[] = [];
  currentMetadata: any = null;
  
  elements: Record<string, HTMLElement | HTMLInputElement | null>;

  constructor(bus: EventBus) {
    this.bus = bus;
    
    this.elements = {
        wall: $('the-wall'),
        table: $('memory-table'),
        noteInput: $<HTMLInputElement>('note-input'),
        spotifyInput: $<HTMLInputElement>('spotify-input'),
        youtubeInput: $<HTMLInputElement>('youtube-input'),
        mediaCard: $('media-module')
    };

    this.setupListeners();
    this.setupTabListeners();
    this.setupExploreListeners();
    this.setupBusListeners();
    
    // Initial clear
    this.renderWall();
    this.renderObjects();
  }

  private setupBusListeners() {
      this.bus.on(APP_EVENTS.REMOTE_NOTES_UPDATED, (notes: Note[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received REMOTE_NOTES_UPDATED, count =', notes.length);
          this.notes = Array.isArray(notes) ? notes : [];
          this.renderWall();
      });
      this.bus.on(APP_EVENTS.REMOTE_OBJECTS_UPDATED, (objects: MemoryObject[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received REMOTE_OBJECTS_UPDATED, count =', objects.length);
          this.objects = Array.isArray(objects) ? objects : [];
          this.renderObjects();
      });
      this.bus.on(APP_EVENTS.SYNC_QUEUE, (queue: QueueItem[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received sync:queue, count =', queue.length);
          this.queue = Array.isArray(queue) ? queue : [];
          this.renderQueue();
      });
      this.bus.on(APP_EVENTS.REMOTE_MEDIA_UPDATED, () => {
          this.renderQueue();
      });
      this.bus.on(APP_EVENTS.SYNC_HISTORY, (history: RoomHistoryEvent[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received sync:history, count =', history.length);
          this.history = Array.isArray(history) ? history : [];
          this.renderHistory();
          this.renderEchoes();
      });
      this.bus.on(APP_EVENTS.ROOM_METADATA_UPDATED, (metadata: any) => {
          devLog('[DEBUG_SPATIAL_UI] Received sync:room_metadata_updated');
          this.currentMetadata = metadata;
          this.renderEchoes();
      });
      this.bus.on(APP_EVENTS.SYNC_MEMORIES, (memories: RoomMemory[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received sync:memories, count =', memories.length);
          this.memories = Array.isArray(memories) ? memories : [];
          this.renderMemories();
          this.renderWhispers();
      });
      this.bus.on(APP_EVENTS.SYNC_PHOTOS, (photos: RoomPhoto[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received sync:photos, count =', photos.length);
          this.photos = Array.isArray(photos) ? photos : [];
          this.renderPhotos();
          this.renderMemories(); // Refresh memories because photos are merged
      });
      this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
          if (data.room === null) {
              this.clearTransientRoomUI();
          } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              if (!data.isPrivate) {
                  const activeTabBtn = $('.explore-tab.active');
                  const activeTab = activeTabBtn ? activeTabBtn.getAttribute('data-explore-tab') || 'active' : 'active';
                  this.loadAndRenderExploreRooms(activeTab);
              }
          }
      });
      this.bus.on(APP_EVENTS.ROOM_PROFILE_REQUEST, (roomCode: string) => {
          this.openRoomProfile(roomCode);
      });
      this.bus.on(APP_EVENTS.FAVORITES_UPDATED, (favorites: any[]) => {
          devLog('[DEBUG_SPATIAL_UI] Received local:favorites_updated, count =', favorites.length);
          this.renderFavorites(favorites);
      });
  }

  setupListeners() {
    const postNote = () => {
      const input = this.elements.noteInput as HTMLInputElement;
      const text = input?.value.trim(); if(!text) return;
      this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'paper_pin');
      const note: Note = { text, author: 'wanderer', id: Date.now() };
      devLog('[NOTE_POSTED_EMIT]', note);
      this.bus.emit(APP_EVENTS.NOTE_POSTED, note);
      input.value = ''; 
    };

    $('btn-post-note')?.addEventListener('click', postNote);
    this.elements.noteInput?.addEventListener('keydown', (e: any) => { if(e.key === 'Enter') postNote(); });


    const playSpotify = () => {
        const url = (this.elements.spotifyInput as HTMLInputElement)?.value.trim(); 
        if(!url) return;
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { type: 'spotify', url });
    };
    $('btn-play-spotify')?.addEventListener('click', playSpotify);

    const playYoutube = () => {
        const url = (this.elements.youtubeInput as HTMLInputElement)?.value.trim(); 
        if(!url) return;
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { type: 'youtube', url });
    };
    $('btn-play-youtube')?.addEventListener('click', playYoutube);

    const btnMovie = $('btn-select-movie');
    const movieInput = $<HTMLInputElement>('local-movie-input');
    if (btnMovie && movieInput) {
        btnMovie.addEventListener('click', () => movieInput.click());
        movieInput.addEventListener('change', (e: any) => {
            const file = e.target.files[0];
            if(file) this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { type: 'vhs_seed', file });
        });
    }

    const btnSkip = $('btn-skip-tape');
    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
            const presence = (window as any).presence;
            if (presence) {
                presence.playNextInQueue();
            }
        });
    }

    // Photo Wall Listeners
    const btnSelectPhoto = $('btn-select-photo');
    const photoFileInput = $<HTMLInputElement>('photo-file-input');
    const selectedPhotoName = $('selected-photo-name');
    const btnUploadPhoto = $<HTMLButtonElement>('btn-upload-photo');
    const photoCaptionInput = $<HTMLInputElement>('photo-caption-input');
    const photoUploadError = $('photo-upload-error');

    if (btnSelectPhoto && photoFileInput && selectedPhotoName) {
        btnSelectPhoto.addEventListener('click', () => {
            photoFileInput.click();
        });
        photoFileInput.addEventListener('change', (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
                selectedPhotoName.textContent = file.name;
            } else {
                selectedPhotoName.textContent = 'no file chosen';
            }
        });
    }

    if (btnUploadPhoto && photoFileInput && photoCaptionInput && photoUploadError && selectedPhotoName) {
        btnUploadPhoto.addEventListener('click', async () => {
            const file = photoFileInput.files?.[0];
            if (!file) {
                photoUploadError.textContent = 'please choose a photo first.';
                photoUploadError.style.display = 'block';
                return;
            }
            
            const caption = photoCaptionInput.value.trim() || 'a memory';
            photoUploadError.style.display = 'none';
            btnUploadPhoto.disabled = true;
            const originalBtnText = btnUploadPhoto.textContent;
            btnUploadPhoto.textContent = 'pinning...';
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');

            try {
                const downloadUrl = await uploadPhoto(file);
                const presence = (window as any).presence;
                if (presence) {
                    await presence.savePhoto(downloadUrl, caption);
                }
                
                // Clear input fields
                photoFileInput.value = '';
                photoCaptionInput.value = '';
                selectedPhotoName.textContent = 'no file chosen';
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'paper_pin');
            } catch (err: any) {
                console.error('[PHOTO_UPLOAD_ERROR]', err);
                const isStorageUnavailable = err.code === 'storage/unknown' || (err.message && err.message.includes('unknown error')) || err.status_ === 404;
                if (isStorageUnavailable) {
                    photoUploadError.textContent = 'Firebase Storage is not enabled in your Firebase console. Please follow the setup guide to enable it.';
                } else {
                    photoUploadError.textContent = err.message || 'failed to pin photo.';
                }
                photoUploadError.style.display = 'block';
            } finally {
                btnUploadPhoto.disabled = false;
                btnUploadPhoto.textContent = originalBtnText;
            }
        });
    }

    $('profile-modal-close')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const modal = $('room-profile-modal');
        if (modal) modal.style.display = 'none';
    });
    $('profile-modal-overlay')?.addEventListener('click', () => {
        const modal = $('room-profile-modal');
        if (modal) modal.style.display = 'none';
    });

    $('identity-status')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        this.openMyProfile();
    });

    // Close My Profile Modal
    $('my-profile-modal-close')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const modal = $('my-profile-modal');
        if (modal) modal.style.display = 'none';
    });
    $('my-profile-modal-overlay')?.addEventListener('click', () => {
        const modal = $('my-profile-modal');
        if (modal) modal.style.display = 'none';
    });
    $('btn-close-my-profile')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const modal = $('my-profile-modal');
        if (modal) modal.style.display = 'none';
    });

    // Close Public Profile Modal
    $('public-profile-modal-close')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const modal = $('public-profile-modal');
        if (modal) modal.style.display = 'none';
    });
    $('public-profile-modal-overlay')?.addEventListener('click', () => {
        const modal = $('public-profile-modal');
        if (modal) modal.style.display = 'none';
    });
    $('btn-close-public-profile')?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const modal = $('public-profile-modal');
        if (modal) modal.style.display = 'none';
    });

    // Future Whispers Listeners
    const whisperInput = $<HTMLTextAreaElement>('whisper-input');
    const btnLeaveWhisper = $<HTMLButtonElement>('btn-leave-whisper');
    const whisperCharCount = $('whisper-char-count');
    const whisperError = $('whisper-error');
    const whisperSuccess = $('whisper-success');

    if (whisperInput && btnLeaveWhisper && whisperCharCount && whisperError && whisperSuccess) {
        whisperInput.addEventListener('input', () => {
            const len = whisperInput.value.length;
            whisperCharCount.textContent = `${len} / 180`;
        });

        btnLeaveWhisper.addEventListener('click', async () => {
            const presence = (window as any).presence;
            if (!presence || !presence.userId) {
                whisperError.textContent = 'Write a few words first.';
                whisperError.style.display = 'block';
                return;
            }

            const text = whisperInput.value.trim();
            whisperError.style.display = 'none';
            whisperSuccess.style.display = 'none';

            // Validate empty
            if (!text) {
                whisperError.textContent = 'Write a few words first.';
                whisperError.style.display = 'block';
                return;
            }

            // Require at least 2 visible non-whitespace characters
            const nonWhitespaceCount = text.replace(/\s/g, '').length;
            if (nonWhitespaceCount < 2) {
                whisperError.textContent = 'Write a few words first.';
                whisperError.style.display = 'block';
                return;
            }

            // Reject if message is only symbols/spaces (must contain at least one Unicode letter or number)
            const hasAlphanumeric = /[\p{L}\p{N}]/u.test(text);
            if (!hasAlphanumeric) {
                whisperError.textContent = 'Write a few words first.';
                whisperError.style.display = 'block';
                return;
            }

            // Max length check in TS
            if (text.length > 180) {
                whisperError.textContent = 'Whisper is too long.';
                whisperError.style.display = 'block';
                return;
            }

            // Prevent double-submit
            btnLeaveWhisper.disabled = true;
            whisperInput.disabled = true;
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');

            try {
                await presence.saveMemory({
                    type: 'whisper',
                    title: 'A whisper for later',
                    description: text,
                    payload: { text }
                });

                whisperSuccess.textContent = 'Your whisper was left for later.';
                whisperSuccess.style.display = 'block';
                whisperInput.value = '';
                whisperCharCount.textContent = '0 / 180';
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'paper_pin');

                setTimeout(() => {
                    whisperSuccess.style.display = 'none';
                }, 4000);
            } catch (err: any) {
                console.error('[WHISPER_SAVE_ERROR]', err);
                whisperError.textContent = err.message || 'Failed to leave whisper.';
                whisperError.style.display = 'block';
            } finally {
                btnLeaveWhisper.disabled = false;
                whisperInput.disabled = false;
            }
        });
    }
  }

  setupTabListeners() {
    $$('.media-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
            const targetId = (e.currentTarget as HTMLElement).dataset.tab;
            $$('.media-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $$('.media-pane').forEach(p => p.classList.remove('active'));
            $(`pane-${targetId}`)?.classList.add('active');
        });
    });
  }

  setupExploreListeners() {
    $$('.explore-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
            const targetTab = (e.currentTarget as HTMLElement).dataset.exploreTab;
            if (!targetTab) return;
            $$('.explore-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            this.loadAndRenderExploreRooms(targetTab);
        });
    });
  }

  async loadAndRenderExploreRooms(tab: string) {
    devLog('[DEBUG_EXPLORE] loadAndRenderExploreRooms called with tab:', tab);
    const gridEl = $('explore-grid');
    if (!gridEl) {
        devLog('[DEBUG_EXPLORE] explore-grid element not found!');
        return;
    }

    gridEl.style.opacity = '0.5';

    const presence = (window as any).presence;
    if (!presence) {
        devLog('[DEBUG_EXPLORE] window.presence not found!');
        return;
    }

    try {
        devLog('[DEBUG_EXPLORE] Calling loadExploreRooms...');
        const rooms = await presence.loadExploreRooms(tab);
        devLog('[DEBUG_EXPLORE] loadExploreRooms returned rooms, count:', rooms.length);
        gridEl.innerHTML = '';
        
        if (!rooms || rooms.length === 0) {
            gridEl.innerHTML = '';
            const emptyDiv = createSafeElement('div');
            emptyDiv.style.gridColumn = '1 / -1';
            emptyDiv.style.display = 'flex';
            emptyDiv.style.flexDirection = 'column';
            emptyDiv.style.alignItems = 'center';
            emptyDiv.style.justifyContent = 'center';
            emptyDiv.style.padding = '32px';
            emptyDiv.style.textAlign = 'center';
            emptyDiv.style.opacity = '0.4';
            
            emptyDiv.appendChild(getIcon('aurora', { class: 'hc-icon-lg', style: 'margin-bottom: 8px;' }));
            
            const emptyText = createSafeElement('span', '', 'no active rooms found under this filter...');
            emptyText.style.fontSize = '0.8rem';
            emptyText.style.fontStyle = 'italic';
            emptyText.style.fontFamily = 'var(--font-ui)';
            emptyDiv.appendChild(emptyText);
            gridEl.appendChild(emptyDiv);
            return;
        }

        const frag = document.createDocumentFragment();
        rooms.forEach((room: RoomDirectoryItem) => {
            const card = createSafeElement('div', 'explore-card');
            card.setAttribute('data-room-code', room.roomCode);
            
            const title = createSafeElement('div', 'explore-card-title', room.displayName || room.roomCode);
            card.appendChild(title);

            const theme = createSafeElement('div', 'explore-card-theme', `theme: ${room.theme}`);
            card.appendChild(theme);

            const stats = createSafeElement('div', 'explore-card-stats');
            
            const activeStat = createSafeElement('span', 'explore-stat-item');
            activeStat.style.display = 'inline-flex';
            activeStat.style.alignItems = 'center';
            activeStat.style.gap = '4px';
            activeStat.appendChild(getIcon('user', { class: 'hc-icon-sm' }));
            activeStat.appendChild(document.createTextNode(` ${room.activeCount || 0} active`));
            stats.appendChild(activeStat);

            const memoryStat = createSafeElement('span', 'explore-stat-item');
            memoryStat.style.display = 'inline-flex';
            memoryStat.style.alignItems = 'center';
            memoryStat.style.gap = '4px';
            memoryStat.appendChild(getIcon('pushpin', { class: 'hc-icon-sm' }));
            memoryStat.appendChild(document.createTextNode(` ${room.memoryCount || 0} memories`));
            stats.appendChild(memoryStat);

            const photoStat = createSafeElement('span', 'explore-stat-item');
            photoStat.style.display = 'inline-flex';
            photoStat.style.alignItems = 'center';
            photoStat.style.gap = '4px';
            photoStat.appendChild(getIcon('polaroid', { class: 'hc-icon-sm' }));
            photoStat.appendChild(document.createTextNode(` ${room.photoCount || 0} photos`));
            stats.appendChild(photoStat);

            card.appendChild(stats);

            if (room.currentTapeTitle) {
                const playing = createSafeElement('div', 'explore-card-playing');
                playing.style.display = 'inline-flex';
                playing.style.alignItems = 'center';
                playing.style.gap = '6px';
                playing.appendChild(getIcon('vhs', { class: 'hc-icon-sm' }));
                const playingText = createSafeElement('span', '', ` playing: ${room.currentTapeTitle}`);
                playing.appendChild(playingText);
                if (room.currentHost) {
                    const hostSpan = createSafeElement('span', '', ` (host: ${room.currentHost})`);
                    hostSpan.style.opacity = '0.6';
                    hostSpan.style.fontSize = '0.7rem';
                    playing.appendChild(hostSpan);
                }
                card.appendChild(playing);
            }

            const timeAgo = formatTimeAgo(room.lastActiveAt || room.createdAt);
            const timeMeta = createSafeElement('div', '', `last active: ${timeAgo}`);
            timeMeta.style.fontSize = '0.7rem';
            timeMeta.style.opacity = '0.4';
            timeMeta.style.fontStyle = 'italic';
            timeMeta.style.marginTop = '4px';
            card.appendChild(timeMeta);

            if (!(window as any).roomMetadataCache) {
                (window as any).roomMetadataCache = {};
            }
            (window as any).roomMetadataCache[room.roomCode] = room;

            const soulObj = getRoomSoul(room);
            const soulMeta = createSafeElement('div', 'room-card-soul', soulObj.shortDescription);
            card.appendChild(soulMeta);

            const joinBtn = createSafeElement('button', 'text-btn explore-card-action', 'Enter room');
            joinBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop click from opening profile modal
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
                this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, { room: room.roomCode, theme: room.theme });
            });
            card.appendChild(joinBtn);

            card.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                this.openRoomProfile(room.roomCode);
            });

            frag.appendChild(card);
        });
        
        gridEl.appendChild(frag);
    } catch (err) {
        console.error('Failed to load explore rooms:', err);
        gridEl.innerHTML = `<div style="grid-column: 1 / -1; color: var(--accent); font-size: 0.8rem; text-align: center;">failed to load explore list.</div>`;
    } finally {
        gridEl.style.opacity = '1';
    }
  }

  renderWall() {
    devLog('[DEBUG_SPATIAL_UI] renderWall called, notes count =', this.notes.length);
    const wall = this.elements.wall;
    if(!wall) {
        devLog('[DEBUG_SPATIAL_UI] renderWall complete (no wall element)');
        return;
    }
    wall.innerHTML = ''; 
    const now = Date.now();
    const frag = document.createDocumentFragment();
    this.notes.forEach(n => {
      const div = createSafeElement('div', 'spatial-note');
      const ageHours = (now - n.id) / 3600000;
      if(ageHours > 72) div.style.opacity = '0.2'; 
      else if(ageHours > 24) div.style.opacity = '0.5'; 
      const txtSpan = createSafeElement('span', '', n.text);
      const sigSpan = createSafeElement('span', 'note-signature', `— ${n.author}`);
      div.appendChild(txtSpan); 
      div.appendChild(sigSpan);

      const pinBtn = createSafeElement('button', 'text-btn');
      pinBtn.style.marginLeft = '12px';
      pinBtn.style.padding = '0';
      pinBtn.style.fontSize = '0.75rem';
      pinBtn.style.opacity = '0.4';
      pinBtn.style.display = 'inline-flex';
      pinBtn.style.alignItems = 'center';
      pinBtn.style.gap = '4px';
      pinBtn.appendChild(getIcon('pushpin', { class: 'hc-icon-sm' }));
      pinBtn.appendChild(document.createTextNode(' pin'));
      pinBtn.addEventListener('click', () => {
          this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
          const presence = (window as any).presence;
          if (presence) {
              presence.saveMemory({
                  type: 'note',
                  title: `Note: "${n.text.substring(0, 20)}${n.text.length > 20 ? '...' : ''}"`,
                  description: `Left by ${n.author}`,
                  payload: { text: n.text, author: n.author }
              });
          }
      });
      div.appendChild(pinBtn);

      frag.appendChild(div);
    });
    wall.appendChild(frag);
    devLog('[DEBUG_SPATIAL_UI] renderWall complete, DOM nodes count =', wall.childNodes.length);
  }

  renderObjects() {
    devLog('[DEBUG_SPATIAL_UI] renderObjects called, objects count =', this.objects.length);
    const table = this.elements.table;
    if(!table) {
        devLog('[DEBUG_SPATIAL_UI] renderObjects complete (no table element)');
        return;
    }
    table.innerHTML = ''; 
    const now = Date.now();
    const frag = document.createDocumentFragment();
    this.objects.forEach(o => {
      const div = createSafeElement('div', 'memory-object');
      const ageHours = (now - o.id) / 3600000;
      if(ageHours > 48) div.style.opacity = '0.1';
      const emSpan = createSafeElement('span', 'emoji-container');
      emSpan.style.display = 'inline-flex';
      emSpan.style.alignItems = 'center';
      emSpan.style.marginRight = '6px';
      
      const emojiMap: Record<string, string> = {
          '☕': 'coffee',
          '📖': 'book',
          '🎞️': 'polaroid',
          '🕯️': 'lantern'
      };
      const iconName = emojiMap[o.emoji] || 'object';
      emSpan.appendChild(getIcon(iconName, { class: 'hc-icon-md' }));

      const lblSpan = createSafeElement('span', '', o.label);
      const hstSpan = createSafeElement('span', 'memory-host', o.author);
      div.appendChild(emSpan); div.appendChild(lblSpan); div.appendChild(hstSpan);

      const pinBtn = createSafeElement('button', 'text-btn');
      pinBtn.style.marginLeft = '8px';
      pinBtn.style.padding = '0';
      pinBtn.style.fontSize = '0.7rem';
      pinBtn.style.opacity = '0.4';
      pinBtn.style.display = 'inline-flex';
      pinBtn.style.alignItems = 'center';
      pinBtn.style.gap = '4px';
      pinBtn.appendChild(getIcon('pushpin', { class: 'hc-icon-sm' }));
      pinBtn.appendChild(document.createTextNode(' pin'));
      pinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
          const presence = (window as any).presence;
          if (presence) {
              presence.saveMemory({
                  type: 'object',
                  title: `${o.emoji} ${o.label}`,
                  description: `Placed by ${o.author}`,
                  payload: { emoji: o.emoji, label: o.label, author: o.author }
              });
          }
      });
      div.appendChild(pinBtn);

      div.style.transform = `rotate(${Math.random() * 12 - 6}deg)`;
      frag.appendChild(div);
    });
    table.appendChild(frag);
    devLog('[DEBUG_SPATIAL_UI] renderObjects complete, DOM nodes count =', table.childNodes.length);
  }

  renderQueue() {
    const listEl = $('vhs-queue-list');
    const skipBtn = $('btn-skip-tape');
    if (!listEl) return;
    listEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    const isHost = presence.currentVideoState && presence.currentVideoState.hostId === presence.userId;
    
    // Toggle skip button visibility for host
    if (skipBtn) {
        const isPlayingAny = this.queue.some(q => q.status === 'playing');
        if (isHost && isPlayingAny) {
            skipBtn.style.display = 'inline-block';
        } else {
            skipBtn.style.display = 'none';
        }
    }

    const hostInfo = $('queue-host-info');
    const viewerStatus = $('queue-viewer-status');
    const controlMessage = $('queue-control-message');

    // Update current host info
    if (hostInfo) {
        if (presence.currentVideoState && presence.currentVideoState.host) {
            hostInfo.textContent = `host: ${presence.currentVideoState.host}`;
        } else {
            hostInfo.textContent = `host: none`;
        }
    }

    // Toggle viewer status and control message
    if (viewerStatus) {
        viewerStatus.style.display = isHost ? 'none' : 'flex';
    }
    if (controlMessage) {
        controlMessage.textContent = '';
        controlMessage.style.display = 'inline-flex';
        controlMessage.style.alignItems = 'center';
        controlMessage.style.gap = '6px';
        if (isHost) {
            controlMessage.style.color = '#4ade80';
            controlMessage.style.opacity = '0.7';
            controlMessage.appendChild(getIcon('star', { class: 'hc-icon-sm' }));
            const textSpan = createSafeElement('span', '', 'you are the host. you can play queued tapes and skip playing media.');
            controlMessage.appendChild(textSpan);
        } else {
            controlMessage.style.color = 'var(--text-muted)';
            controlMessage.style.opacity = '0.4';
            controlMessage.appendChild(getIcon('window', { class: 'hc-icon-sm' }));
            const textSpan = createSafeElement('span', '', 'only the host can control tape playback and advance the queue.');
            controlMessage.appendChild(textSpan);
        }
    }

    if (this.queue.length === 0) {
        listEl.textContent = '';
        const emptyDiv = createSafeElement('div');
        emptyDiv.style.cssText = "opacity: 0.4; font-style: italic; font-size: 0.8rem; padding: 16px 0; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;";
        emptyDiv.appendChild(getIcon('vhs', { class: 'hc-icon-sm' }));
        emptyDiv.appendChild(document.createTextNode('no tapes queued. drag & drop a file or click above to queue a tape...'));
        listEl.appendChild(emptyDiv);
        return;
    }

    const frag = document.createDocumentFragment();
    this.queue.forEach(item => {
        const itemDiv = createSafeElement('div', 'queue-item');
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.padding = '10px 14px';
        itemDiv.style.borderRadius = '6px';
        itemDiv.style.transition = 'all 0.3s ease';

        if (item.status === 'playing') {
            itemDiv.style.background = 'rgba(235, 94, 85, 0.05)';
            itemDiv.style.border = '1px solid rgba(235, 94, 85, 0.2)';
            itemDiv.style.boxShadow = '0 0 15px rgba(235, 94, 85, 0.05)';
        } else if (item.status === 'completed') {
            itemDiv.style.background = 'rgba(255,255,255,0.01)';
            itemDiv.style.border = '1px solid rgba(255,255,255,0.02)';
            itemDiv.style.opacity = '0.35';
        } else {
            itemDiv.style.background = 'rgba(255,255,255,0.02)';
            itemDiv.style.border = '1px solid rgba(255,255,255,0.04)';
        }

        const infoDiv = createSafeElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.flexDirection = 'column';
        infoDiv.style.gap = '4px';

        const titleRow = createSafeElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.alignItems = 'center';
        titleRow.style.gap = '8px';

        let statusBadgeText = '';
        let statusBadgeColor = '';
        let statusBadgeBg = '';
        
        if (item.status === 'playing') {
            statusBadgeText = 'playing';
            statusBadgeColor = 'var(--accent)';
            statusBadgeBg = 'rgba(235, 94, 85, 0.15)';
        } else if (item.status === 'completed') {
            statusBadgeText = 'finished';
            statusBadgeColor = 'rgba(255,255,255,0.4)';
            statusBadgeBg = 'rgba(255, 255, 255, 0.05)';
        } else {
            statusBadgeText = 'queued';
            statusBadgeColor = '#f4d35e';
            statusBadgeBg = 'rgba(244, 211, 94, 0.1)';
        }

        const statusBadge = createSafeElement('span', '', statusBadgeText);
        statusBadge.style.fontSize = '0.65rem';
        statusBadge.style.fontWeight = 'bold';
        statusBadge.style.textTransform = 'uppercase';
        statusBadge.style.letterSpacing = '0.5px';
        statusBadge.style.color = statusBadgeColor;
        statusBadge.style.background = statusBadgeBg;
        statusBadge.style.padding = '1px 6px';
        statusBadge.style.borderRadius = '3px';
        titleRow.appendChild(statusBadge);

        const titleSpan = createSafeElement('span', '', item.title);
        titleSpan.style.fontWeight = item.status === 'playing' ? '600' : '400';
        titleSpan.style.fontSize = '0.85rem';
        if (item.status === 'playing') titleSpan.style.color = '#fff';
        titleRow.appendChild(titleSpan);
        infoDiv.appendChild(titleRow);

        const metaSpan = createSafeElement('span', '', `added by ${item.addedBy}`);
        metaSpan.style.fontSize = '0.7rem';
        metaSpan.style.opacity = '0.4';
        metaSpan.style.textTransform = 'lowercase';
        infoDiv.appendChild(metaSpan);

        if (item.status === 'playing') {
            const tapePinBtn = createSafeElement('button', 'text-btn');
            tapePinBtn.style.padding = '0';
            tapePinBtn.style.fontSize = '0.7rem';
            tapePinBtn.style.opacity = '0.5';
            tapePinBtn.style.margin = '0 0 0 10px';
            tapePinBtn.style.display = 'inline-flex';
            tapePinBtn.style.alignItems = 'center';
            tapePinBtn.style.gap = '4px';
            tapePinBtn.appendChild(getIcon('pushpin', { class: 'hc-icon-sm' }));
            tapePinBtn.appendChild(document.createTextNode(' pin'));
            tapePinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                if (presence.currentVideoState) {
                    presence.saveMemory({
                        type: 'tape',
                        title: `Tape: ${item.title}`,
                        description: `Played by ${item.addedBy}`,
                        payload: {
                            url: item.url,
                            title: item.title,
                            type: presence.currentVideoState.type || 'magnet'
                        }
                    });
                }
            });
            titleRow.appendChild(tapePinBtn);
        }

        itemDiv.appendChild(infoDiv);

        // Control buttons for host
        if (isHost && item.status === 'pending') {
            const startBtn = createSafeElement('button', 'text-btn', 'play now');
            startBtn.style.padding = '4px 8px';
            startBtn.style.fontSize = '0.7rem';
            startBtn.style.margin = '0';
            startBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                presence.startQueuedMedia(item.id);
            });
            itemDiv.appendChild(startBtn);
        }

        frag.appendChild(itemDiv);
    });
    listEl.appendChild(frag);
  }

  renderHistory() {
    const listEl = $('room-history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.history.length === 0) {
        listEl.innerHTML = '';
        const emptyDiv = createSafeElement('div');
        emptyDiv.style.display = 'flex';
        emptyDiv.style.flexDirection = 'column';
        emptyDiv.style.alignItems = 'center';
        emptyDiv.style.justifyContent = 'center';
        emptyDiv.style.padding = '24px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.opacity = '0.4';
        emptyDiv.appendChild(getIcon('lantern', { class: 'hc-icon-lg', style: 'margin-bottom: 8px;' }));
        
        const emptyText = createSafeElement('span', '', 'The air is still. No whispers have been left behind recently...');
        emptyText.style.fontSize = '0.8rem';
        emptyText.style.fontStyle = 'italic';
        emptyText.style.fontFamily = 'var(--font-ui)';
        emptyDiv.appendChild(emptyText);
        listEl.appendChild(emptyDiv);
        return;
    }

    const frag = document.createDocumentFragment();
    this.history.forEach(item => {
        const itemDiv = createSafeElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.fontSize = '0.75rem';
        itemDiv.style.padding = '6px 0';
        itemDiv.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
        
        const textSpan = createSafeElement('span');
        textSpan.style.display = 'inline-flex';
        textSpan.style.alignItems = 'center';
        textSpan.style.gap = '6px';
        textSpan.style.opacity = '0.85';

        let iconName = 'room';
        if (item.type === 'tape_played') iconName = 'vhs';
        else if (item.type === 'note_pinned') iconName = 'pushpin';
        else if (item.type === 'object_placed') iconName = 'object';
        else if (item.type === 'host_changed') iconName = 'lantern';
        else if (item.type === 'room_created') iconName = 'room';
        else if (item.type === 'photo_added') iconName = 'polaroid';

        textSpan.appendChild(getIcon(iconName, { class: 'hc-icon-sm' }));
        const textNode = createSafeElement('span', '', `${item.text}`);
        textSpan.appendChild(textNode);
        textSpan.style.opacity = '0.85';
        
        const timeSpan = createSafeElement('span', '', formatTimeAgo(item.createdAt));
        timeSpan.style.fontSize = '0.65rem';
        timeSpan.style.opacity = '0.4';
        timeSpan.style.fontStyle = 'italic';
        
        itemDiv.appendChild(textSpan);
        itemDiv.appendChild(timeSpan);
        frag.appendChild(itemDiv);
    });
    listEl.appendChild(frag);

    // Update "Last tape played" based on history
    const lastTapeDiv = $('last-tape-played');
    if (lastTapeDiv) {
        const lastTapeEvent = this.history.find(h => h.type === 'tape_played');
        if (lastTapeEvent) {
            let cleanText = lastTapeEvent.text
                .replace('Started playing tape ', '')
                .replace('Queue auto-advanced to ', '')
                .replace('Started playing queued tape ', '');
            lastTapeDiv.textContent = `Last tape left playing: ${cleanText}`;
            lastTapeDiv.style.display = 'block';
        } else {
            lastTapeDiv.style.display = 'none';
        }
    }
  }

  renderEchoes() {
    const listEl = $('room-echoes-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const echoes = getRoomEchoes({
      history: this.history,
      metadata: this.currentMetadata || undefined,
      max: 3
    });

    if (echoes.length === 0) {
      const emptyDiv = createSafeElement('div', 'echo-empty-state', 'No echoes yet. Leave something behind.');
      listEl.appendChild(emptyDiv);
      return;
    }

    const frag = document.createDocumentFragment();
    echoes.forEach(echo => {
      const itemDiv = createSafeElement('div', 'echo-item');
      
      const contentDiv = createSafeElement('div', 'echo-item-content');
      
      const dot = createSafeElement('div', `echo-dot tone-${echo.tone}`);
      contentDiv.appendChild(dot);
      
      const textSpan = createSafeElement('span', '', echo.text);
      contentDiv.appendChild(textSpan);
      
      itemDiv.appendChild(contentDiv);
      
      if (typeof echo.createdAt === 'number' && !isNaN(echo.createdAt) && echo.createdAt > 0) {
        const timeSpan = createSafeElement('span', 'echo-time', formatTimeAgo(echo.createdAt));
        itemDiv.appendChild(timeSpan);
      }
      
      frag.appendChild(itemDiv);
    });
    listEl.appendChild(frag);
  }

  renderMemories() {
    const listEl = $('room-memories-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    // Filter out whispers from the main pinned memories list
    const nonWhispers = this.memories.filter(m => m && m.type !== 'whisper');

    // Combine memories and photos as first-class room memories
    const combined: any[] = [
      ...nonWhispers.map(m => ({ ...m, isPhoto: false })),
      ...this.photos.map(p => ({
        id: p.id,
        type: 'photo',
        title: p.caption || 'photograph',
        description: 'photograph',
        createdAt: p.createdAt,
        createdBy: p.uploadedBy,
        creatorUid: p.creatorUid,
        payload: { url: p.url, caption: p.caption },
        isPhoto: true
      }))
    ];

    combined.sort((a, b) => b.createdAt - a.createdAt);

    if (combined.length === 0) {
        listEl.innerHTML = '';
        const emptyDiv = createSafeElement('div');
        emptyDiv.style.display = 'flex';
        emptyDiv.style.flexDirection = 'column';
        emptyDiv.style.alignItems = 'center';
        emptyDiv.style.justifyContent = 'center';
        emptyDiv.style.padding = '24px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.opacity = '0.4';
        emptyDiv.appendChild(getIcon('pushpin', { class: 'hc-icon-lg', style: 'margin-bottom: 8px;' }));
        
        const emptyText = createSafeElement('span', '', "This room's walls are bare. Pin a note, whisper, tape, or photo to build its memory...");
        emptyText.style.fontSize = '0.8rem';
        emptyText.style.fontStyle = 'italic';
        emptyText.style.fontFamily = 'var(--font-ui)';
        emptyDiv.appendChild(emptyText);
        listEl.appendChild(emptyDiv);
        return;
    }

    const frag = document.createDocumentFragment();
    combined.forEach(item => {
        const itemDiv = createSafeElement('div', 'room-memory-card');

        let iconName = 'room';
        let leftBorderColor = '';
        let rowBg = '';

        if (item.type === 'tape') {
            iconName = 'vhs';
            leftBorderColor = 'rgba(235, 94, 85, 0.6)'; // accent/rose
            rowBg = 'rgba(235, 94, 85, 0.02)';
        } else if (item.type === 'note') {
            iconName = 'pushpin';
            leftBorderColor = 'rgba(244, 211, 94, 0.6)'; // warm yellow
            rowBg = 'rgba(244, 211, 94, 0.02)';
        } else if (item.type === 'object') {
            const emojiMap: Record<string, string> = {
                '☕': 'coffee',
                '📖': 'book',
                '🎞️': 'polaroid',
                '🕯️': 'lantern'
            };
            const customEmoji = item.payload && item.payload.emoji;
            iconName = emojiMap[customEmoji] || 'object';
            leftBorderColor = 'rgba(74, 222, 128, 0.6)'; // green
            rowBg = 'rgba(74, 222, 128, 0.02)';
        } else if (item.type === 'photo') {
            iconName = 'polaroid';
            leftBorderColor = 'rgba(168, 85, 247, 0.6)'; // purple
            rowBg = 'rgba(168, 85, 247, 0.02)';
        } else {
            iconName = 'lantern';
            leftBorderColor = 'rgba(96, 165, 250, 0.6)'; // blue
            rowBg = 'rgba(96, 165, 250, 0.02)';
        }

        itemDiv.style.background = rowBg;
        itemDiv.style.border = '1px solid rgba(255,255,255,0.04)';
        itemDiv.style.borderLeft = `4px solid ${leftBorderColor}`;

        const infoDiv = createSafeElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.flexDirection = 'column';
        infoDiv.style.gap = '2px';

        const titleSpan = createSafeElement('span');
        titleSpan.style.display = 'inline-flex';
        titleSpan.style.alignItems = 'center';
        titleSpan.style.gap = '6px';
        titleSpan.style.fontWeight = '600';
        titleSpan.style.fontSize = '0.85rem';
        titleSpan.style.color = '#fff';
        titleSpan.appendChild(getIcon(iconName, { class: 'hc-icon-sm' }));
        if (item.type === 'photo') {
            const hiddenEmoji = document.createElement('span');
            hiddenEmoji.style.display = 'none';
            hiddenEmoji.textContent = '📸';
            titleSpan.appendChild(hiddenEmoji);
        }
        titleSpan.appendChild(document.createTextNode(` ${item.title}`));
        titleSpan.style.fontWeight = '600';
        titleSpan.style.fontSize = '0.85rem';
        titleSpan.style.color = '#fff';
        
        const descRow = createSafeElement('div');
        descRow.style.display = 'flex';
        descRow.style.alignItems = 'center';
        descRow.style.flexWrap = 'wrap';
        descRow.style.gap = '6px';
        descRow.style.fontSize = '0.72rem';
        descRow.style.opacity = '0.5';

        const descSpan = createSafeElement('span', '', item.description || '');
        const creatorSpan = createSafeElement('span', '', `by ${item.createdBy}`);
        creatorSpan.style.opacity = '0.8';
        const timeSpan = createSafeElement('span', '', `· ${formatTimeAgo(item.createdAt)}`);
        timeSpan.style.fontSize = '0.65rem';

        descRow.appendChild(descSpan);
        descRow.appendChild(creatorSpan);
        descRow.appendChild(timeSpan);

        infoDiv.appendChild(titleSpan);
        infoDiv.appendChild(descRow);
        itemDiv.appendChild(infoDiv);

        // Actions: Restore / Delete
        const actionsDiv = createSafeElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';

        const restoreBtn = createSafeElement('button', 'text-btn', 'restore');
        restoreBtn.style.padding = '2px 6px';
        restoreBtn.style.fontSize = '0.75rem';
        restoreBtn.style.margin = '0';
        restoreBtn.addEventListener('click', () => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
            if (item.type === 'tape') {
                this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, {
                    type: item.payload.type || 'magnet',
                    url: item.payload.url,
                    action: 'play',
                    time: 0,
                    title: item.payload.title,
                    timestamp: Date.now()
                });
            } else if (item.type === 'note') {
                this.bus.emit(APP_EVENTS.NOTE_POSTED, {
                    text: item.payload.text,
                    author: item.payload.author,
                    id: Date.now()
                });
            } else if (item.type === 'object') {
                this.bus.emit(APP_EVENTS.OBJECT_PLACED, {
                    emoji: item.payload.emoji,
                    label: item.payload.label,
                    author: item.payload.author,
                    id: Date.now()
                });
            } else if (item.type === 'photo') {
                // Photo memory restore: scroll to photo wall section
                $('photo-wall-section')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
        if (item.type !== 'object') {
            actionsDiv.appendChild(restoreBtn);
        }

        // Show delete button only if current user is creator
        if (presence.userId && item.creatorUid === presence.userId) {
            const deleteBtn = createSafeElement('button', 'text-btn', 'delete');
            deleteBtn.style.padding = '2px 6px';
            deleteBtn.style.fontSize = '0.75rem';
            deleteBtn.style.margin = '0';
            deleteBtn.style.color = 'var(--accent)';
            deleteBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                if (item.isPhoto) {
                    presence.deletePhoto(item.id);
                } else {
                    presence.removeMemory(item.id);
                }
            });
            actionsDiv.appendChild(deleteBtn);
        }

        itemDiv.appendChild(actionsDiv);
        frag.appendChild(itemDiv);
    });
    listEl.appendChild(frag);
  }

  renderWhispers() {
    const listEl = $('room-whispers-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    // Filter memories of type 'whisper'
    const whispers = this.memories
      .filter(m => m && m.type === 'whisper')
      .sort((a, b) => {
          const aTime = a.createdAt || 0;
          const bTime = b.createdAt || 0;
          return bTime - aTime;
      });

    if (whispers.length === 0) {
        return;
    }

    // Limit display to latest 5 whispers
    const latestWhispers = whispers.slice(0, 5);

    const frag = document.createDocumentFragment();
    latestWhispers.forEach(item => {
        const itemDiv = createSafeElement('div', 'whisper-card');

        // Message text element
        const textDiv = createSafeElement('div');
        textDiv.style.fontSize = '0.85rem';
        textDiv.style.color = '#e2e8f0';
        textDiv.style.lineHeight = '1.4';
        textDiv.style.fontStyle = 'italic';
        textDiv.style.textAlign = 'left';
        
        const rawText = item.description || (item.payload && item.payload.text) || '';
        textDiv.textContent = rawText;

        // Attribution row
        const metaDiv = createSafeElement('div');
        metaDiv.style.display = 'flex';
        metaDiv.style.justifyContent = 'space-between';
        metaDiv.style.alignItems = 'center';
        metaDiv.style.fontSize = '0.7rem';
        metaDiv.style.opacity = '0.5';
        metaDiv.style.marginTop = '4px';

        const creatorName = item.createdBy || 'wanderer';
        let timeStr = 'left sometime ago';
        if (item.createdAt && typeof item.createdAt === 'number' && !isNaN(item.createdAt)) {
            timeStr = formatTimeAgo(item.createdAt);
            if (timeStr.includes('NaN') || timeStr.includes('Invalid') || timeStr.includes('undefined')) {
                timeStr = 'left sometime ago';
            }
        }

        const authorTimeDiv = createSafeElement('div');
        authorTimeDiv.style.display = 'flex';
        authorTimeDiv.style.gap = '6px';
        
        const authorSpan = createSafeElement('span');
        authorSpan.textContent = `left by ${creatorName}`;
        
        const dotSpan = createSafeElement('span');
        dotSpan.textContent = '·';
        
        const timeSpan = createSafeElement('span');
        timeSpan.textContent = timeStr;

        authorTimeDiv.appendChild(authorSpan);
        authorTimeDiv.appendChild(dotSpan);
        authorTimeDiv.appendChild(timeSpan);

        metaDiv.appendChild(authorTimeDiv);

        // Delete button for creator only
        if (presence.userId && item.creatorUid === presence.userId) {
            const deleteBtn = createSafeElement('button', 'text-btn', 'delete');
            deleteBtn.style.padding = '0';
            deleteBtn.style.fontSize = '0.7rem';
            deleteBtn.style.margin = '0';
            deleteBtn.style.color = 'var(--accent)';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                presence.removeMemory(item.id);
            });
            metaDiv.appendChild(deleteBtn);
        }

        itemDiv.appendChild(textDiv);
        itemDiv.appendChild(metaDiv);
        frag.appendChild(itemDiv);
    });

    listEl.appendChild(frag);
  }

  renderPhotos() {
    const gridEl = $('photo-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    if (this.photos.length === 0) {
        gridEl.textContent = '';
        const emptyDiv = createSafeElement('div');
        emptyDiv.style.cssText = "grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; text-align: center; opacity: 0.4;";
        emptyDiv.appendChild(getIcon('polaroid', { class: 'hc-icon-lg', style: 'margin-bottom: 8px;' }));
        const textSpan = createSafeElement('span', '', 'No photographs pinned here yet...');
        textSpan.style.cssText = "font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);";
        emptyDiv.appendChild(textSpan);
        gridEl.appendChild(emptyDiv);
        return;
    }

    const frag = document.createDocumentFragment();
    this.photos.forEach(photo => {
        const card = createSafeElement('div', 'polaroid-card');
        
        const imgContainer = createSafeElement('div', 'polaroid-image-container');
        const img = createSafeElement('img', 'polaroid-image') as HTMLImageElement;
        img.src = photo.url;
        img.alt = photo.caption || 'Polaroid Memory';
        img.loading = 'lazy';
        imgContainer.appendChild(img);
        
        const caption = createSafeElement('div', 'polaroid-caption', photo.caption || '');
        
        const meta = createSafeElement('div', 'polaroid-meta', `by ${photo.uploadedBy} · ${formatTimeAgo(photo.createdAt)}`);
        
        card.appendChild(imgContainer);
        card.appendChild(caption);
        card.appendChild(meta);

        // Creator-only delete button
        if (presence.userId && photo.creatorUid === presence.userId) {
            const deleteBtn = createSafeElement('button', 'polaroid-delete-btn', '×');
            deleteBtn.title = 'Delete photo';
            deleteBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                presence.deletePhoto(photo.id);
            });
            card.appendChild(deleteBtn);
        }

        frag.appendChild(card);
    });
    gridEl.appendChild(frag);
  }

  async openRoomProfile(roomCode: string) {
    if (!db) return;
    devLog('[ROOM_PROFILE] Opening profile for:', roomCode);
    
    const modal = $('room-profile-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';

    const soulContainer = $('profile-soul-container');
    if (soulContainer) {
      soulContainer.hidden = true;
    }
    
    const titleEl = $('profile-room-title');
    const themeEl = $('profile-room-theme');
    const toggleFavBtn = $('btn-toggle-favorite') as HTMLButtonElement;
    
    const statCreated = $('profile-stat-created');
    const statLastActive = $('profile-stat-last-active');
    const statActive = $('profile-stat-active');
    const statMemories = $('profile-stat-memories');
    const statPhotos = $('profile-stat-photos');
    const statQueue = $('profile-stat-queue');
    const statVisitors = $('profile-stat-visitors');
    const statVisits = $('profile-stat-visits');
    
    const nowPlayingSection = $('profile-now-playing-section');
    const tapeTitleEl = $('profile-tape-title');
    const tapeHostEl = $('profile-tape-host');
    
    const descEl = $('profile-description');
    const historyPreviewEl = $('profile-history-preview');
    const photosPreviewEl = $('profile-photos-preview');
    const joinBtn = $('profile-btn-join');

    if (titleEl) titleEl.textContent = roomCode;
    if (themeEl) {
      themeEl.textContent = 'loading...';
      themeEl.className = 'badge-theme';
    }
    if (statCreated) statCreated.textContent = '-';
    if (statLastActive) statLastActive.textContent = '-';
    if (statActive) statActive.textContent = '-';
    if (statMemories) statMemories.textContent = '-';
    if (statPhotos) statPhotos.textContent = '-';
    if (statQueue) statQueue.textContent = '-';
    if (statVisitors) statVisitors.textContent = '-';
    if (statVisits) statVisits.textContent = '-';
    
    if (nowPlayingSection) nowPlayingSection.style.display = 'none';
    if (descEl) descEl.textContent = 'Looking for records of this corner...';
    if (historyPreviewEl) historyPreviewEl.innerHTML = '<div style="opacity:0.5; font-size:0.75rem;">Loading history...</div>';
    if (photosPreviewEl) photosPreviewEl.innerHTML = '<div style="opacity:0.5; font-size:0.75rem;">Loading photos...</div>';

    const presence = (window as any).presence;
    if (!presence) return;

    let roomTheme = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(roomCode) ? roomCode : 'window-seat';

    const isFav = presence.favorites.some((f: any) => f.roomCode === roomCode);
    if (toggleFavBtn) {
      toggleFavBtn.style.display = 'inline-flex';
      toggleFavBtn.style.alignItems = 'center';
      toggleFavBtn.style.gap = '6px';
      
      const updateFavBtnContent = (saved: boolean) => {
        toggleFavBtn.innerHTML = '';
        toggleFavBtn.appendChild(getIcon('star', { class: 'hc-icon-sm' }));
        const hiddenEmoji = document.createElement('span');
        hiddenEmoji.style.display = 'none';
        hiddenEmoji.textContent = '⭐';
        toggleFavBtn.appendChild(hiddenEmoji);
        toggleFavBtn.appendChild(document.createTextNode(saved ? ' Saved' : ' Save to Favorites'));
      };
      
      updateFavBtnContent(isFav);
      
      toggleFavBtn.onclick = async () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        const isCurrentlyFav = presence.favorites.some((f: any) => f.roomCode === roomCode);
        if (isCurrentlyFav) {
          await presence.removeFavoriteRoom(roomCode);
          updateFavBtnContent(false);
        } else {
          let displayName = roomCode;
          const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(roomCode);
          if (isPublic) {
            displayName = roomCode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          } else {
            displayName = `corner: ${roomCode}`;
          }
          await presence.saveFavoriteRoom(roomCode, displayName, roomTheme);
          updateFavBtnContent(true);
        }
      };
    }

    if (joinBtn) {
      joinBtn.onclick = () => {
        modal.style.display = 'none';
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, { room: roomCode, theme: roomTheme });
      };
    }

    try {
      const appId = presence.appId;
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
      const roomSnap = await getDoc(roomRef);

      const isPublic = ['last-train', 'window-seat', 'between-pages', 'northern-lights'].includes(roomCode);
      const displayName = isPublic ? 
          (roomCode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) : 
          `corner: ${roomCode}`;
      
      let activeCount = 0;
      let memoryCount = 0;
      let photoCount = 0;
      let queueCount = 0;
      let visitorCount = 0;
      let visitCount = 0;
      let createdAt = Date.now();
      let lastActiveAt = Date.now();
      let tapeTitle = '';
      let tapeHost = '';

      if (roomSnap.exists()) {
        const data = roomSnap.data();
        if (titleEl) {
          titleEl.textContent = isPublic ? (data.displayName || displayName) : roomCode;
        }
        roomTheme = data.theme || roomTheme;
        activeCount = data.activeCount || 0;
        memoryCount = data.memoryCount || 0;
        photoCount = data.photoCount || 0;
        queueCount = data.queueCount || 0;
        visitorCount = data.visitorCount || 0;
        visitCount = data.visitCount || 0;
        createdAt = data.createdAt || createdAt;
        lastActiveAt = data.lastActiveAt || lastActiveAt;
        if (data.currentTapeTitle) {
          tapeTitle = data.currentTapeTitle;
          tapeHost = data.currentHost || 'wanderer';
        }
      } else {
        if (titleEl) {
          titleEl.textContent = isPublic ? displayName : roomCode;
        }
      }

      if (themeEl) {
        themeEl.textContent = roomTheme;
      }

      if (statCreated) statCreated.textContent = new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
      if (statLastActive) statLastActive.textContent = formatTimeAgo(lastActiveAt);
      if (statActive) statActive.textContent = String(activeCount);
      if (statMemories) statMemories.textContent = String(memoryCount);
      if (statPhotos) statPhotos.textContent = String(photoCount);
      if (statQueue) statQueue.textContent = String(queueCount);
      if (statVisitors) statVisitors.textContent = String(visitorCount);
      if (statVisits) statVisits.textContent = String(visitCount);

      if (!(window as any).roomMetadataCache) {
          (window as any).roomMetadataCache = {};
      }
      (window as any).roomMetadataCache[roomCode] = {
        roomCode,
        displayName: titleEl ? titleEl.textContent : roomCode,
        theme: roomTheme,
        createdAt,
        lastActiveAt,
        activeCount,
        memoryCount,
        photoCount,
        queueCount,
        visitorCount,
        visitCount
      };

      if ((window as any).app?.environment) {
        try {
          (window as any).app.environment.updateRoomCards();
        } catch (_) {}
      }

      const soulObj = getRoomSoul({
        memoryCount,
        photoCount,
        visitorCount,
        visitCount,
        activeCount,
        createdAt,
        lastActiveAt
      });

      const profileSoulTitle = $('profile-soul-title');
      const profileSoulDesc = $('profile-soul-desc');
      const profileSoulContainer = $('profile-soul-container');
      if (profileSoulContainer && profileSoulTitle && profileSoulDesc) {
        profileSoulTitle.textContent = soulObj.label;
        profileSoulDesc.textContent = soulObj.description;
        profileSoulContainer.hidden = false;
      }

      if (tapeTitle && nowPlayingSection && tapeTitleEl && tapeHostEl) {
        nowPlayingSection.style.display = 'flex';
        tapeTitleEl.textContent = tapeTitle;
        tapeHostEl.textContent = `host: ${tapeHost}`;
      } else if (nowPlayingSection) {
        nowPlayingSection.style.display = 'none';
      }

      if (descEl) {
        if (ROOM_CONFIG[roomTheme]) {
          descEl.textContent = ROOM_CONFIG[roomTheme].desc;
        } else {
          descEl.textContent = 'a quiet and atmospheric custom corner.';
        }
      }

      const historyCol = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode, 'history');
      const historyQuery = query(historyCol, orderBy('createdAt', 'desc'), limit(5));
      
      const photosCol = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode, 'photos');
      const photosQuery = query(photosCol, orderBy('createdAt', 'desc'), limit(4));

      const [historySnap, photosSnap] = await Promise.all([
        getDocs(historyQuery).catch(() => null),
        getDocs(photosQuery).catch(() => null)
      ]);

      if (historyPreviewEl) {
        historyPreviewEl.innerHTML = '';
        if (historySnap && !historySnap.empty) {
          historySnap.forEach(d => {
            const h = d.data();
            const item = createSafeElement('div', 'history-preview-item');
            
            const text = createSafeElement('span', 'history-preview-text');
            text.style.display = 'inline-flex';
            text.style.alignItems = 'center';
            text.style.gap = '4px';
            
            const iconName = h.type === 'tape_played' ? 'vhs' :
                             h.type === 'note_pinned' ? 'pushpin' :
                             h.type === 'object_placed' ? 'object' :
                             h.type === 'host_changed' ? 'lantern' :
                             h.type === 'photo_added' ? 'polaroid' : 'room';
            text.appendChild(getIcon(iconName, { class: 'hc-icon-sm' }));
            
            const textNode = createSafeElement('span', '', ` ${h.text || ''}`);
            text.appendChild(textNode);
            const time = createSafeElement('span', 'history-preview-time', formatTimeAgo(h.createdAt || Date.now()));
            item.appendChild(text);
            item.appendChild(time);
            historyPreviewEl.appendChild(item);
          });
        } else {
          historyPreviewEl.innerHTML = '<div style="opacity:0.4; font-size:0.75rem; font-style:italic;">No history events logged yet.</div>';
        }
      }

      if (photosPreviewEl) {
        photosPreviewEl.innerHTML = '';
        if (photosSnap && !photosSnap.empty) {
          photosSnap.forEach(d => {
            const p = d.data();
            const mini = createSafeElement('div', 'profile-polaroid-mini');
            
            const img = document.createElement('img');
            img.src = p.url || '';
            img.alt = p.caption || 'Polaroid';
            
            const caption = createSafeElement('span', 'profile-polaroid-caption', p.caption || 'no caption');
            
            mini.appendChild(img);
            mini.appendChild(caption);
            photosPreviewEl.appendChild(mini);
          });
        } else {
          photosPreviewEl.innerHTML = '<div style="opacity:0.4; font-size:0.75rem; font-style:italic; grid-column:1/-1;">No photos left behind yet.</div>';
        }
      }

    } catch (err) {
      console.error('[ROOM_PROFILE] Error loading profile data:', err);
      if (descEl) descEl.textContent = 'Failed to load details for this corner.';
    }
  }

  renderFavorites(favorites: any[]) {
    const gridEl = $('favorites-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';
    if (!favorites || favorites.length === 0) {
      gridEl.textContent = '';
      const emptyDiv = createSafeElement('div');
      emptyDiv.style.cssText = "grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; opacity: 0.4;";
      emptyDiv.appendChild(getIcon('star', { class: 'hc-icon-lg', style: 'margin-bottom: 8px;' }));
      const textSpan = createSafeElement('span', '', 'No saved rooms yet. Save your favorite corners to list them here.');
      textSpan.style.cssText = "font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);";
      emptyDiv.appendChild(textSpan);
      gridEl.appendChild(emptyDiv);
      return;
    }

    const frag = document.createDocumentFragment();
    favorites.forEach(fav => {
      const card = createSafeElement('div', 'favorite-card');
      card.setAttribute('data-room-code', fav.roomCode);

      const title = createSafeElement('div', 'favorite-card-title', fav.displayName || fav.roomCode);
      card.appendChild(title);

      const theme = createSafeElement('div', 'favorite-card-theme', `theme: ${fav.theme}`);
      card.appendChild(theme);

      const stats = createSafeElement('div', 'favorite-card-meta');
      const activeStat = createSafeElement('span');
      activeStat.style.display = 'inline-flex';
      activeStat.style.alignItems = 'center';
      activeStat.style.gap = '4px';
      activeStat.appendChild(getIcon('user', { class: 'hc-icon-sm' }));
      activeStat.appendChild(document.createTextNode(` ${fav.activeCount || 0} active`));
      stats.appendChild(activeStat);
      
      if (fav.lastActiveAt) {
        const timeAgo = formatTimeAgo(fav.lastActiveAt);
        const lastActiveStat = createSafeElement('span', '', `active: ${timeAgo}`);
        lastActiveStat.style.opacity = '0.6';
        stats.appendChild(lastActiveStat);
      }
      card.appendChild(stats);

      if (!(window as any).roomMetadataCache) {
          (window as any).roomMetadataCache = {};
      }
      if (fav.createdAt || fav.memoryCount || fav.photoCount || fav.visitorCount || fav.visitCount) {
          (window as any).roomMetadataCache[fav.roomCode] = fav;
      }

      const soulObj = getRoomSoul(fav);
      const soulMeta = createSafeElement('div', 'room-card-soul', soulObj.shortDescription);
      card.appendChild(soulMeta);

      const joinBtn = createSafeElement('button', 'text-btn favorite-card-action', 'Enter room');
      joinBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop click from opening profile modal
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, { room: fav.roomCode, theme: fav.theme });
      });
      card.appendChild(joinBtn);

      card.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        this.openRoomProfile(fav.roomCode);
      });

      frag.appendChild(card);
    });

    gridEl.appendChild(frag);
  }

  openMyProfile() {
    const presence = (window as any).presence;
    if (!presence || !presence.profile) return;
    
    const modal = $('my-profile-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const aliasInput = $('edit-profile-alias') as HTMLInputElement;
    const bioInput = $('edit-profile-bio') as HTMLTextAreaElement;
    const themeSelect = $('select-favorite-theme') as HTMLSelectElement;
    const avatarEl = $('my-profile-avatar') as HTMLImageElement;
    const avatarPlaceholderEl = $('my-profile-avatar-placeholder');
    
    if (aliasInput) aliasInput.value = presence.profile.alias || '';
    if (bioInput) bioInput.value = presence.profile.bio || '';
    if (themeSelect) themeSelect.value = presence.profile.favoriteTheme || 'window-seat';
    
    if (presence.profile.avatarUrl) {
      if (avatarEl) {
        avatarEl.src = presence.profile.avatarUrl;
        avatarEl.style.display = 'block';
      }
      if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'none';
    } else {
      if (avatarEl) avatarEl.style.display = 'none';
      if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'flex';
    }
    
    const uploadBtn = $('btn-upload-avatar') as HTMLButtonElement;
    const fileInput = $('input-avatar-upload') as HTMLInputElement;
    if (uploadBtn && fileInput) {
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        
        try {
          uploadBtn.textContent = 'Uploading...';
          uploadBtn.disabled = true;
          
          const downloadUrl = await presence.uploadAvatar(file);
          
          presence.profile.avatarUrl = downloadUrl;
          if (avatarEl) {
            avatarEl.src = downloadUrl;
            avatarEl.style.display = 'block';
          }
          if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'none';
          
          uploadBtn.textContent = 'Upload Photo';
          uploadBtn.disabled = false;
        } catch (err: any) {
          console.error('[MY_PROFILE] Avatar upload failed:', err);
          alert(err.message || 'Avatar upload failed.');
          uploadBtn.textContent = 'Upload Photo';
          uploadBtn.disabled = false;
        }
      };
    }
    
    const saveBtn = $('btn-save-my-profile') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.onclick = async () => {
        try {
          saveBtn.textContent = 'Saving...';
          saveBtn.disabled = true;
          
          const alias = aliasInput.value.trim();
          const bio = bioInput.value.trim();
          const favoriteTheme = themeSelect.value;
          const avatarUrl = presence.profile.avatarUrl;
          
          if (!alias) throw new Error('Alias cannot be empty');
          
          await presence.saveProfile({
            alias,
            bio,
            favoriteTheme,
            avatarUrl
          });
          
          modal.style.display = 'none';
          saveBtn.textContent = 'Save Changes';
          saveBtn.disabled = false;
        } catch (err: any) {
          console.error('[MY_PROFILE] Save profile failed:', err);
          alert(err.message || 'Save profile failed.');
          saveBtn.textContent = 'Save Changes';
          saveBtn.disabled = false;
        }
      };
    }
  }

  async openPublicProfile(uid: string) {
    if (!db) return;
    devLog('[PUBLIC_PROFILE] Opening public profile for:', uid);
    
    const modal = $('public-profile-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const avatarEl = $('public-profile-avatar') as HTMLImageElement;
    const avatarPlaceholderEl = $('public-profile-avatar-placeholder');
    const titleEl = $('public-profile-title');
    const themeEl = $('public-profile-theme');
    const bioEl = $('public-profile-bio');
    
    const statJoined = $('public-profile-stat-joined');
    const statVisited = $('public-profile-stat-visited');
    const statFavorited = $('public-profile-stat-favorited');
    const statMemories = $('public-profile-stat-memories');
    const statPhotos = $('public-profile-stat-photos');
    
    if (avatarEl) avatarEl.style.display = 'none';
    if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'flex';
    if (titleEl) titleEl.textContent = 'Loading...';
    if (themeEl) {
      themeEl.textContent = 'loading...';
      themeEl.className = 'badge-theme';
    }
    if (bioEl) bioEl.textContent = 'Looking for records of this wanderer...';
    if (statJoined) statJoined.textContent = '-';
    if (statVisited) statVisited.textContent = '-';
    if (statFavorited) statFavorited.textContent = '-';
    if (statMemories) statMemories.textContent = '-';
    if (statPhotos) statPhotos.textContent = '-';
    
    try {
      const presence = (window as any).presence;
      const appId = presence ? presence.appId : 'default-app-id';
      const ref = doc(db, 'artifacts', appId, 'users', uid, 'userData', 'profile');
      const snap = await getDoc(ref);
      
      if (snap && snap.exists()) {
        const data = snap.data();
        
        const profileAlias = (data.alias && String(data.alias).trim() !== '' && String(data.alias).trim() !== 'undefined') ? data.alias : 'wanderer';
        if (titleEl) titleEl.textContent = profileAlias;
        if (themeEl) {
          themeEl.textContent = data.favoriteTheme || 'window-seat';
        }
        if (bioEl) {
          bioEl.textContent = data.bio || 'A quiet soul with no bio.';
        }
        
        if (data.avatarUrl) {
          if (avatarEl) {
            avatarEl.src = data.avatarUrl;
            avatarEl.style.display = 'block';
          }
          if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'none';
        } else {
          if (avatarEl) avatarEl.style.display = 'none';
          if (avatarPlaceholderEl) avatarPlaceholderEl.style.display = 'flex';
        }
        
        if (statJoined) {
          statJoined.textContent = new Date(data.joinedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
        }
        if (statVisited) statVisited.textContent = String(data.roomsVisited || 0);
        if (statFavorited) statFavorited.textContent = String(data.roomsFavorited || 0);
        if (statMemories) statMemories.textContent = String(data.memoriesCreated || 0);
        if (statPhotos) statPhotos.textContent = String(data.photosUploaded || 0);
      } else {
        if (titleEl) titleEl.textContent = 'Wanderer';
        if (bioEl) bioEl.textContent = 'No profile records found for this wanderer.';
      }
    } catch (err) {
      console.error('[PUBLIC_PROFILE] Error loading public profile data:', err);
      if (titleEl) titleEl.textContent = 'Error';
      if (bioEl) bioEl.textContent = 'Could not retrieve profile record.';
    }
  }

  clearTransientRoomUI() {
    this.notes = [];
    this.renderWall();
    
    this.objects = [];
    this.renderObjects();
    
    this.queue = [];
    this.renderQueue();
    
    this.history = [];
    this.renderHistory();
    
    this.memories = [];
    this.renderMemories();
    this.renderWhispers();
    
    this.photos = [];
    this.renderPhotos();
    
    if (this.elements.spotifyInput) (this.elements.spotifyInput as HTMLInputElement).value = '';
    if (this.elements.youtubeInput) (this.elements.youtubeInput as HTMLInputElement).value = '';
    
    const movieInput = $<HTMLInputElement>('local-movie-input');
    if (movieInput) movieInput.value = '';
    
    const photoFileInput = $<HTMLInputElement>('photo-file-input');
    if (photoFileInput) photoFileInput.value = '';
    
    const photoCaptionInput = $<HTMLInputElement>('photo-caption-input');
    if (photoCaptionInput) photoCaptionInput.value = '';
    
    const selectedPhotoName = $('selected-photo-name');
    if (selectedPhotoName) selectedPhotoName.textContent = 'no file chosen';
    
    const photoUploadError = $('photo-upload-error');
    if (photoUploadError) photoUploadError.style.display = 'none';

    const profileNowPlaying = $('profile-now-playing-section');
    if (profileNowPlaying) profileNowPlaying.style.display = 'none';
    
    this.currentMetadata = null;
    this.renderEchoes();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
