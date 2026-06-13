import { EventBus } from './core/EventBus';
import { APP_EVENTS } from './core/events';
import { AmbientFeed } from './ui/AmbientFeed';
import { AudioEngine } from './engines/AudioEngine';
import { Environment } from './engines/Environment';
import { Cinematography } from './engines/Cinematography';
import { SpatialUI } from './ui/SpatialUI';
import { SharedPresence } from './services/Presence';
import { YouTubeSync } from './media/YouTubeSync';
import { SpotifyPlayer } from './media/SpotifyPlayer';
import { TorrentManager } from './media/TorrentManager';
import { initFirebase } from './config/firebase';

import './assets/styles/base.css';
import './assets/styles/atmosphere.css';
import './assets/styles/animations.css';
import './assets/styles/ui.css';

class App {
  private bus: EventBus;
  
  constructor() {
    this.bus = new EventBus();
    this.init();
  }

  private async init() {
    // 1. Core Engines (Ready immediately)
    new AudioEngine(this.bus);
    new Environment(this.bus);
    new Cinematography(this.bus);
    
    // 2. Media Specialists (Passive listeners)
    new YouTubeSync(this.bus);
    new SpotifyPlayer(this.bus);
    new TorrentManager(this.bus);
    
    // 3. UI (Ready immediately)
    new AmbientFeed(this.bus);
    const spatialUI = new SpatialUI(this.bus);
    if (typeof window !== 'undefined') {
        (window as any).spatialUI = spatialUI;
    }

    // 4. Data Layer (Async Bootstrap)
    new SharedPresence(this.bus);
    
    // 5. Firebase Lifecycle
    const auth = await initFirebase();
    if (auth) {
        this.bus.emit(APP_EVENTS.AUTH_STATE_CHANGED, { status: 'initializing' });
        
        const { onAuthStateChanged } = await import('firebase/auth');
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.bus.emit(APP_EVENTS.AUTH_STATE_CHANGED, { status: 'authenticated', user });
            }
        });
    }

    // 6. Global Time Cycle
    setInterval(() => {
        this.bus.emit(APP_EVENTS.TIME_TICK, { timestamp: Date.now() });
    }, 60000);
  }
}

new App();
