const WB_2FA_SESSION_PREFIX = "komari_wb_2fa_";

// Memory cache in case sessionStorage is restricted in iframe/private browsing
const memoryVerifiedSet = new Set<string>();

export const isClientWorkbenchVerified = (uuid: string): boolean => {
  if (!uuid) return false;
  if (memoryVerifiedSet.has(uuid)) return true;
  try {
    const val = sessionStorage.getItem(`${WB_2FA_SESSION_PREFIX}${uuid}`);
    if (!val) return false;
    const ts = Number(val);
    if (!ts || isNaN(ts)) return false;
    // Valid for 1 hour within the browser session
    const valid = Date.now() - ts < 60 * 60 * 1000;
    if (valid) {
      memoryVerifiedSet.add(uuid);
    }
    return valid;
  } catch {
    return memoryVerifiedSet.has(uuid);
  }
};

export const markClientWorkbenchVerified = (uuid: string): void => {
  if (!uuid) return;
  memoryVerifiedSet.add(uuid);
  try {
    sessionStorage.setItem(`${WB_2FA_SESSION_PREFIX}${uuid}`, String(Date.now()));
  } catch {}
};

export const clearClientWorkbenchVerified = (uuid?: string): void => {
  if (uuid) {
    memoryVerifiedSet.delete(uuid);
    try {
      sessionStorage.removeItem(`${WB_2FA_SESSION_PREFIX}${uuid}`);
    } catch {}
  } else {
    memoryVerifiedSet.clear();
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(WB_2FA_SESSION_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {}
  }
};
