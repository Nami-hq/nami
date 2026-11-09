// Whether a title stays behind the content gate. Pure, so the card renderer
// and the tests agree without touching the DOM.

// Adult titles are locked for good. There is no switch, dialog or setting that
// opens them. `ownerUnlocked` is the private path the owner will wire later;
// nothing in the app sets it.
export function isLocked(item, gate) {
  if (!item || item.adult !== true) return false;
  return gate?.ownerUnlocked !== true;
}

export function lockLabel() {
  return '21+';
}
