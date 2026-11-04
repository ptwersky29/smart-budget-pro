import fs from "fs";
import path from "path";
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

describe("Public demo reuses the ACTUAL Penni offline app", () => {
  test("public entry opens same AppLayout and finance pages", () => {
    const app = read("App.js"), entry = read("pages/DemoEntry.jsx");
    expect(app).toContain('path="/demo/*" element={<DemoEntry />}');
    expect(app).toContain('<AppLayout />');
    for (const route of ['path="/dashboard" element={<Dashboard />}', 'path="/accounts" element={<AccountsPage />}', 'path="/transactions" element={<Transactions />}', 'path="/budgets" element={<BudgetPage />}']) expect(app).toContain(route);
    expect(entry).toContain('window.location.replace("/dashboard")');
    expect(app).not.toContain('import("./pages/DemoApp")');
  });
  test("demo profile bypasses cached private offline profile and stored tokens", () => {
    const auth = read("contexts/AuthContext.jsx"), session = read("lib/demoSession.js");
    expect(auth).toContain("if (isPublicDemo()) { setUser(DEMO_USER); setLoading(false); return; }");
    expect(auth).toContain("if (!isPublicDemo()) syncTokensFromLocation()");
    expect(session).toContain("isOffline: true, isDemo: true");
    expect(session).toContain("window.sessionStorage.getItem(DEMO_SESSION_KEY)");
  });
  test("demo API uses synthetic offline response and rejects all mutation methods", () => {
    const api = read("lib/api.js");
    expect(api).toContain("config.adapter = async request => demoResponse(request)");
    expect(api).toContain("config.withCredentials = false");
    expect(api).toContain("if (isPublicDemo()) return (await api.get(url, {params})).data");
    expect(api).toContain("if (isPublicDemo()) return response;");
    expect(api).toContain('error.code = "PENNI_DEMO_READ_ONLY"');
    expect(api).toContain('method !== "get" && method !== "head" && method !== "options"');
  });
  test("mutation dialogs are blocked but actual app remains visible", () => {
    const actions = read("contexts/ActionContext.jsx"), layout = read("pages/AppLayout.jsx");
    const settings = read("contexts/SettingsContext.jsx");
    expect(actions).toContain('if (isPublicDemo() &&');
    expect(layout).toContain('data-testid="actual-app-demo-banner"');
    expect(layout).toContain('disabled={demoMode}');
    expect(layout).toContain('exitPublicDemo("/register")');
    expect(settings).toContain("if (isPublicDemo()) return Promise.reject");
  });
  test("existing main page and login demo links remain", () => {
    expect(read("pages/Landing.jsx")).toContain('to="/demo" data-testid="hero-demo"');
    expect(read("pages/Login.jsx")).toContain('to="/demo" data-testid="login-offline"');
  });
});
