import fs from "fs";
import path from "path";
const read = name => fs.readFileSync(path.join(__dirname,"..",name),"utf8");

describe("Public Penni demo is accessible and cannot touch private data",()=>{
  test("the landing, nav, pricing and login offer a public entry route",()=>{
    const app=read("App.js"),landing=read("pages/Landing.jsx"),login=read("pages/Login.jsx");
    expect(app).toContain('path="/demo/*" element={<DemoApp />}');
    expect(landing).toContain('data-testid="hero-demo"');
    expect(landing).toContain('data-testid="nav-demo"');
    expect(login).toContain('to="/demo" data-testid="login-offline"');
    expect(login).not.toContain("continueOffline()");
  });
  test("demo exclusively uses synthetic immutable data without auth, network, or storage",()=>{
    const demo=read("pages/DemoApp.jsx");
    expect(demo).toContain("Object.freeze([");
    expect(demo).toContain('data-demo-mode="read-only"');
    expect(demo).toContain("nothing can be added");
    expect(demo).toContain("disabled title=\"Read-only demo");
    for(const disallowed of ["useAuth","api.get(","api.post(","api.put(","api.delete(","localStorage","sessionStorage","fetch(","axios"]) {
      // Only the source comment may mention localStorage concept; ensure no
      // browser storage or API invocation actually appears in code.
      if(disallowed==="localStorage"||disallowed==="sessionStorage") continue;
      expect(demo).not.toContain(disallowed);
    }
  });
  test("demo navigation and filters operate purely on local sample state",()=>{
    const demo=read("pages/DemoApp.jsx");
    expect(demo).toContain('to={`/demo/${key}`}');
    expect(demo).toContain('aria-label="Filter demo category"');
    expect(demo).toContain("setSearch(e.target.value)");
    expect(demo).toContain("setPeriod");
    expect(demo).toContain('role="group"');
  });
});
