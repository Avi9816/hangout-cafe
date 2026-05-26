import { AppEvent } from './events';

type Callback = (data?: any) => void;

export class EventBus {
    private listeners: Map<AppEvent, Set<Callback>> = new Map();

    on(event: AppEvent, callback: Callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: AppEvent, callback: Callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)!.delete(callback);
        }
    }

    emit(event: AppEvent, data?: any) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)!.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in event listener for ${event}:`, e);
                }
            });
        }
    }
}
