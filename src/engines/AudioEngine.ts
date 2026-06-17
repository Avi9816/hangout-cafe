import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';

export class AudioEngine {
  private bus: EventBus;
  private ctx: AudioContext | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSrc: AudioBufferSourceNode | OscillatorNode | null = null;
  private secondarySrc: AudioBufferSourceNode | OscillatorNode | null = null;
  private activeNodes = new Set<any>();
  private trainInterval: any = null;

  constructor(bus: EventBus) {
    this.bus = bus;
    const initAudio = () => { this.init(); document.body.removeEventListener('click', initAudio); };
    document.body.addEventListener('click', initAudio);
    
    this.setupBusListeners();
  }
  
  private setupBusListeners() {
      this.bus.on(APP_EVENTS.UI_SFX_REQUEST, (type: string) => {
          if (type === 'soft_click') this.playSoftClick();
          if (type === 'wood_creak') this.playWoodCreak();
          if (type === 'paper_pin') this.playPaperPin();
      });

      this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
          this.generateAmbience(data.room, data.isPrivate);
      });

      this.bus.on(APP_EVENTS.TIME_TICK, () => {
          this.cleanupNodes();
      });
  }

  init() { 
      if (!this.ctx) { 
          this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); 
          if (this.ctx.state === 'suspended') this.ctx.resume(); 
      } 
  }

  private _playShortSound(oscType: OscillatorType, freqStart: number, freqEnd: number, duration: number, volStart: number, volEnd: number) {
      if (!this.ctx || this.ctx.state === 'closed') return;
      
      const osc = this.ctx.createOscillator(); 
      const gain = this.ctx.createGain();
      const nodeRef = { osc, gain, endTime: this.ctx.currentTime + duration + 0.2 };
      this.activeNodes.add(nodeRef);

      osc.type = oscType; 
      osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + (duration * 0.5));
      
      gain.gain.setValueAtTime(0, this.ctx.currentTime); 
      gain.gain.linearRampToValueAtTime(volStart, this.ctx.currentTime + 0.01); 
      gain.gain.exponentialRampToValueAtTime(volEnd, this.ctx.currentTime + duration);
      
      osc.connect(gain); gain.connect(this.ctx.destination); 
      osc.start(); 
      osc.stop(nodeRef.endTime);

      const cleanup = () => {
          if (!this.activeNodes.has(nodeRef)) return;
          try { osc.disconnect(); gain.disconnect(); } catch(e) {}
          this.activeNodes.delete(nodeRef);
      };

      osc.onended = cleanup;
      setTimeout(cleanup, (duration + 0.5) * 1000);
  }

  cleanupNodes() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.activeNodes.forEach(node => {
          if (node.endTime && now > node.endTime + 1) {
              try {
                  if (node.osc) node.osc.disconnect();
                  if (node.gain) node.gain.disconnect();
                  if (node.noise) node.noise.disconnect();
              } catch(e) {}
              this.activeNodes.delete(node);
          }
      });
  }
  
  private playSoftClick() { this._playShortSound('sine', 200, 50, 0.15, 0.01, 0.001); }
  
  private playWoodCreak() {
    if (!this.ctx) return;
    const noise = this.ctx.createBufferSource(); 
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const output = buffer.getChannelData(0); 
    for (let i = 0; i < buffer.length; i++) output[i] = (Math.random() * 2 - 1) * 0.3;
    noise.buffer = buffer; 
    
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 200; filter.Q.value = 4;
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, this.ctx.currentTime); 
    gain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.05); 
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination); 
    noise.start();
    
    const nodeRef = { noise, filter, gain, endTime: this.ctx.currentTime + 0.5 };
    this.activeNodes.add(nodeRef);
    noise.onended = () => { 
        try { filter.disconnect(); gain.disconnect(); } catch(e){}
        this.activeNodes.delete(nodeRef); 
    };
  }

  private playPaperPin() {
    if (!this.ctx) return;
    const noise = this.ctx.createBufferSource(); 
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
    const output = buffer.getChannelData(0); 
    for (let i = 0; i < buffer.length; i++) output[i] = Math.random() * 2 - 1;
    noise.buffer = buffer; 
    
    const filter = this.ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1800;
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, this.ctx.currentTime); 
    gain.gain.linearRampToValueAtTime(0.03, this.ctx.currentTime + 0.02); 
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination); 
    noise.start();
    
    const nodeRef = { noise, filter, gain, endTime: this.ctx.currentTime + 0.4 };
    this.activeNodes.add(nodeRef);
    noise.onended = () => { 
        try { filter.disconnect(); gain.disconnect(); } catch(e){}
        this.activeNodes.delete(nodeRef); 
    };
  }

  private generateAmbience(roomKey: string, isPrivate: boolean = false) {
    if (!this.ctx) return;

    if (this.trainInterval) {
        clearInterval(this.trainInterval);
        this.trainInterval = null;
    }
    
    if (this.ambienceGain) {
      const oldGain = this.ambienceGain;
      const oldSrc = this.ambienceSrc;
      const oldSec = this.secondarySrc;
      oldGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 4);
      setTimeout(() => { 
          try { if (oldSrc) (oldSrc as any).stop(); if (oldSec) (oldSec as any).stop(); oldGain.disconnect(); } catch(e){} 
      }, 4100);
    }
    
    this.ambienceGain = this.ctx.createGain(); 
    this.ambienceGain.connect(this.ctx.destination); 
    this.ambienceGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.ambienceGain.gain.linearRampToValueAtTime(isPrivate ? 0.1 : 0.2, this.ctx.currentTime + 6);

    const bufferSize = this.ctx.sampleRate * 2; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = buffer.getChannelData(0); 
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;

    if (roomKey === 'last-train') {
       // Rhythmic train rumble (low oscillators + noise burst)
       const osc = this.ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 40;
       const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 80;
       osc.connect(filter); filter.connect(this.ambienceGain); osc.start();
       this.ambienceSrc = osc;
       
       // Periodic "clack-clack"
       this.trainInterval = setInterval(() => {
           if (this.ctx && this.ambienceGain) {
               const noise = this.ctx.createBufferSource(); noise.buffer = buffer;
               const nGain = this.ctx.createGain(); nGain.gain.value = 0.05;
               noise.connect(nGain); nGain.connect(this.ambienceGain);
               noise.start(); noise.stop(this.ctx.currentTime + 0.1);
           }
       }, 2000);
    } else if (roomKey === 'between-pages') {
       // Deep silence (filtered noise)
       const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
       const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 150;
       src.connect(filter); filter.connect(this.ambienceGain); src.start();
       this.ambienceSrc = src;
    } else if (roomKey === 'northern-lights') {
       // Ethereal drone
       const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 60;
       const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 120;
       osc.connect(filter); filter.connect(this.ambienceGain); osc.start();
       this.ambienceSrc = osc;
       
       const osc2 = this.ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 90;
       osc2.connect(this.ambienceGain); osc2.start();
       this.secondarySrc = osc2;
    } else {
       // Default Rain (Rooftop)
       const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
       const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
       src.connect(filter); filter.connect(this.ambienceGain); src.start();
       this.ambienceSrc = src;
    }
  }
}
