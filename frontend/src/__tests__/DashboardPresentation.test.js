import { formatDashboardAlertText } from "../lib/dashboardPresentation";

describe("dashboard spending insight presentation", () => {
  test("formats raw category IDs without altering amounts or percentages", () => {
    expect(formatDashboardAlertText("Maaser_Tzedakah spending 57% higher than last month"))
      .toBe("Maaser & Tzedakah spending 57% higher than last month");
    expect(formatDashboardAlertText("public_transport spending 278% higher"))
      .toBe("Public Transport spending 278% higher");
  });
  test("preserves already readable alerts and handles missing values", () => {
    expect(formatDashboardAlertText("Charity spending 278% higher than last month"))
      .toBe("Charity spending 278% higher than last month");
    expect(formatDashboardAlertText()).toBe("");
  });
});
