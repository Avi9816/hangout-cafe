import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { $, createSafeElement } from '../utils/dom';

export class Cinematography {
  private bus: EventBus;
  private state = { targetX: 0, targetY: 0, currentX: 0, currentY: 0, targetScroll: 0, currentScroll: 0 };
  private isMobile = window.innerWidth <= 600;
  private lifecycle = new LifecycleManager();
  private mouseTicking = false;
  private isPrivate = false;
  private currentRoom: string | null = null;

  constructor(bus: EventBus) {
    this.bus = bus;
    this.setupListeners();
    this.setupBusListeners();
    this.renderLoop();
    this.startMythicEvents();
  }

  private setupBusListeners() {
      this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
          this.isPrivate = data.isPrivate;
          this.currentRoom = data.room;
      });
  }

  private setupListeners() {
    if(!this.isMobile) {
        document.addEventListener('mousemove', (e) => {
          if (this.mouseTicking) return;
          this.mouseTicking = true;
          requestAnimationFrame(() => {
              this.state.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
              this.state.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
              this.mouseTicking = false;
          });
        }, { passive: true });
    }
    document.addEventListener('scroll', () => {
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      this.state.targetScroll = window.scrollY / maxScroll;
    }, { passive: true });
  }

  private renderLoop() {
    const s = this.state;
    const lerpFactor = this.isMobile ? 0.05 : 0.015; 
    
    s.currentX += (s.targetX - s.currentX) * lerpFactor;
    s.currentY += (s.targetY - s.currentY) * lerpFactor;
    s.currentScroll += (s.targetScroll - s.currentScroll) * 0.05;

    const docStyle = document.documentElement.style;
    const panMod = this.isMobile ? 5 : 25; 
    
    docStyle.setProperty('--cam-x', `${s.currentX * panMod}px`);
    docStyle.setProperty('--cam-y', `${s.currentY * panMod}px`);
    docStyle.setProperty('--scroll-y', `${s.currentScroll * 80}px`);

    const bgBlur = Math.max(0, s.currentScroll * 20);
    const fgBlur = Math.max(0, (1 - s.currentScroll) * 15);
    
    docStyle.setProperty('--focus-bg', `${bgBlur}px`);
    docStyle.setProperty('--focus-fg', `${fgBlur}px`);

    requestAnimationFrame(() => this.renderLoop());
  }

  private startMythicEvents() {
    this.lifecycle.setInterval(() => {
       if(this.isPrivate) return; 
       if(Math.random() > 0.85) {
           const train = $('passing-train');
           if (train) {
               train.classList.remove('train-active'); 
               void train.offsetWidth;
               train.classList.add('train-active');
               this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'distant_train');
               this.bus.emit(APP_EVENTS.FEED_PUSH_REQUEST, "a distant train passes in the dark...");
           }
       }
    }, 200000); 

    this.lifecycle.setInterval(() => {
        const rand = Math.random();
        if (rand > 0.98 && !this.isPrivate) { 
            document.body.classList.remove('power-flicker'); 
            void document.body.offsetWidth; 
            document.body.classList.add('power-flicker');
            this.bus.emit(APP_EVENTS.FEED_PUSH_REQUEST, "the lights flicker like they remember something...");
        } else if (rand < 0.03 && this.currentRoom !== null) { 
            this.spawnMeteorShower();
            this.bus.emit(APP_EVENTS.FEED_PUSH_REQUEST, "something burns quietly in the upper atmosphere...");
        }
    }, 600000); 
  }

  private spawnMeteorShower() {
      const container = $('meteor-container');
      if(!container) return;
      
      for(let i=0; i<8; i++) {
          this.lifecycle.setTimeout(() => {
              const meteor = createSafeElement('div', 'meteor');
              meteor.style.left = `${Math.random() * 100}%`; 
              meteor.style.animationDuration = `${2 + Math.random()*3}s`;
              container.appendChild(meteor);
              this.lifecycle.setTimeout(() => meteor.remove(), 5000);
          }, Math.random() * 8000);
      }
  }
}
