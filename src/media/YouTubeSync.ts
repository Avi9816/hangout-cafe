import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { $, createSafeElement } from '../utils/dom';

export class YouTubeSync {
  private bus: EventBus;
  private ytPlayer: any = null;
  private currentYtId: string | null = null;
  private container = $('youtube-container');
  private hostEl = $('youtube-host');
  private isRemoteUpdate = false;

  constructor(bus: EventBus) {
    this.bus = bus;
    this.setupBusListeners();
  }

  private setupBusListeners() {
    this.bus.on(APP_EVENTS.REMOTE_MEDIA_UPDATED, (data: any) => {
        if (data.type === 'youtube') {
            this.isRemoteUpdate = true;
            this.loadYouTube(data.url, data, data.host);
            setTimeout(() => this.isRemoteUpdate = false, 1500);
        }
    });

    this.bus.on(APP_EVENTS.MEDIA_PLAY_REQUEST, (data: any) => {
        if (data.type === 'youtube') {
            this.loadYouTube(data.url);
        }
    });
  }

  private loadYouTube(url: string, state: any = null, hostName: string | null = null) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    if(!match) return;
    const videoId = match[1];

    if(this.container) this.container.classList.add('active'); 
    
    if(this.hostEl) {
        if(hostName) { 
            this.hostEl.textContent = `shared softly by ${hostName}`; 
            this.hostEl.classList.add('visible'); 
        } else { 
            this.hostEl.classList.remove('visible'); 
        }
    }

    if (this.currentYtId === videoId && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
        if(state) {
            const currentTime = this.ytPlayer.getCurrentTime();
            if(Math.abs(currentTime - state.time) > 2) this.ytPlayer.seekTo(state.time, true);
            if(state.action === 'play') this.ytPlayer.playVideo();
            if(state.action === 'pause') this.ytPlayer.pauseVideo();
        }
        return;
    }

    this.currentYtId = videoId;
    if(this.ytPlayer && typeof this.ytPlayer.destroy === 'function') this.ytPlayer.destroy();
    
    if(this.container) {
        this.container.innerHTML = '';
        const target = createSafeElement('div');
        target.id = 'yt-player-target';
        this.container.appendChild(target);
    }
    
    if (window.YT && window.YT.Player) {
      this.ytPlayer = new window.YT.Player('yt-player-target', {
        height: '240', width: '100%', videoId: videoId, playerVars: { 'autoplay': 1, 'controls': 1 },
        events: {
          'onReady': (e: any) => {
            if(state && state.time) e.target.seekTo(state.time, true);
            if(state && state.action === 'pause') e.target.pauseVideo();
          },
          'onStateChange': (e: any) => {
             if (window.YT && e.data == window.YT.PlayerState.ENDED) {
                this.bus.emit(APP_EVENTS.MEDIA_ENDED, {
                    type: 'youtube',
                    url: `https://www.youtube.com/watch?v=${this.currentYtId}`
                });
             } else if(!this.isRemoteUpdate) {
                const action = (e.data == window.YT.PlayerState.PLAYING) ? 'play' : 
                               (e.data == window.YT.PlayerState.PAUSED) ? 'pause' : null;
                if (action) {
                    this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { 
                        type: 'youtube', 
                        url: `https://www.youtube.com/watch?v=${this.currentYtId}`,
                        action, 
                        time: this.ytPlayer.getCurrentTime() 
                    });
                }
             }
          }
        }
      });
    }
  }
}
