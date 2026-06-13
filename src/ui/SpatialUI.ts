import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { Note, MemoryObject, QueueItem, RoomHistoryEvent, RoomMemory, RoomPhoto, RoomDirectoryItem } from '../types';
import { $, $$, createSafeElement } from '../utils/dom';
import { devLog } from '../utils/logger';
import { uploadPhoto } from '../services/Presence';

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
          console.log('[DEBUG_SPATIAL_UI] Received REMOTE_NOTES_UPDATED, count =', notes.length);
          this.notes = Array.isArray(notes) ? notes : [];
          this.renderWall();
      });
      this.bus.on(APP_EVENTS.REMOTE_OBJECTS_UPDATED, (objects: MemoryObject[]) => {
          console.log('[DEBUG_SPATIAL_UI] Received REMOTE_OBJECTS_UPDATED, count =', objects.length);
          this.objects = Array.isArray(objects) ? objects : [];
          this.renderObjects();
      });
      this.bus.on(APP_EVENTS.SYNC_QUEUE, (queue: QueueItem[]) => {
          console.log('[DEBUG_SPATIAL_UI] Received sync:queue, count =', queue.length);
          this.queue = Array.isArray(queue) ? queue : [];
          this.renderQueue();
      });
      this.bus.on(APP_EVENTS.REMOTE_MEDIA_UPDATED, () => {
          this.renderQueue();
      });
      this.bus.on(APP_EVENTS.SYNC_HISTORY, (history: RoomHistoryEvent[]) => {
          console.log('[DEBUG_SPATIAL_UI] Received sync:history, count =', history.length);
          this.history = Array.isArray(history) ? history : [];
          this.renderHistory();
      });
      this.bus.on(APP_EVENTS.SYNC_MEMORIES, (memories: RoomMemory[]) => {
          console.log('[DEBUG_SPATIAL_UI] Received sync:memories, count =', memories.length);
          this.memories = Array.isArray(memories) ? memories : [];
          this.renderMemories();
      });
      this.bus.on(APP_EVENTS.SYNC_PHOTOS, (photos: RoomPhoto[]) => {
          console.log('[DEBUG_SPATIAL_UI] Received sync:photos, count =', photos.length);
          this.photos = Array.isArray(photos) ? photos : [];
          this.renderPhotos();
          this.renderMemories(); // Refresh memories because photos are merged
      });
      this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
          if (!data.isPrivate) {
              const activeTabBtn = $('.explore-tab.active');
              const activeTab = activeTabBtn ? activeTabBtn.getAttribute('data-explore-tab') || 'active' : 'active';
              this.loadAndRenderExploreRooms(activeTab);
          }
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

    $$('.table-obj-btn').forEach(btn => {
      if (btn.dataset.obj) {
          btn.addEventListener('click', (e: MouseEvent) => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
            const objType = (e.currentTarget as HTMLElement).dataset.obj;
            if (!objType) return;
            const emojis: Record<string, string> = { 'coffee': '☕', 'book': '📖', 'polaroid': '🎞️', 'lamp': '🕯️' };
            const labels: Record<string, string> = { 'coffee': 'warm coffee', 'book': 'open book', 'polaroid': 'forgotten polaroid', 'lamp': 'glowing lamp' };
            const obj: MemoryObject = { emoji: emojis[objType], label: labels[objType], author: 'wanderer', id: Date.now() };
            devLog('[OBJECT_PLACED_EMIT]', obj);
            this.bus.emit(APP_EVENTS.OBJECT_PLACED, obj);
          });
      }
    });

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
    console.log('[DEBUG_EXPLORE] loadAndRenderExploreRooms called with tab:', tab);
    const gridEl = $('explore-grid');
    if (!gridEl) {
        console.log('[DEBUG_EXPLORE] explore-grid element not found!');
        return;
    }

    gridEl.style.opacity = '0.5';

    const presence = (window as any).presence;
    if (!presence) {
        console.log('[DEBUG_EXPLORE] window.presence not found!');
        return;
    }

    try {
        console.log('[DEBUG_EXPLORE] Calling loadExploreRooms...');
        const rooms = await presence.loadExploreRooms(tab);
        console.log('[DEBUG_EXPLORE] loadExploreRooms returned rooms:', JSON.stringify(rooms));
        gridEl.innerHTML = '';
        
        if (!rooms || rooms.length === 0) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; text-align: center; opacity: 0.4;">
                    <span style="font-size: 1.8rem; margin-bottom: 8px;">🌌</span>
                    <span style="font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);">no active rooms found under this filter...</span>
                </div>
            `;
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
            
            const activeStat = createSafeElement('span', 'explore-stat-item', `👤 ${room.activeCount || 0} active`);
            stats.appendChild(activeStat);

            const memoryStat = createSafeElement('span', 'explore-stat-item', `📌 ${room.memoryCount || 0} memories`);
            stats.appendChild(memoryStat);

            const photoStat = createSafeElement('span', 'explore-stat-item', `📸 ${room.photoCount || 0} photos`);
            stats.appendChild(photoStat);

            card.appendChild(stats);

            if (room.currentTapeTitle) {
                const playing = createSafeElement('div', 'explore-card-playing', `📼 playing: ${room.currentTapeTitle}`);
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

            const joinBtn = createSafeElement('button', 'text-btn explore-card-action', 'Enter room');
            joinBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
                this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, { room: room.roomCode, theme: room.theme });
            });
            card.appendChild(joinBtn);

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
    console.log('[DEBUG_SPATIAL_UI] renderWall called, notes count =', this.notes.length);
    const wall = this.elements.wall;
    if(!wall) {
        console.log('[DEBUG_SPATIAL_UI] renderWall complete (no wall element)');
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

      const pinBtn = createSafeElement('button', 'text-btn', '📌 pin');
      pinBtn.style.marginLeft = '12px';
      pinBtn.style.padding = '0';
      pinBtn.style.fontSize = '0.75rem';
      pinBtn.style.opacity = '0.4';
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
    console.log('[DEBUG_SPATIAL_UI] renderWall complete, DOM nodes count =', wall.childNodes.length);
  }

  renderObjects() {
    console.log('[DEBUG_SPATIAL_UI] renderObjects called, objects count =', this.objects.length);
    const table = this.elements.table;
    if(!table) {
        console.log('[DEBUG_SPATIAL_UI] renderObjects complete (no table element)');
        return;
    }
    table.innerHTML = ''; 
    const now = Date.now();
    const frag = document.createDocumentFragment();
    this.objects.forEach(o => {
      const div = createSafeElement('div', 'memory-object');
      const ageHours = (now - o.id) / 3600000;
      if(ageHours > 48) div.style.opacity = '0.1';
      const emSpan = createSafeElement('span', 'emoji', o.emoji);
      const lblSpan = createSafeElement('span', '', o.label);
      const hstSpan = createSafeElement('span', 'memory-host', o.author);
      div.appendChild(emSpan); div.appendChild(lblSpan); div.appendChild(hstSpan);

      const pinBtn = createSafeElement('button', 'text-btn', '📌 pin');
      pinBtn.style.marginLeft = '8px';
      pinBtn.style.padding = '0';
      pinBtn.style.fontSize = '0.7rem';
      pinBtn.style.opacity = '0.4';
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
    console.log('[DEBUG_SPATIAL_UI] renderObjects complete, DOM nodes count =', table.childNodes.length);
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
        if (isHost) {
            controlMessage.innerHTML = '✨ <span>you are the host. you can play queued tapes and skip playing media.</span>';
            controlMessage.style.color = '#4ade80';
            controlMessage.style.opacity = '0.7';
        } else {
            controlMessage.innerHTML = '🔒 <span>only the host can control tape playback and advance the queue.</span>';
            controlMessage.style.color = 'var(--text-muted)';
            controlMessage.style.opacity = '0.4';
        }
        controlMessage.style.display = 'block';
    }

    if (this.queue.length === 0) {
        listEl.innerHTML = '<div style="opacity: 0.4; font-style: italic; font-size: 0.8rem; padding: 16px 0; text-align: center;">📼 no tapes queued. drag & drop a file or click above to queue a tape...</div>';
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
            const tapePinBtn = createSafeElement('button', 'text-btn', '📌 pin');
            tapePinBtn.style.padding = '0';
            tapePinBtn.style.fontSize = '0.7rem';
            tapePinBtn.style.opacity = '0.5';
            tapePinBtn.style.margin = '0 0 0 10px';
            tapePinBtn.style.display = 'inline-block';
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
        listEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; opacity: 0.4;">
                <span style="font-size: 1.8rem; margin-bottom: 8px;">⏳</span>
                <span style="font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);">The air is still. No whispers have been left behind recently...</span>
            </div>
        `;
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
        
        let typeSymbol = '';
        if (item.type === 'tape_played') typeSymbol = '📼';
        else if (item.type === 'note_pinned') typeSymbol = '📌';
        else if (item.type === 'object_placed') typeSymbol = '🧸';
        else if (item.type === 'host_changed') typeSymbol = '👑';
        else if (item.type === 'room_created') typeSymbol = '🚪';

        const textSpan = createSafeElement('span', '', `${typeSymbol} ${item.text}`);
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

  renderMemories() {
    const listEl = $('room-memories-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    // Combine memories and photos as first-class room memories
    const combined: any[] = [
      ...this.memories.map(m => ({ ...m, isPhoto: false })),
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
        listEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; opacity: 0.4;">
                <span style="font-size: 1.8rem; margin-bottom: 8px;">📌</span>
                <span style="font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);">This room's walls are bare. Pin a note, object, tape, or photo to build its memory...</span>
            </div>
        `;
        return;
    }

    const frag = document.createDocumentFragment();
    combined.forEach(item => {
        const itemDiv = createSafeElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.padding = '10px 14px';
        itemDiv.style.borderRadius = '6px';
        itemDiv.style.marginBottom = '8px';
        itemDiv.style.transition = 'all 0.3s ease';

        let typeSymbol = '';
        let leftBorderColor = '';
        let rowBg = '';

        if (item.type === 'tape') {
            typeSymbol = '📼';
            leftBorderColor = 'rgba(235, 94, 85, 0.6)'; // accent/rose
            rowBg = 'rgba(235, 94, 85, 0.02)';
        } else if (item.type === 'note') {
            typeSymbol = '📌';
            leftBorderColor = 'rgba(244, 211, 94, 0.6)'; // warm yellow
            rowBg = 'rgba(244, 211, 94, 0.02)';
        } else if (item.type === 'object') {
            typeSymbol = '🧸';
            leftBorderColor = 'rgba(74, 222, 128, 0.6)'; // green
            rowBg = 'rgba(74, 222, 128, 0.02)';
        } else if (item.type === 'photo') {
            typeSymbol = '📸';
            leftBorderColor = 'rgba(168, 85, 247, 0.6)'; // purple
            rowBg = 'rgba(168, 85, 247, 0.02)';
        } else {
            typeSymbol = '⏳';
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

        const titleSpan = createSafeElement('span', '', `${typeSymbol} ${item.title}`);
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
        actionsDiv.appendChild(restoreBtn);

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

  renderPhotos() {
    const gridEl = $('photo-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const presence = (window as any).presence;
    if (!presence) return;

    if (this.photos.length === 0) {
        gridEl.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; text-align: center; opacity: 0.4;">
                <span style="font-size: 2rem; margin-bottom: 8px;">📷</span>
                <span style="font-size: 0.8rem; font-style: italic; font-family: var(--font-ui);">No photographs pinned here yet...</span>
            </div>
        `;
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
}
