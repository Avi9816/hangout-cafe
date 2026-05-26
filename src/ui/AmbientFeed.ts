import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { LifecycleManager } from '../core/Lifecycle';
import { $ } from '../utils/dom';
import { AMBIENT_THOUGHTS } from '../constants/app';

export class AmbientFeed {
  private bus: EventBus;
  private el: HTMLElement | null;
  private queue: string[] = [];
  private isDisplaying = false;
  private lifecycle = new LifecycleManager();
  
  constructor(bus: EventBus) {
    this.bus = bus;
    this.el = $('feed-text'); 
    
    this.setupBusListeners();
    
    this.lifecycle.setInterval(() => {
      if(Math.random() > 0.8 && this.queue.length === 0 && !this.isDisplaying) {
         this.pushLocal(AMBIENT_THOUGHTS[Math.floor(Math.random() * AMBIENT_THOUGHTS.length)]);
      }
    }, 50000);
  }

  private setupBusListeners() {
      this.bus.on(APP_EVENTS.FEED_PUSH_REQUEST, (msg: string) => this.pushLocal(msg));
      this.bus.on(APP_EVENTS.AMBIENT_ACTION_RECEIVED, (action: any) => {
          if(action.isTrace) this.queue.push(`... ${action.text}`);
          else this.queue.push(`${action.emoji} ${action.text}`);
          if (!this.isDisplaying) this.processQueue();
      });
  }

  private pushLocal(msg: string) { 
    this.queue.push(msg); 
    if (!this.isDisplaying) this.processQueue(); 
  }

  private async processQueue() {
    if (this.queue.length === 0 || !this.el) return;
    this.isDisplaying = true; 
    const msg = this.queue.shift();
    if (msg) {
        this.el.textContent = msg; 
        this.el.classList.add('show');
    }
    
    await new Promise(r => this.lifecycle.setTimeout(r as () => void, 9000));
    if(this.el) this.el.classList.remove('show');
    await new Promise(r => this.lifecycle.setTimeout(r as () => void, 6000));
    
    this.isDisplaying = false;
    if (this.queue.length > 0) this.processQueue();
  }
}
