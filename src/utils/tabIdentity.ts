// Per-tab login identity.
// Login is per browser tab (Firebase "session" persistence), but the CRM kept
// "who am I" (userId, userName, userRole …) in localStorage, which is shared by
// ALL tabs. With two accounts open in one browser the last login overwrote the
// other tab's identity — e.g. chat messages went out with the wrong name.
// These keys are now read from this tab's sessionStorage. (A chat pop-up window
// opened from the CRM gets a copy of the tab's sessionStorage, so it still works.)

const TAB_KEYS = new Set([
  'userId',
  'userName',
  'userRole',
  'userEmail',
  'userTeamId',
  'userLeaderTeamIds',
  'userAvatar'
]);

try {
  const proto = Storage.prototype;
  const originalGet = proto.getItem;
  const originalSet = proto.setItem;
  const originalRemove = proto.removeItem;
  const local = window.localStorage;
  const session = window.sessionStorage;

  proto.getItem = function (key: string) {
    if (this === local && TAB_KEYS.has(key)) return originalGet.call(session, key);
    return originalGet.call(this, key);
  };

  proto.setItem = function (key: string, value: string) {
    if (this === local && TAB_KEYS.has(key)) {
      originalSet.call(session, key, value);
    }
    return originalSet.call(this, key, value);
  };

  proto.removeItem = function (key: string) {
    if (this === local && TAB_KEYS.has(key)) {
      originalRemove.call(session, key);
    }
    return originalRemove.call(this, key);
  };
} catch {
  // Storage not available (private mode etc.) — keep default behaviour.
}

export {};
