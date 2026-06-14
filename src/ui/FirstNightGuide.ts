import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { $ } from '../utils/dom';

export interface GuideStepConfig {
  title: string;
  body: string;
  primaryAction: string;
  secondaryAction: string;
  highlightSelectors: string[];
  scrollTargetSelector: string | null;
}

const GUIDE_VERSION = 'v1';
const LOCAL_STORAGE_KEY = 'lateNightCafe.firstNightGuide.version';

const GUIDE_CONFIG: GuideStepConfig[] = [
  {
    title: 'First night?',
    body: 'Late Night Café is a quiet shared room that remembers who passed through.',
    primaryAction: 'Begin',
    secondaryAction: 'Skip',
    highlightSelectors: [],
    scrollTargetSelector: null
  },
  {
    title: 'Choose a corner',
    body: 'Pick a public room, or whisper a private room name.',
    primaryAction: 'Show me',
    secondaryAction: 'Skip',
    highlightSelectors: ['#destinations', '#private-room-section'],
    scrollTargetSelector: '#destinations'
  },
  {
    title: 'Leave something behind',
    body: 'Pin a note, place an object, share a tape, or add a photo. The room keeps small traces.',
    primaryAction: 'Got it',
    secondaryAction: 'Skip',
    highlightSelectors: [],
    scrollTargetSelector: null
  },
  {
    title: 'The room remembers',
    body: 'When you return later, the room can still hold its notes, photos, objects, tapes, and memories.',
    primaryAction: 'Enter the café',
    secondaryAction: '',
    highlightSelectors: [],
    scrollTargetSelector: null
  }
];

export class FirstNightGuide {
  private bus: EventBus;
  private isOpen = false;
  private startRetryCount = 0;
  private retryTimeoutId: any = null;
  private previousActiveElement: HTMLElement | null = null;

  private boundOnRoomChanged = this.onRoomChanged.bind(this);
  private boundOnKeyDown = this.onKeyDown.bind(this);

  constructor(eventBus: EventBus) {
    this.bus = eventBus;
  }

  init(): void {
    const replayBtn = $('btn-replay-guide');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        this.reset();
      });
    }

    this.bus.on(APP_EVENTS.ROOM_CHANGED, this.boundOnRoomChanged);
    window.addEventListener('keydown', this.boundOnKeyDown);

    // Initial check for onboarding auto-start
    this.maybeStart();
  }

  destroy(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.bus.off(APP_EVENTS.ROOM_CHANGED, this.boundOnRoomChanged);
    window.removeEventListener('keydown', this.boundOnKeyDown);
    this.close();
  }

  maybeStart(): void {
    const storedVersion = localStorage.getItem(LOCAL_STORAGE_KEY);
    const hasSeenCurrentVersion = storedVersion === GUIDE_VERSION;
    if (hasSeenCurrentVersion) return;

    const lobby = $('lobby-view');
    const isLobbyVisible = lobby && !lobby.classList.contains('view-hidden');
    if (!isLobbyVisible) {
      this.close();
      return;
    }

    const identityOverlay = $('identity-overlay');
    const isIdentityActive = identityOverlay && !identityOverlay.classList.contains('hidden');
    if (isIdentityActive) {
      // Retry in 500ms, up to 10 times (5 seconds total)
      if (this.startRetryCount < 10) {
        this.startRetryCount++;
        if (this.retryTimeoutId) clearTimeout(this.retryTimeoutId);
        this.retryTimeoutId = setTimeout(() => this.maybeStart(), 500);
      } else {
        console.log('[GUIDE] Onboarding startup retries exhausted. Waiting for replay.');
      }
      return;
    }

    // Safe to start
    this.start();
  }

  start(): void {
    this.isOpen = true;
    this.previousActiveElement = document.activeElement as HTMLElement;

    this.bus.emit(APP_EVENTS.GUIDE_STARTED as any);
    this.renderStep(0);
  }

  complete(): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, GUIDE_VERSION);
    this.bus.emit(APP_EVENTS.GUIDE_COMPLETED as any);
    this.close();
  }

  skip(): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, GUIDE_VERSION);
    this.bus.emit(APP_EVENTS.GUIDE_SKIPPED as any);
    this.close();
  }

  reset(): void {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    this.startRetryCount = 0;
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.start();
  }

  private close(): void {
    this.isOpen = false;
    this.removeHighlights();

    const container = $('first-night-guide-container');
    if (container) {
      container.innerHTML = '';
    }

    if (this.previousActiveElement) {
      try {
        this.previousActiveElement.focus();
      } catch (e) {}
      this.previousActiveElement = null;
    }
  }

  private onRoomChanged(data: any): void {
    // Dismiss automatically if entering a room
    if (data && data.room !== null) {
      if (this.isOpen) {
        this.close();
        // Since user exited lobby by choosing a room, mark as seen
        localStorage.setItem(LOCAL_STORAGE_KEY, GUIDE_VERSION);
      }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.skip();
    }
  }

  private renderStep(stepIndex: number): void {
    this.bus.emit(APP_EVENTS.GUIDE_STEP_CHANGED as any, stepIndex);

    const container = $('first-night-guide-container');
    if (!container) return;

    this.removeHighlights();

    const step = GUIDE_CONFIG[stepIndex];
    if (!step) return;

    // Scroll to target if specified in step config
    if (step.scrollTargetSelector) {
      try {
        const target = document.querySelector(step.scrollTargetSelector);
        if (target) {
          const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const isMobile = window.innerWidth <= 600;
          const block = isMobile ? 'start' : 'center';
          const behavior = prefersReducedMotion ? 'auto' : 'smooth';

          target.scrollIntoView({ behavior, block });
        } else {
          console.warn(`[GUIDE] Scroll target element not found: ${step.scrollTargetSelector}. Skipping scroll safely.`);
        }
      } catch (e) {
        console.error(`[GUIDE] Error scrolling to target: ${step.scrollTargetSelector}`, e);
      }
    }

    container.innerHTML = `
      <div class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button class="guide-close-btn" id="btn-guide-close" aria-label="Skip Guide">&times;</button>
        <h3 id="guide-title" class="guide-title">${step.title}</h3>
        <p class="guide-body">${step.body}</p>
        <div class="guide-footer">
          <span class="guide-step-indicator">${stepIndex + 1} / 4</span>
          <div class="guide-actions">
            ${step.secondaryAction ? `<button class="guide-secondary-btn" id="btn-guide-skip">${step.secondaryAction.toLowerCase()}</button>` : ''}
            <button class="guide-primary-btn" id="btn-guide-next">${step.primaryAction.toLowerCase()}</button>
          </div>
        </div>
      </div>
    `;

    // Apply highlights specified in the config step
    if (step.highlightSelectors) {
      this.applyHighlights(step.highlightSelectors);
    }

    // Set up button event listeners
    const nextBtn = $('btn-guide-next');
    const skipBtn = $('btn-guide-skip');
    const closeBtn = $('btn-guide-close');

    if (nextBtn) {
      nextBtn.focus();
      nextBtn.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        if (stepIndex === GUIDE_CONFIG.length - 1) {
          this.complete();
        } else {
          this.renderStep(stepIndex + 1);
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        this.skip();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.bus.emit(APP_EVENTS.UI_SFX_REQUEST, 'soft_click');
        this.skip();
      });
    }
  }

  private applyHighlights(selectors: string[]): void {
    if (!selectors) return;
    selectors.forEach(sel => {
      try {
        const el = document.querySelector(sel);
        if (el) {
          el.classList.add('guide-highlight');
        } else {
          console.warn(`[GUIDE] Element not found for selector: ${sel}. Skipping highlight safely.`);
        }
      } catch (e) {
        console.error(`[GUIDE] Invalid selector format: ${sel}`, e);
      }
    });
  }

  private removeHighlights(): void {
    GUIDE_CONFIG.forEach(step => {
      if (step.highlightSelectors) {
        step.highlightSelectors.forEach(sel => {
          try {
            const el = document.querySelector(sel);
            if (el) {
              el.classList.remove('guide-highlight');
            }
          } catch (e) {}
        });
      }
    });
  }
}
