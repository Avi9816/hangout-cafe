import { EventBus } from '../core/EventBus';
import { APP_EVENTS } from '../core/events';
import { $ } from '../utils/dom';
import { devLog } from '../utils/logger';

export interface GuideStepConfig {
  title: string;
  body: string;
  primaryAction: string;
  secondaryAction: string;
  highlightSelectors: string[];
  scrollTargetSelector: string | null;
}

const GUIDE_VERSION = 'v2';
const LOCAL_STORAGE_KEY = 'lateNightCafe.firstNightGuide.version';

const GUIDE_CONFIG: GuideStepConfig[] = [
  {
    title: 'First night?',
    body: 'After Hours is a collection of persistent digital places for shared interests and quiet conversations.',
    primaryAction: 'Begin',
    secondaryAction: 'Skip',
    highlightSelectors: [],
    scrollTargetSelector: null
  },
  {
    title: 'Choose a corner',
    body: 'Find a public space for the hour you are in, or whisper a name to gather in a private circle.',
    primaryAction: 'Show me',
    secondaryAction: 'Skip',
    highlightSelectors: ['#destinations', '#private-room-section'],
    scrollTargetSelector: '#destinations'
  },
  {
    title: 'Leave something behind',
    body: 'Pin a note, leave a whisper, share a tape, or add a photo. The space keeps small traces.',
    primaryAction: 'Got it',
    secondaryAction: 'Skip',
    highlightSelectors: [],
    scrollTargetSelector: null
  },
  {
    title: 'The space remembers',
    body: 'When you return, the space still holds its notes, photos, whispers, tapes, and memories. Not everything needs to be a feed.',
    primaryAction: 'Step inside',
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

  // Track the current step index and active highlight timers
  private currentStepIndex = 0;
  private highlightTimeoutId: any = null;

  private boundOnRoomChanged = this.onRoomChanged.bind(this);
  private boundOnKeyDown = this.onKeyDown.bind(this);
  private boundOnIdentityReady = this.onIdentityReady.bind(this);

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
    this.bus.on(APP_EVENTS.IDENTITY_READY, this.boundOnIdentityReady);
    window.addEventListener('keydown', this.boundOnKeyDown);

    // Initial check for onboarding auto-start
    this.maybeStart();
  }

  destroy(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.clearHighlightTimers();
    this.bus.off(APP_EVENTS.ROOM_CHANGED, this.boundOnRoomChanged);
    this.bus.off(APP_EVENTS.IDENTITY_READY, this.boundOnIdentityReady);
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
        devLog('[GUIDE] Onboarding startup retries exhausted. Waiting for replay.');
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
    this.clearHighlightTimers();
    localStorage.setItem(LOCAL_STORAGE_KEY, GUIDE_VERSION);
    this.bus.emit(APP_EVENTS.GUIDE_COMPLETED as any);
    this.close();
  }

  skip(): void {
    this.clearHighlightTimers();
    localStorage.setItem(LOCAL_STORAGE_KEY, GUIDE_VERSION);
    this.bus.emit(APP_EVENTS.GUIDE_SKIPPED as any);
    this.close();
  }

  reset(): void {
    this.clearHighlightTimers();
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
    this.clearHighlightTimers();
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

  private onIdentityReady(): void {
    // Identity overlay was just dismissed — safe moment to try starting the guide
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.startRetryCount = 0;
    this.maybeStart();
  }

  private onRoomChanged(data: any): void {
    // Dismiss automatically if entering a room
    if (data && data.room !== null) {
      if (this.isOpen) {
        this.skip();
      }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.skip();
    }
  }

  private clearHighlightTimers(): void {
    if (this.highlightTimeoutId) {
      clearTimeout(this.highlightTimeoutId);
      this.highlightTimeoutId = null;
    }
  }

  private scrollToGuideTarget(selector: string | null): Promise<void> {
    if (!selector) return Promise.resolve();
    try {
      const target = document.querySelector(selector) as HTMLElement;
      if (!target) return Promise.resolve();

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isMobile = window.matchMedia('(max-width: 768px)').matches;

      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: isMobile ? 'start' : 'center',
        inline: 'nearest'
      });
    } catch (e) {
      console.error(`[GUIDE] Error scrolling to target: ${selector}`, e);
    }
    return Promise.resolve();
  }

  private waitForScrollThenHighlight(stepIndex: number, scrollTargetSelector: string | null, highlightSelectors: string[]): void {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    let applied = false;
    const applyOnce = () => {
      if (applied) return;
      applied = true;

      this.clearHighlightTimers();
      window.removeEventListener('scrollend', scrollEndHandler, { capture: true });
      document.removeEventListener('scrollend', scrollEndHandler, { capture: true });

      // Ensure guide is still active, step matches, and wasn't skipped/destroyed in between
      if (!this.isOpen || this.currentStepIndex !== stepIndex) return;

      if (highlightSelectors && highlightSelectors.length > 0) {
        this.applyHighlights(highlightSelectors);
      }

      // Focus guide primary action button safely after layout transition
      const nextBtn = $('btn-guide-next');
      if (nextBtn) {
        nextBtn.focus({ preventScroll: true });
      }
    };

    const scrollEndHandler = () => {
      applyOnce();
    };

    // If reduced-motion is active or no target is configured, apply and focus immediately
    if (prefersReducedMotion || !scrollTargetSelector) {
      applyOnce();
      return;
    }

    // Otherwise, listen for standard scrollend event to handle transitions natively
    window.addEventListener('scrollend', scrollEndHandler, { capture: true, once: true });
    document.addEventListener('scrollend', scrollEndHandler, { capture: true, once: true });

    // Enforce 500ms safety timeout fallback for legacy/non-conforming viewports
    this.highlightTimeoutId = setTimeout(() => {
      applyOnce();
    }, 500);
  }

  private renderStep(stepIndex: number): void {
    this.bus.emit(APP_EVENTS.GUIDE_STEP_CHANGED as any, stepIndex);

    const container = $('first-night-guide-container');
    if (!container) return;

    this.removeHighlights();
    this.clearHighlightTimers();
    this.currentStepIndex = stepIndex;

    const step = GUIDE_CONFIG[stepIndex];
    if (!step) return;

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

    // Set up button event listeners
    const nextBtn = $('btn-guide-next');
    const skipBtn = $('btn-guide-skip');
    const closeBtn = $('btn-guide-close');

    if (nextBtn) {
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

    // Scroll to section target first, then deferred highlight application
    this.scrollToGuideTarget(step.scrollTargetSelector).then(() => {
      this.waitForScrollThenHighlight(stepIndex, step.scrollTargetSelector, step.highlightSelectors);
    });
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
