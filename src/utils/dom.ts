export const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export const $$ = <T extends HTMLElement = HTMLElement>(selector: string): NodeListOf<T> => document.querySelectorAll<T>(selector);

export function createSafeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classNames: string = '',
  textContent: string = ''
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (classNames) el.className = classNames;
  if (textContent) el.textContent = textContent;
  return el;
}
