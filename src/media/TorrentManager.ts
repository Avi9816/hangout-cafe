import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { VideoState } from '../types';
import { $ } from '../utils/dom';
import { devLog } from '../utils/logger';

import { isPublicSpace } from '../config/spaceCapabilities';

export class TorrentManager {
  private bus: EventBus;
  private wtClient: any = null;
  private currentMagnet: string | null = null;
  private localVideoObj: HTMLVideoElement | null = null;
  private container = $('local-video-container');
  private statusEl = $('wt-status');
  private hostEl = $('local-host');
  private isRemoteUpdate = false;

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
        if (data.type === 'magnet') {
            this.loadMagnet(data);
        }
    });

    this.bus.on(APP_EVENTS.MEDIA_PLAY_REQUEST, (data: any) => {
        const presence = (window as any).presence;
        if (presence && presence.roomCode && isPublicSpace(presence.roomCode)) {
            return;
        }
        if (data.type === 'vhs_seed') {
            this.seedFile(data.file);
        }
    });

    this.bus.on(APP_EVENTS.ROOM_CHANGED, (data: any) => {
        if (!data.room || isPublicSpace(data.room)) {
            this.cleanupTorrent();
        }
    });
  }

  private seedFile(file: File) {
      if(!this.wtClient && (window as any).WebTorrent) this.wtClient = new (window as any).WebTorrent();
      if(!this.wtClient) {
          if(this.statusEl) this.statusEl.textContent = 'WebTorrent client unavailable.';
          return;
      }
      if(this.statusEl) this.statusEl.textContent = 'Seeding tape to the room...';
      
      this.wtClient.seed(file, (torrent: any) => {
          this.currentMagnet = torrent.magnetURI;
          if(this.statusEl) this.statusEl.textContent = `Seeding complete: ${file.name}`;
          
          this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, {
              type: 'magnet',
              url: torrent.magnetURI,
              action: 'play',
              time: 0,
              title: file.name,
              timestamp: Date.now(),
              isEnqueue: true
          });
      });
  }

  private loadMagnet(videoData: VideoState) {
      if (!this.wtClient && (window as any).WebTorrent) this.wtClient = new (window as any).WebTorrent();
      
      if(this.currentMagnet !== videoData.url) {
          this.isRemoteUpdate = true;
          devLog('[VHS_REMOTE_UPDATE] Loading new magnet:', videoData.url);
          
          // Cleanup old torrent/video
          if (this.currentMagnet && this.wtClient) {
              try {
                  this.wtClient.remove(this.currentMagnet);
              } catch (e) {
                  console.warn("Error removing old torrent:", e);
              }
          }
          if (this.localVideoObj) {
              try {
                  this.localVideoObj.pause();
                  this.localVideoObj.src = "";
                  this.localVideoObj.load();
              } catch (e) {}
              this.localVideoObj = null;
          }

          this.currentMagnet = videoData.url;
          if(this.container) this.container.classList.add('active');
          if(this.statusEl) this.statusEl.textContent = `receiving tape from ${videoData.host}...`;
          
          if(this.hostEl) { 
              this.hostEl.classList.add('visible'); 
          }
          
          if (this.wtClient) {
              this.wtClient.add(videoData.url, (torrent: any) => {
                  if(this.statusEl) this.statusEl.textContent = `playing shared tape...`;
                  this.renderTorrent(torrent, videoData);
              });
          }
      } else if (this.localVideoObj) {
          this.isRemoteUpdate = true;
          devLog('[VHS_REMOTE_UPDATE] Applying seek/playback update:', videoData.action, videoData.time);
          let targetTime = videoData.time;
          if (videoData.action === 'play' && videoData.timestamp) {
              const elapsed = (Date.now() - videoData.timestamp) / 1000;
              targetTime += elapsed;
          }
          if (Math.abs(this.localVideoObj.currentTime - targetTime) > 1.5) {
              this.localVideoObj.currentTime = targetTime;
          }
          if (videoData.action === 'play' && this.localVideoObj.paused) {
              this.localVideoObj.play().catch(e => console.warn("Auto-play prevented", e));
          } else if (videoData.action === 'pause' && !this.localVideoObj.paused) {
              this.localVideoObj.pause();
          }
          setTimeout(() => {
              this.isRemoteUpdate = false;
          }, 500);
      }
  }

  private renderTorrent(torrent: any, videoData?: VideoState) {
      if(this.container) {
          this.container.innerHTML = '';
          this.container.classList.add('active');
      }
      
      const file = torrent.files.find((f: any) => 
          f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.ogg')
      );
      
      if(file) {
          file.appendTo('#local-video-container', { autoplay: true, controls: true }, (err: any, elem: HTMLVideoElement) => {
              if(err) {
                  this.isRemoteUpdate = false;
                  return console.error(err);
              }
              this.localVideoObj = elem;
              
              // Ensure native attributes are fully enabled
              elem.controls = true;
              elem.style.width = '100%';
              elem.style.borderRadius = '4px';

              // Apply initial state from videoData if available
              if (videoData) {
                  const applyState = () => {
                      let targetTime = videoData.time || 0;
                      if (videoData.action === 'play' && videoData.timestamp) {
                          const elapsed = (Date.now() - videoData.timestamp) / 1000;
                          targetTime += elapsed;
                      }
                      devLog('[VHS_REMOTE_UPDATE] Applying initial video state:', videoData.action, targetTime);
                      elem.currentTime = targetTime;
                      if (videoData.action === 'play') {
                          elem.play().catch(e => console.warn("Auto-play prevented", e));
                      } else {
                          elem.pause();
                      }
                      setTimeout(() => {
                          this.isRemoteUpdate = false;
                      }, 500);
                  };

                  if (elem.readyState >= 1) {
                      applyState();
                  } else {
                      elem.addEventListener('loadedmetadata', applyState, { once: true });
                  }
              } else {
                  this.isRemoteUpdate = false;
              }
              
              this.localVideoObj.addEventListener('play', () => {
                  if(!this.isRemoteUpdate) {
                      devLog('[VHS_LOCAL_EVENT] play');
                      this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { 
                          type: 'magnet', url: this.currentMagnet, action: 'play', time: this.localVideoObj!.currentTime, timestamp: Date.now() 
                      });
                  }
              });
              this.localVideoObj.addEventListener('pause', () => {
                  if(!this.isRemoteUpdate) {
                      devLog('[VHS_LOCAL_EVENT] pause');
                      this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { 
                          type: 'magnet', url: this.currentMagnet, action: 'pause', time: this.localVideoObj!.currentTime, timestamp: Date.now() 
                      });
                  }
              });
              this.localVideoObj.addEventListener('seeked', () => {
                  if(!this.isRemoteUpdate) {
                      devLog('[VHS_LOCAL_EVENT] seeked');
                      this.bus.emit(APP_EVENTS.MEDIA_PLAY_REQUEST, { 
                          type: 'magnet', url: this.currentMagnet, action: 'play', time: this.localVideoObj!.currentTime, timestamp: Date.now() 
                      });
                  }
              });
              this.localVideoObj.addEventListener('ended', () => {
                  devLog('[VHS_LOCAL_EVENT] ended');
                  this.bus.emit(APP_EVENTS.MEDIA_ENDED, {
                      type: 'magnet',
                      url: this.currentMagnet
                  });
              });
          });
      } else {
          this.isRemoteUpdate = false;
      }
  }

  private cleanupTorrent() {
      if (this.currentMagnet && this.wtClient) {
          try {
              this.wtClient.remove(this.currentMagnet);
          } catch (e) {
              console.warn("Error removing old torrent on room change:", e);
          }
      }
      this.currentMagnet = null;
      if (this.localVideoObj) {
          try {
              this.localVideoObj.pause();
              this.localVideoObj.src = "";
              this.localVideoObj.load();
          } catch (e) {}
          this.localVideoObj = null;
      }
      if (this.container) {
          this.container.innerHTML = '';
          this.container.classList.remove('active');
      }
      if (this.statusEl) {
          this.statusEl.textContent = '';
      }
      if (this.hostEl) {
          this.hostEl.classList.remove('visible');
          this.hostEl.textContent = '';
      }
  }

  destroy() {
      this.cleanupTorrent();
      if (this.wtClient) {
          try {
              this.wtClient.destroy();
          } catch (e) {
              console.warn("Error destroying WebTorrent client:", e);
          }
          this.wtClient = null;
      }
  }
}
