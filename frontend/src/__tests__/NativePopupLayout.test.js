import fs from "fs";
import path from "path";

// JSDOM mocks CSS; inspect the actual stylesheet to prevent missing portal positioning.
const css = fs.readFileSync(path.join(__dirname, "../design-system/penni-reference.css"), "utf8");

test("native backdrop covers the screen", () => {
  expect(css).toMatch(/\.penni-native-backdrop\s*\{\s*position:\s*fixed;/);
  expect(css).toMatch(/inset:\s*0;/);
  expect(css).toMatch(/z-index:\s*var\(--penni-z-backdrop\);/);
});

test("native popup is fixed, centered and stacked over its backdrop", () => {
  expect(css).toMatch(/\.penni-native-popup\s*\{\s*position:\s*fixed;/);
  expect(css).toMatch(/top:\s*50%;\s*left:\s*50%;/);
  expect(css).toMatch(/z-index:\s*var\(--penni-z-dialog\);/);
  expect(css).toMatch(/max-height:\s*min\(90dvh/);
  expect(css).toMatch(/\.penni-native-body\s*\{[\s\S]*?overflow-y:\s*auto;/);
});

test("mobile sheet and reduced-motion styles are present", () => {
  expect(css).toMatch(/@media \(max-width:\s*767px\)/);
  expect(css).toMatch(/\.penni-native-popup\s*\{\s*top:\s*auto;\s*bottom:\s*0;/);
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
});
