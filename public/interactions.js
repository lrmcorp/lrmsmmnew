import { t } from "./strings.en.js";
// Shared async-action behavior for buttons/forms; no third-party runtime required.
export function bindInteraction(el, eventName, handler, onError) {
  el.addEventListener(eventName, event => {
    const action = eventName === 'click' && el.tagName === 'BUTTON' || eventName === 'submit';
    if (action && el.dataset.pending === 'true') {
      event.preventDefault();
      return;
    }
    const button = el.tagName === 'BUTTON' ? el : eventName === 'submit' ? event.submitter : null;
    const wasDisabled = button?.disabled;
    let result;
    try {
      result = handler.call(el, event);
    } catch (error) {
      onError(error);
      return;
    }
    if (!result || typeof result.then !== 'function') return;
    if (action) {
      el.dataset.pending = 'true';
      el.setAttribute('aria-busy', 'true');
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      }
    }
    Promise.resolve(result).catch(onError).finally(() => {
      if (!action) return;
      delete el.dataset.pending;
      el.removeAttribute('aria-busy');
      if (button) {
        button.removeAttribute('aria-busy');
        if (button.isConnected) button.disabled = wasDisabled;
      }
    });
  });
}
