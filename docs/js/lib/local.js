// Browser-only storage for picks and notes made in the app. Nothing here reaches the repo
// until you export it and commit it (see README). Every access is wrapped: storage can be
// blocked or empty in private windows.

const KEYS = { picks: 'punterlab.picks.v1', replays: 'punterlab.replays.v1' };

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = (() => {
  try {
    localStorage.setItem('punterlab.test', '1');
    localStorage.removeItem('punterlab.test');
    return true;
  } catch {
    return false;
  }
})();

export const getPicks = () => read(KEYS.picks);
export const addPick = (p) => write(KEYS.picks, [...getPicks(), p]);
export const removePick = (id) => write(KEYS.picks, getPicks().filter((p) => p.id !== id));

export const getReplays = () => read(KEYS.replays);
export const addReplay = (r) => write(KEYS.replays, [r, ...getReplays()]);
export const removeReplay = (id) => write(KEYS.replays, getReplays().filter((r) => r.id !== id));

/** Download a JSON file to the viewer's device. */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
