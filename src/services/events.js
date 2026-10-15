// In-process event bus → pushed to dashboards over Server-Sent Events (/v1/events).
import { EventEmitter } from 'node:events';
export const bus = new EventEmitter();
bus.setMaxListeners(500);

/** @param {string} type e.g. message.new, comment.new, post.updated  @param {{account_id?:string}} data */
export function emit(type, data = {}) {
  bus.emit('event', { type, data, at: new Date().toISOString() });
}
