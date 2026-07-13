import { getToken, setToken, clearTokens, isTokenExpired } from "../lib/storage";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("isTokenExpired returns true for falsy input", () => {
  expect(isTokenExpired(null)).toBe(true);
  expect(isTokenExpired("")).toBe(true);
  expect(isTokenExpired(undefined)).toBe(true);
});

test("isTokenExpired returns true for malformed token", () => {
  expect(isTokenExpired("not-a-jwt")).toBe(true);
});

test("isTokenExpired returns true for expired token", () => {
  const expiredPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }));
  expect(isTokenExpired(`header.${expiredPayload}.sig`)).toBe(true);
});

test("isTokenExpired returns false for valid token", () => {
  const validPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  expect(isTokenExpired(`header.${validPayload}.sig`)).toBe(false);
});

test("setToken stores in localStorage when persistent", () => {
  setToken("access_token", "test-value", true);
  expect(localStorage.getItem("access_token")).toBe("test-value");
  expect(sessionStorage.getItem("access_token")).toBeNull();
});

test("setToken stores only in sessionStorage when not persistent", () => {
  setToken("refresh_token", "session-only", false);
  expect(localStorage.getItem("refresh_token")).toBeNull();
  expect(sessionStorage.getItem("refresh_token")).toBe("session-only");
});

test("getToken prefers localStorage over sessionStorage", () => {
  const localValue = tokenExpiringIn(3600);
  const sessionValue = tokenExpiringIn(7200);
  localStorage.setItem("access_token", localValue);
  sessionStorage.setItem("access_token", sessionValue);
  expect(getToken("access_token")).toBe(localValue);
});

test("getToken falls back to sessionStorage when localStorage is empty", () => {
  const sessionValue = tokenExpiringIn(3600);
  sessionStorage.setItem("access_token", sessionValue);
  expect(getToken("access_token")).toBe(sessionValue);
});

function tokenExpiringIn(seconds) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.sig`;
}

test("getToken never returns expired or malformed tokens", () => {
  localStorage.setItem("access_token", "malformed");
  expect(getToken("access_token")).toBeNull();
});

test("getToken returns null when no token exists", () => {
  expect(getToken("nonexistent")).toBeNull();
});

test("clearTokens removes all keys from both storages", () => {
  setToken("access_token", "val1");
  setToken("refresh_token", "val2");
  setToken("financeai_token", "val3");
  setToken("session_token", "val4");
  clearTokens();
  expect(localStorage.getItem("access_token")).toBeNull();
  expect(sessionStorage.getItem("access_token")).toBeNull();
  expect(localStorage.getItem("refresh_token")).toBeNull();
  expect(sessionStorage.getItem("financeai_token")).toBeNull();
  expect(sessionStorage.getItem("session_token")).toBeNull();
});

test("getToken skips expired localStorage token and uses sessionStorage", () => {
  const expiredPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }));
  const validPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem("access_token", `header.${expiredPayload}.sig`);
  sessionStorage.setItem("access_token", `header.${validPayload}.sig`);
  expect(getToken("access_token")).toBe(`header.${validPayload}.sig`);
});
