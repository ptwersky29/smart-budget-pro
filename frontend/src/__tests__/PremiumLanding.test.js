import fs from "fs";
import path from "path";

const read = relative => fs.readFileSync(path.join(__dirname,"..",relative),"utf8");

describe("Penni premium landing page contracts", () => {
  test("public page is brand-matched, has responsive sections and useful actions", () => {
    const landing=read("pages/Landing.jsx");
    for (const id of ["features","how-it-works","jewish","pricing"]) {
      expect(landing).toContain(`id="${id}"`);
    }
    expect(landing).toContain('<Logo size="md"/>');
    expect(landing).toContain('data-testid="hero-cta-start"');
    expect(landing).toContain('data-testid="nav-register"');
    expect(landing).toContain('aria-expanded={mobileOpen}');
    expect(landing).toContain('setOpenFaq(openFaq===i?-1:i)');
  });

  test("interactive financial preview is explicitly labelled illustrative", () => {
    const landing=read("pages/Landing.jsx");
    expect(landing).toContain('Illustrative preview · Sample data');
    expect(landing).toContain('aria-pressed={range === p}');
    expect(landing).toContain('setRange(p)');
    expect(landing).toContain('role="img"');
    expect(landing).not.toContain("static.prod-images.emergentagent.com");
  });

  test("landing and pricing no longer contradict one another", () => {
    const landing=read("pages/Landing.jsx");
    const pricing=read("pages/Pricing.jsx");
    expect(landing).toContain('£0');
    expect(pricing).toContain('£0');
    expect(landing).not.toContain('£5');
    expect(landing).not.toContain('2,400+');
    expect(landing).not.toContain("14-day free trial");
    expect(pricing).toContain('data-testid="free-cta"');
  });

  test("animations have reduced-motion and responsive fallbacks", () => {
    const css=read("pages/Landing.css");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain(".pl-reveal.pl-visible");
    expect(css).toContain("@media(max-width:600px)");
    expect(css).toContain(".pl-mobile-links");
    expect(css).toContain(".pl-product-surface");
  });

  test("auth visual reuses same logo and indigo language", () => {
    const src=read("components/AuthVisual.jsx");
    expect(src).toContain('<Logo size="md" />');
    expect(src).toContain('bg-indigo-500/20 text-indigo-300');
    expect(src).not.toContain('h-10 w-10 place-items-center rounded-full bg-emerald');
  });
});
