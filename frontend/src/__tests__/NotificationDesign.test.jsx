import React from "react";
import { render } from "@testing-library/react";
import fs from "fs";
import path from "path";
import NotificationGlyph from "../components/ui/NotificationGlyph";

const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("unified Penni notification design", () => {
  test.each(["success", "error", "warning", "info", "loading"])("%s has one shared icon shell", type => {
    const { container } = render(<NotificationGlyph type={type} />);
    expect(container.firstChild).toHaveClass("penni-notification-glyph");
    expect(container.firstChild).toHaveAttribute("data-kind", type);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  test("toast system uses one custom themed Toaster everywhere", () => {
    const app = source("App.js");
    const sonner = source("components/ui/sonner.jsx");
    expect(app).toContain('import { Toaster } from "./components/ui/sonner"');
    expect(app).not.toContain('import { Toaster } from "sonner"');
    expect(sonner).toContain('className="penni-toaster"');
    expect(sonner).toContain("resolvedTheme");
    expect(sonner).toContain("closeButton");
    expect(sonner).toContain('success: <NotificationGlyph type="success" />');
  });

  test("saved notifications and offline notices reuse the same visuals", () => {
    expect(source("components/NotificationCenter.jsx")).toContain("<NotificationGlyph type={n.type} />");
    expect(source("components/NotificationCenter.jsx")).toContain("penni-notification-row");
    expect(source("components/NetworkStatus.jsx")).toContain('<NotificationGlyph type="warning" />');
    const css = source("index.css");
    expect(css).toContain("[data-sonner-toast].penni-notification-toast");
    expect(css).toContain("display: grid !important;");
    expect(css).toContain("grid-template-columns: 32px minmax(0, 1fr);");
    expect(css).toContain("[data-sonner-toast].penni-notification-toast [data-content]");
    expect(css).toContain("grid-column: 2;");
    expect(css).toContain("transform: translateY(-50%) !important;");
    expect(css).toContain(".penni-notification-panel,");
    expect(css).toContain(".penni-system-notice");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
