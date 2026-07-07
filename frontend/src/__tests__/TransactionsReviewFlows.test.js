const fs = require("fs");
const path = require("path");

const transactionsSource = fs.readFileSync(
  path.join(__dirname, "..", "pages", "Transactions.jsx"),
  "utf8"
);
const transactionFormSource = fs.readFileSync(
  path.join(__dirname, "..", "components", "TransactionForm.jsx"),
  "utf8"
);

function readSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return readSourceFiles(fullPath);
    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) return [];
    return [fs.readFileSync(fullPath, "utf8")];
  });
}

describe("Transactions review flows", () => {
  test("do not use native browser message boxes", () => {
    const frontendSource = readSourceFiles(path.join(__dirname, "..")).join("\n");
    expect(frontendSource).not.toMatch(/window\.(prompt|alert|confirm)\s*\(/);
  });

  test("render in-app split and transfer review controls", () => {
    expect(transactionsSource).toContain("Review category");
    expect(transactionsSource).toContain("Split total");
    expect(transactionsSource).toContain("Matching transaction");
    expect(transactionsSource).toContain("Pair transfer");
  });

  test("new transaction form uses a mode selector for split and transfer", () => {
    expect(transactionFormSource).toContain("Transaction mode");
    expect(transactionFormSource).toContain('value: "split"');
    expect(transactionFormSource).toContain('value: "transfer"');
    expect(transactionFormSource).not.toContain("Transfer to another account");
  });
});
