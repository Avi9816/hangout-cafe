import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { $, $$, createSafeElement } from '../utils/dom';
import { debounce } from '../utils/timing';
import { ROOM_CONFIG } from '../constants/app';
import { devLog } from '../utils/logger';

export class Environment {
  private bus: EventBus;
  private currentRoom: string | null = null;
  private isPrivate = false;
  
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private particles: any[] = [];
  private stars: any[] = [];

  private elements: Record<string, HTMLElement | null>;

  private activeUserCount = 1;
  private roomEmotionalWeight = 0; 
  private isNightShift = false;
  private lifecycle = new LifecycleManager();
  private isMobile = window.innerWidth <= 600;
  private lightningTimeout?: number;
  private stationTimeout?: number;
  
  private themes = ROOM_CONFIG;

  constructor(bus: EventBus) {
    this.bus = bus;
    
    this.canvas = $<HTMLCanvasElement>('particles-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.elements = {
        timeDisplay: $('time-display'),
        doorway: $('doorway-section'),
        table: $('table-section'),
        localMovie: $('local-movie-section'),
        inviteBtn: $('btn-invite'),
        leaveBtn: $('btn-leave-private'),
        roomTitle: $('room-title'),
        roomDesc: $('room-desc'),
        privateInput: $<HTMLInputElement>('private-room-input'),
        lightning: $('lightning-overlay'),
        stationLight: $('station-light-overlay')
    };

    this.initSilhouettes();
    this.setupRoomListeners();
    this.setupBusListeners();
    this.initCanvas();
    this.initStars();
  }

  private setupBusListeners() {
      this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
          devLog('[ROOM_CHANGED_RECEIVED]', data);
          if (data.isPrivate) this.enterPrivateCorner(data.room);
          else this.changePublicRoom(data.room);
      });

      this.bus.on(APP_EVENTS.USER_COUNT_UPDATED, (count: number) => {
          this.activeUserCount = count;
          this.renderWeather();
          this.updateRoomCards();
      });

      this.bus.on(APP_EVENTS.REMOTE_NOTES_UPDATED, (notes: any[]) => {
          this.roomEmotionalWeight = notes.length; 
          this.renderWeather();
      });

      this.bus.on(APP_EVENTS.TIME_TICK, (data: { timestamp: number }) => {
          this.updateSky(new Date(data.timestamp));
      });
  }

  private initStars() {
      for(let i=0; i<100; i++) {
          this.stars.push({
              x: Math.random() * 2000, y: Math.random() * 2000,
              size: Math.random() * 2, opacity: Math.random()
          });
      }
  }

  initCanvas() {
    if (!this.canvas) return;
    const resize = () => {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.renderWeather();
    };
    window.addEventListener('resize', debounce(resize, 200));
    resize();
    this.canvasLoop();
  }

  canvasLoop() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const now = Date.now();

    // Starfield for Northern Lights
    if (this.currentRoom === 'northern-lights') {
        this.stars.forEach(s => {
            this.ctx!.fillStyle = `rgba(255,255,255,${s.opacity * (0.3 + Math.sin(now/1000) * 0.2)})`;
            this.ctx!.beginPath(); this.ctx!.arc(s.x % this.canvas!.width, s.y % this.canvas!.height, s.size, 0, Math.PI * 2); this.ctx!.fill();
        });
    }

    this.particles.forEach(p => {
        p.y += p.speed;
        if (p.type === 'snow' || p.type === 'motes' || p.type === 'aurora') {
            p.x += Math.sin(now / 1000 + p.seed) * (p.type === 'aurora' ? 1.5 : 0.5);
        }
        
        if (p.y > this.canvas!.height + 100) p.y = -100;
        if (p.x > this.canvas!.width + 100) p.x = -100;
        if (p.x < -100) p.x = this.canvas!.width + 100;

        this.ctx!.globalAlpha = p.opacity;
        
        if (p.type === 'rain') {
            const grad = this.ctx!.createLinearGradient(p.x, p.y, p.x, p.y + p.length);
            grad.addColorStop(0, 'transparent'); grad.addColorStop(1, p.color);
            this.ctx!.strokeStyle = grad; this.ctx!.lineWidth = 1;
            this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y); this.ctx!.lineTo(p.x, p.y + p.length); this.ctx!.stroke();
        } else if (p.type === 'streaks') {
            const grad = this.ctx!.createLinearGradient(p.x, p.y, p.x + p.length, p.y);
            grad.addColorStop(0, 'transparent'); grad.addColorStop(1, p.color);
            this.ctx!.strokeStyle = grad; this.ctx!.lineWidth = 2;
            this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y); this.ctx!.lineTo(p.x + p.length, p.y); this.ctx!.stroke();
            p.x -= p.speed * 2; 
        } else if (p.type === 'aurora') {
            this.ctx!.fillStyle = p.color;
            this.ctx!.shadowBlur = 40; this.ctx!.shadowColor = p.color;
            this.ctx!.beginPath(); this.ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2); this.ctx!.fill();
            this.ctx!.shadowBlur = 0;
        } else {
            this.ctx!.fillStyle = p.color;
            this.ctx!.beginPath(); this.ctx!.arc(p.x, p.y, p.size || 1, 0, Math.PI * 2); this.ctx!.fill();
        }
    });

    requestAnimationFrame(() => this.canvasLoop());
  }

  private updateSky(now: Date) {
    const hour = now.getHours();
    if(this.elements.timeDisplay) {
        this.elements.timeDisplay.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    this.isNightShift = (hour >= 2 && hour < 5);
    document.body.classList.toggle('night-shift', this.isNightShift);

    if(!this.isPrivate && !this.isNightShift && this.currentRoom) {
        const theme = this.themes[this.currentRoom];
        if(theme) { 
            let t = theme.top; let b = theme.bot;
            if (hour >= 5 && hour < 7) { t = '#12122a'; b = '#1f1f3a'; } 
            document.documentElement.style.setProperty('--sky-top', t); 
            document.documentElement.style.setProperty('--sky-bottom', b); 
            document.documentElement.style.setProperty('--accent', theme.accent);
        }
    }
  }

  initSilhouettes() {
    const city = $('distant-city');
    if(!city) return;
    const frag = document.createDocumentFragment();
    for(let i=0; i<12; i++) {
      const win = createSafeElement('div', 'distant-window');
      win.style.left = `${Math.random() * 100}%`; win.style.top = `${20 + Math.random() * 60}%`;
      win.style.animationDelay = `-${Math.random() * 15}s`;
      frag.appendChild(win);
    }
    city.appendChild(frag);
  }

  setupRoomListeners() {
    const container = $('destinations');
    if (container) {
        container.innerHTML = '';
        Object.entries(this.themes).forEach(([key, theme]) => {
            const btn = createSafeElement('button', 'dest-btn');
            btn.dataset.room = key;
            const name = createSafeElement('span', 'room-card-name', theme.name);
            const desc = createSafeElement('span', 'room-card-desc', theme.desc);
            const meta = createSafeElement('span', 'room-card-meta', '0 souls resting');
            meta.id = `meta-${key}`;
            btn.appendChild(name); btn.appendChild(desc); btn.appendChild(meta);
            btn.addEventListener('mouseenter', () => this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click'));
            btn.addEventListener('click', () => {
                this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
                devLog('[ROOM_JOIN_REQUEST_EMIT] public:', key);
                this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, key);
            });
            container.appendChild(btn);
        });
    }
    
    // Static element listeners
    const btnCreate = $('btn-create-private');
    const input = $('private-room-input') as HTMLInputElement;
    let selectedPrivateTheme = 'window-seat';

    $$('[data-private-theme]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
            selectedPrivateTheme = (e.currentTarget as HTMLElement).dataset.privateTheme || 'window-seat';
            devLog('[THEME_SELECTED]', selectedPrivateTheme);
            $$('[data-private-theme]').forEach(b => b.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
        });
    });

    const triggerJoin = () => {
        devLog('[JOIN_CLICK]');
        const roomName = input?.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if(roomName) {
            this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
            devLog('[ROOM_JOIN_REQUEST_EMIT] private:', { room: roomName, theme: selectedPrivateTheme });
            this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, { room: roomName, theme: selectedPrivateTheme });
        }
    };

    btnCreate?.addEventListener('click', triggerJoin);
    input?.addEventListener('keydown', (e: any) => { if(e.key === 'Enter') triggerJoin(); });
    
    this.elements.leaveBtn?.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'wood_creak');
        devLog('[ROOM_JOIN_REQUEST_EMIT] leave private:', 'window-seat');
        this.bus.emit(APP_EVENTS.ROOM_JOIN_REQUEST, 'window-seat');
    });
  }

  private updateRoomCards() {
      $$('.dest-btn').forEach(btn => {
          const key = btn.dataset.room;
          if (key === this.currentRoom && !this.isPrivate) btn.classList.add('active');
          else btn.classList.remove('active');
          const meta = btn.querySelector('.room-card-meta');
          if (meta && key === this.currentRoom) meta.textContent = `${this.activeUserCount} souls resting`;
      });
  }

  private _toggleUIVisibility(isPrivate: boolean) {
    document.body.classList.toggle('is-private-room', isPrivate);
    if(this.elements.doorway) this.elements.doorway.style.display = isPrivate ? 'none' : 'block';
    if(this.elements.table) this.elements.table.style.display = isPrivate ? 'block' : 'none';
    if(this.elements.localMovie) this.elements.localMovie.style.display = isPrivate ? 'block' : 'none';
    if(this.elements.inviteBtn) this.elements.inviteBtn.style.display = isPrivate ? 'inline-block' : 'none';
    if(this.elements.leaveBtn) this.elements.leaveBtn.style.display = isPrivate ? 'inline-block' : 'none';
  }

  private changePublicRoom(roomKey: string) {
    const theme = this.themes[roomKey];
    if(!theme) return;
    this.currentRoom = roomKey; this.isPrivate = false;
    this._toggleUIVisibility(false);
    this.updateRoomCards();
    if(this.elements.roomTitle) this.elements.roomTitle.textContent = theme.name; 
    if(this.elements.roomDesc) this.elements.roomDesc.textContent = theme.desc;
    document.documentElement.style.setProperty('--sky-top', theme.top); 
    document.documentElement.style.setProperty('--sky-bottom', theme.bot); 
    document.documentElement.style.setProperty('--accent', theme.accent);
    this.renderWeather(); 
    this.stationLoop(roomKey === 'last-train');
  }

  private enterPrivateCorner(cornerName: string) {
    this.currentRoom = cornerName; this.isPrivate = true;
    this._toggleUIVisibility(true);
    if(this.elements.roomTitle) this.elements.roomTitle.textContent = cornerName.replace(/-/g, ' ');
    if(this.elements.roomDesc) this.elements.roomDesc.textContent = "a hidden space, shared only with those you invite.";
    document.documentElement.style.setProperty('--sky-top', '#100508'); 
    document.documentElement.style.setProperty('--sky-bottom', '#1a080c'); 
    document.documentElement.style.setProperty('--accent', '#e53e3e');
    this.renderWeather(); 
    this.stationLoop(false);
  }

  renderWeather() {
    if (!this.canvas || !this.currentRoom) return;
    this.particles = [];
    const theme = this.themes[this.currentRoom] || { weather: 'rain' };
    let w = this.isPrivate ? 'rain' : theme.weather;
    let intensityMultiplier = 1;
    if (this.activeUserCount > 3) intensityMultiplier += 0.5;
    if (this.roomEmotionalWeight > 15) intensityMultiplier += 0.5; 
    const count = Math.floor((this.isMobile ? 30 : 100) * intensityMultiplier);

    for(let i=0; i<count; i++) {
        if (w === 'rain') {
            this.particles.push({ type: 'rain', x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, length: 40 + Math.random() * 40, speed: 15 + Math.random() * 10, opacity: 0.25, color: 'rgba(100,220,255,0.4)' });
        } else if (w === 'streaks') {
            this.particles.push({ type: 'streaks', x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, length: 150 + Math.random() * 300, speed: 30 + Math.random() * 20, opacity: 0.15, color: 'rgba(255,255,220,0.3)' });
        } else if (w === 'motes') {
            this.particles.push({ type: 'motes', x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, size: 1.5 + Math.random() * 2, speed: 0.3 + Math.random() * 0.4, opacity: 0.4, seed: Math.random() * 10, color: 'rgba(255,220,180,0.5)' });
        } else if (w === 'aurora') {
            this.particles.push({ type: 'aurora', x: Math.random() * this.canvas.width, y: Math.random() * (this.canvas.height * 0.6), size: 50 + Math.random() * 70, speed: 0.1 + Math.random() * 0.1, opacity: 0.08, seed: Math.random() * 20, color: i % 2 === 0 ? '#48bb78' : '#9f7aea' });
        }
    }
    this.lightningLoop(w === 'rain' && this.roomEmotionalWeight > 5);
  }

  private lightningLoop(enabled: boolean) {
    if(this.lightningTimeout) clearTimeout(this.lightningTimeout);
    if(!enabled) return;
    const loop = () => {
      const flash = this.elements.lightning;
      if(flash && Math.random() > 0.8) {
          flash.style.opacity = '0.2';
          this.lifecycle.setTimeout(() => flash.style.opacity = '0', 150); 
          this.lifecycle.setTimeout(() => { flash.style.opacity = '0.05'; this.lifecycle.setTimeout(()=>flash.style.opacity = '0', 100); }, 300);
      }
      this.lightningTimeout = this.lifecycle.setTimeout(loop, 10000 + Math.random() * 20000) as unknown as number;
    };
    loop();
  }

  private stationLoop(enabled: boolean) {
      if(this.stationTimeout) clearTimeout(this.stationTimeout);
      if(!enabled) return;
      const loop = () => {
          const light = this.elements.stationLight;
          if (light) {
              light.style.opacity = '1';
              this.lifecycle.setTimeout(() => light.style.opacity = '0', 1500);
          }
          this.stationTimeout = this.lifecycle.setTimeout(loop, 4000 + Math.random() * 6000) as unknown as number;
      };
      loop();
  }
}
