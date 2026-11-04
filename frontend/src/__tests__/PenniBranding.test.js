import fs from "fs";
import path from "path";

const read = file => fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");

describe("Penni premium brand consistency", () => {
  test("every in-app logo uses the approved indigo image, never the gold CSS symbol", () => {
    const logo = read("src/components/Logo.jsx");
    expect(logo).toContain('src="/penni-mark.png"');
    expect(logo).toContain('alt="Penni"');
    expect(logo).not.toContain("radial-gradient");
    expect(logo).not.toContain("ffd2a1");
  });
  test("favicon and Apple touch links reference the generated new brand", () => {
    const html = read("public/index.html");
    expect(html).toContain('href="/favicon-32x32.png?brand=2"');
    expect(html).toContain('href="/apple-touch-icon.png?brand=2"');
    expect(html).not.toContain('href="/favicon.svg"');
  });
  test("PWA icon generator reads the same artwork, supports all manifest sizes and safe maskable icons", () => {
    const gen = read("scripts/generate-pwa-icons.js");
    const manifest = JSON.parse(read("public/manifest.json"));
    expect(gen).toContain('path.join(publicDir, "penni-mark.png")');
    expect(gen).toContain('maskable-icon-');
    expect(manifest.icons.every(icon=>icon.src.includes("icon-"))).toBe(true);
    expect(manifest.icons.some(icon=>icon.purpose === "maskable")).toBe(true);
    expect(manifest.theme_color).toBe("#5046E5");
  });
});
