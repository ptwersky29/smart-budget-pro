import { formatApiError } from "../lib/api";

describe("formatApiError", () => {
  test("explains request timeouts", () => {
    expect(formatApiError({ code: "ECONNABORTED", request: {} })).toMatch(/took too long/i);
  });

  test("explains network failures", () => {
    expect(formatApiError({ request: {}, message: "Network Error" })).toMatch(/temporarily unavailable/i);
  });

  test("preserves API details and request references", () => {
    const error = {
      response: {
        data: { detail: "Email already registered", request_id: "req-123" },
        headers: {},
      },
    };
    expect(formatApiError(error)).toBe("Email already registered (Ref req-123)");
  });
});
