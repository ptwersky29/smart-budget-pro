import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.penni.finance",
  appName: "Penni",
  webDir: "build",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
};

export default config;
