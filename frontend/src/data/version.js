/**
 * Application Version Information
 * 
 * Version format: MAJOR.MINOR.PATCH
 * - MAJOR: Breaking changes, major new features
 * - MINOR: New features, backwards compatible
 * - PATCH: Bug fixes, minor improvements
 */

export const APP_VERSION = "1.0.0";
export const VERSION_NAME = "Genesis"; // Optional codename
export const BUILD_DATE = new Date().toISOString().split('T')[0];
export const IS_BETA = true;

// Changelog for current version
export const CHANGELOG = {
  "1.0.0": {
    date: "2026-07-01",
    name: "Genesis",
    changes: [
      "Initial public release",
      "Dashboard with financial overview",
      "Transaction management",
      "Budget tracking system",
      "Bank account connections",
      "Jewish finance tools (Maaser, Tzedakah)",
      "UK tax estimators",
      "Investment tracking",
      "Premium subscription system",
    ],
  },
};

// Get version info
export function getVersionInfo() {
  return {
    version: APP_VERSION,
    name: VERSION_NAME,
    buildDate: BUILD_DATE,
    isBeta: IS_BETA,
    changelog: CHANGELOG[APP_VERSION],
  };
}

// Check if user needs to refresh for new version
export function checkVersion() {
  const stored = localStorage.getItem("app_version");
  if (stored !== APP_VERSION) {
    localStorage.setItem("app_version", APP_VERSION);
    return { isNew: stored !== null, previous: stored };
  }
  return { isNew: false, previous: stored };
}
