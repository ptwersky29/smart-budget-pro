export function getToken(key) {
  const local = localStorage.getItem(key);
  const session = sessionStorage.getItem(key);
  // Return the first non-expired token, preferring localStorage
  if (local && !isTokenExpired(local)) return local;
  if (session && !isTokenExpired(session)) return session;
  // Fall back to any available token even if expired (backend will reject it)
  return local || session || null;
}

export function setToken(key, value, persistent = true) {
  if (persistent) {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  }
}

export function clearTokens() {
  const keys = ["access_token", "refresh_token", "financeai_token", "session_token"];
  keys.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
}

export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
