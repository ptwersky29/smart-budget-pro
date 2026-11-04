/** Tab-local public demo flag. Never grant a backend token to this profile. */
export const DEMO_SESSION_KEY = "penni.public-demo.readonly.v1";
export const DEMO_USER = Object.freeze({
  id: "public-demo", user_id: "public-demo", name: "Demo visitor",
  email: "", tier: "free", role: "demo", onboarded: true,
  isOffline: true, isDemo: true,
});
export function isPublicDemo() {
  try { return typeof window !== "undefined" &&
    window.sessionStorage.getItem(DEMO_SESSION_KEY) === "true"; }
  catch { return false; }
}
export function exitPublicDemo(destination = "/") {
  try { window.sessionStorage.removeItem(DEMO_SESSION_KEY); } catch {}
  // Full reload ensures the real auth provider refreshes rather than carrying
  // the synthetic demo profile into real account pages.
  window.location.assign(destination);
}
