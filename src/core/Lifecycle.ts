export class LifecycleManager {
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private timeouts = new Set<ReturnType<typeof setTimeout>>();

  setInterval(fn: () => void, ms: number) {
      const id = setInterval(fn, ms);
      this.intervals.add(id);
      return id;
  }

  setTimeout(fn: () => void, ms: number) {
      const id = setTimeout(() => {
          fn();
          this.timeouts.delete(id);
      }, ms);
      this.timeouts.add(id);
      return id;
  }

  clearAll() {
      this.intervals.forEach(clearInterval);
      this.timeouts.forEach(clearTimeout);
      this.intervals.clear();
      this.timeouts.clear();
  }
}
