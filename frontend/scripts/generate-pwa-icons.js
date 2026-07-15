const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svg = fs.readFileSync(path.join(__dirname, "..", "public", "logo.svg"), "utf8");

const sizes = [48, 72, 96, 128, 144, 192, 384, 512];
const publicDir = path.join(__dirname, "..", "public");

async function main() {
  for (const size of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png (${size}x${size})`);
  }
  // Apple touch icon at 180x180
  await sharp(Buffer.from(svg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));
  console.log("Generated apple-touch-icon.png (180x180)");

  // Favicon at 32x32
  await sharp(Buffer.from(svg))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, "favicon-32x32.png"));
  console.log("Generated favicon-32x32.png (32x32)");
}

main().catch(console.error);
