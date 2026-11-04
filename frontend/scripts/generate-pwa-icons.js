const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Source of truth: the same approved Penni mark used by the React sidebar.
// Regenerate the tab favicon, PWA sizes and iOS home-screen icon at build time.
const publicDir = path.join(__dirname, "..", "public");
const source = fs.readFileSync(path.join(publicDir, "penni-mark.png"));
const sizes = [48, 72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  for (const size of sizes) {
    await sharp(source).resize(size, size).png()
      .toFile(path.join(publicDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png (${size}x${size})`);
  }

  // Maskable icons have a real background and the artwork sits inside the
  // platform's safe zone, so Android does not clip the white P.
  for (const size of [192, 512]) {
    const markSize = Math.round(size * 0.76);
    const mark = await sharp(source).resize(markSize, markSize).png().toBuffer();
    const inset = Math.floor((size - markSize) / 2);
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 43, g: 35, b: 162, alpha: 1 },
      },
    }).composite([{ input: mark, left: inset, top: inset }])
      .png()
      .toFile(path.join(publicDir, `maskable-icon-${size}x${size}.png`));
  }

  await sharp(source).resize(180, 180).png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));
  await sharp(source).resize(32, 32).png()
    .toFile(path.join(publicDir, "favicon-32x32.png"));
}

main().catch(error => {
  console.error("Failed to generate Penni icons:", error);
  process.exitCode = 1;
});
