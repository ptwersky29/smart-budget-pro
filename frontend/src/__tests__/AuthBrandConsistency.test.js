import fs from "fs";
import path from "path";
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

describe("Penni premium authentication pages", () => {
  test("registration retains working form, Google, consent, onboarding and free pricing", () => {
    const s = read("pages/Register.jsx");
    expect(s).toContain("penni-auth grid");
    expect(s).toContain("auth-heading");
    expect(s).toContain('data-testid="register-submit"');
    expect(s).toContain('data-testid="register-password"');
    expect(s).toContain("await register(form)");
    expect(s).toContain('navigate("/onboarding")');
    expect(s).toContain('to="/privacy"');
    expect(s).toContain('BACKEND_URL}/api/auth/google');
    expect(s).toContain("No Penni subscription required");
    expect(s).not.toContain("14-day free trial");
  });
  test("login retains password reset, session, Google, offline and sign-in routes", () => {
    const s = read("pages/Login.jsx");
    expect(s).toContain("penni-auth grid");
    expect(s).toContain('data-testid="login-submit"');
    expect(s).toContain('data-testid="login-offline"');
    expect(s).toContain('data-testid="login-google"');
    expect(s).toContain('to="/forgot-password"');
    expect(s).toContain("await login(email, password, rememberMe)");
    expect(s).toContain("continueOffline()");
    expect(s).not.toContain("256-bit encrypted");
  });
  test("both pages share the branded shell, visual and reduced-motion styles", () => {
    for(const page of ["pages/Register.jsx","pages/Login.jsx"])
      expect(read(page)).toContain('import "./AuthPages.css"');
    const css=read("pages/AuthPages.css");
    expect(css).toContain(".penni-auth .auth-submit");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(read("components/AuthVisual.jsx")).toContain("penni-auth-visual");
  });
});
