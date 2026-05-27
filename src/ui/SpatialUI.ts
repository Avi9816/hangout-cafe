import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { Note, MemoryObject, QueueItem, RoomHistoryEvent, RoomMemory } from '../types';
import { $, $$, createSafeElement } from '../utils/dom';
import { devLog } from '../utils/logger';

export class SpatialUI {
  private bus: EventBus;
  
  notes: Note[] = [];
  objects: MemoryObject[] = [];
  queue: QueueItem[] = [];
  history: RoomHistoryEvent[] = [];
  memories: RoomMemory[] = [];
  
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

    if (this.queue.length === 0) {
        listEl.innerHTML = '<div style="opacity: 0.5; font-style: italic; font-size: 0.8rem;">queue is empty...</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    this.queue.forEach(item => {
        const itemDiv = createSafeElement('div', 'queue-item');
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.padding = '8px 12px';
        itemDiv.style.background = 'rgba(255,255,255,0.02)';
        itemDiv.style.border = '1px solid rgba(255,255,255,0.04)';
        itemDiv.style.borderRadius = '4px';

        const infoDiv = createSafeElement('div');
        
        let statusSymbol = '';
        if (item.status === 'playing') statusSymbol = '▶';
        else if (item.status === 'pending') statusSymbol = '⏳';
        else if (item.status === 'completed') statusSymbol = '✓';

        const titleSpan = createSafeElement('span', '', `${statusSymbol} ${item.title} `);
        titleSpan.style.fontWeight = item.status === 'playing' ? 'bold' : 'normal';
        if (item.status === 'playing') titleSpan.style.color = 'var(--accent)';
        
        const metaSpan = createSafeElement('span', '', `(added by ${item.addedBy})`);
        metaSpan.style.fontSize = '0.75rem';
        metaSpan.style.opacity = '0.5';
        metaSpan.style.marginLeft = '8px';

        infoDiv.appendChild(titleSpan);
        infoDiv.appendChild(metaSpan);

        if (item.status === 'playing') {
            const tapePinBtn = createSafeElement('button', 'text-btn', '📌 pin');
            tapePinBtn.style.marginLeft = '12px';
            tapePinBtn.style.padding = '0';
            tapePinBtn.style.fontSize = '0.75rem';
            tapePinBtn.style.opacity = '0.4';
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
            infoDiv.appendChild(tapePinBtn);
        }

        itemDiv.appendChild(infoDiv);

        // Control buttons for host
        if (isHost && item.status === 'pending') {
            const startBtn = createSafeElement('button', 'text-btn', 'play now');
            startBtn.style.padding = '4px 8px';
            startBtn.style.fontSize = '0.75rem';
            startBtn.style.margin = '0';
            startBtn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
                presence.startQueuedMedia(item.id);
            });
            itemDiv.appendChild(startBtn);
        } else {
            const statusLabel = createSafeElement('span', '', item.status);
            statusLabel.style.fontSize = '0.75rem';
            statusLabel.style.opacity = '0.5';
            itemDiv.appendChild(statusLabel);
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
        listEl.innerHTML = '<div style="opacity: 0.5; font-style: italic; font-size: 0.8rem;">no recent activity...</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    this.history.forEach(item => {
        const itemDiv = createSafeElement('div');
        itemDiv.style.fontSize = '0.8rem';
        itemDiv.style.opacity = '0.7';
        itemDiv.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
        itemDiv.style.padding = '4px 0';
        
        let typeSymbol = '';
        if (item.type === 'tape_played') typeSymbol = '📼';
        else if (item.type === 'note_pinned') typeSymbol = '📌';
        else if (item.type === 'object_placed') typeSymbol = '🧸';
        else if (item.type === 'host_changed') typeSymbol = '👑';
        else if (item.type === 'room_created') typeSymbol = '🚪';

        const timeString = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const txtSpan = createSafeElement('span', '', `${typeSymbol} [${timeString}] ${item.text}`);
        itemDiv.appendChild(txtSpan);
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
            lastTapeDiv.textContent = `Last tape played: ${cleanText}`;
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

    if (this.memories.length === 0) {
        listEl.innerHTML = '<div style="opacity: 0.5; font-style: italic; font-size: 0.8rem;">no memories pinned...</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    this.memories.forEach(item => {
        const itemDiv = createSafeElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.justifyContent = 'space-between';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.padding = '8px 12px';
        itemDiv.style.background = 'rgba(255,255,255,0.02)';
        itemDiv.style.border = '1px solid rgba(255,255,255,0.04)';
        itemDiv.style.borderRadius = '4px';

        const infoDiv = createSafeElement('div');
        
        let typeSymbol = '';
        if (item.type === 'tape') typeSymbol = '📼';
        else if (item.type === 'note') typeSymbol = '📌';
        else if (item.type === 'object') typeSymbol = '🧸';
        else if (item.type === 'moment') typeSymbol = '⏳';

        const titleSpan = createSafeElement('span', '', `${typeSymbol} ${item.title}`);
        titleSpan.style.fontWeight = '500';
        
        const descSpan = createSafeElement('span', '', ` — ${item.description || ''}`);
        descSpan.style.fontSize = '0.75rem';
        descSpan.style.opacity = '0.6';

        const creatorSpan = createSafeElement('span', '', ` (pinned by ${item.createdBy})`);
        creatorSpan.style.fontSize = '0.7rem';
        creatorSpan.style.opacity = '0.4';
        creatorSpan.style.marginLeft = '6px';

        infoDiv.appendChild(titleSpan);
        infoDiv.appendChild(descSpan);
        infoDiv.appendChild(creatorSpan);
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
                presence.removeMemory(item.id);
            });
            actionsDiv.appendChild(deleteBtn);
        }

        itemDiv.appendChild(actionsDiv);
        frag.appendChild(itemDiv);
    });
    listEl.appendChild(frag);
  }
}
