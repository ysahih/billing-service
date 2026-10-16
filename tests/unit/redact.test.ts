import { describe, expect, it } from "vitest";
import { maskEmail, redactPayload } from "@/lib/redact";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => expect(maskEmail("youssef@example.com")).toBe("y•••@example.com"));
  it("does not echo malformed input", () => expect(maskEmail("@nope")).toBe("•••"));
});

describe("redactPayload", () => {
  const session = {
    id: "cs_test_1",
    customer: "cus_1",
    customer_email: "Ada.Lovelace@example.com",
    customer_details: {
      email: "ada@example.com",
      name: "Ada Lovelace",
      phone: "+44 20 0000 0000",
      address: { line1: "1 Analytical St", city: "London" },
      tax_ids: [{ type: "gb_vat", value: "GB123" }],
    },
    lines: [{ description: "Sent to ada@example.com", amount: 4900 }],
    metadata: { plan: "pro" },
  };
  const out = JSON.stringify(redactPayload(session));

  it("leaves no email, name, phone, address or tax id", () => {
    for (const secret of ["Lovelace@", "ada@", "Ada Lovelace", "+44", "Analytical", "GB123"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("masks emails wherever they appear, including inside free text", () => {
    expect(out).toContain('"customer_email":"A•••@example.com"');
    expect(out).toContain("Sent to a•••@example.com");
  });

  it("keeps the billing data an operator needs", () => {
    expect(redactPayload(session)).toMatchObject({ id: "cs_test_1", customer: "cus_1", metadata: { plan: "pro" }, lines: [{ amount: 4900 }] });
  });

  it("does not mutate its input", () => {
    redactPayload(session);
    expect(session.customer_details.name).toBe("Ada Lovelace");
  });

  it("leaves null personal fields as null", () => expect(redactPayload({ customer_name: null })).toEqual({ customer_name: null }));
});
