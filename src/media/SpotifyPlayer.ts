import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { $ } from '../utils/dom';
import { isPublicSpace } from '../config/spaceCapabilities';

export class SpotifyPlayer {
  private bus: EventBus;
  private container = $('spotify-container');
  private hostEl = $('spotify-host');

  constructor(bus: EventBus) {
    this.bus = bus;
    this.setupBusListeners();
  }

  private setupBusListeners() {
    this.bus.on(APP_EVENTS.REMOTE_MEDIA_UPDATED, (data: any) => {
        const presence = (window as any).presence;
        if (presence && presence.roomCode && isPublicSpace(presence.roomCode)) {
            return;
        }
        if (data.type === 'spotify') {
            this.loadSpotify(data.url, data.host);
        }
    });

    this.bus.on(APP_EVENTS.MEDIA_PLAY_REQUEST, (data: any) => {
        const presence = (window as any).presence;
        if (presence && presence.roomCode && isPublicSpace(presence.roomCode)) {
            return;
        }
        if (data.type === 'spotify') {
            this.loadSpotify(data.url);
        }
    });

    this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
        if (!data.room || isPublicSpace(data.room)) {
            this.clearPlayer();
        }
    });
  }

  private clearPlayer() {
    if (this.container) {
        this.container.innerHTML = '';
        this.container.classList.remove('active');
    }
    if (this.hostEl) {
        this.hostEl.textContent = '';
        this.hostEl.classList.remove('visible');
    }
  }

  private loadSpotify(url: string, hostName: string | null = null) {
    const match = url.match(/(?:spotify\.com\/|spotify:)(track|album|playlist|artist)[\/:]([A-Za-z0-9]+)/);
    if(!match) {
        this.bus.emit(APP_EVENTS.FEED_PUSH_REQUEST, "the record skips... invalid link."); 
        return; 
    }
    
    if(this.container) {
        this.container.innerHTML = ''; // Clear previous
        const iframe = document.createElement('iframe');
        iframe.src = `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
        iframe.width = "100%";
        iframe.height = "152";
        iframe.frameBorder = "0";
        iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
        
        this.container.appendChild(iframe);
        this.container.classList.add('active'); 
    }
    
    if(this.hostEl) {
        if(hostName) { 
            this.hostEl.textContent = `shared softly by ${hostName}`; 
            this.hostEl.classList.add('visible'); 
        } else { 
            this.hostEl.classList.remove('visible'); 
        }
    }
  }
}
