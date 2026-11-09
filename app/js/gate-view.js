// Whether a title stays behind the content gate. Pure, so the card renderer
// and the tests agree without touching the DOM.

export function isLocked(item, gate) {
  if (!item || item.adult !== true) return false;
  if (gate?.filter === false) return false;
  return gate?.unlocked !== true;
}

export function lockLabel() {
  return '21+';
}
