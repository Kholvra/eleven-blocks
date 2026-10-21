import cards from './cards.json';
import events from './events.json';
import facts from './fakta.json';

const content = JSON.stringify([cards, events, facts]);
let hash = 0x811c9dc5;
for (let index = 0; index < content.length; index += 1) {
  hash ^= content.charCodeAt(index);
  hash = Math.imul(hash, 0x01000193);
}
const contentHash = (hash >>> 16).toString(16).padStart(4, '0').slice(-4);

export function getContentHash(): string {
  return contentHash;
}
