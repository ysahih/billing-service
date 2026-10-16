import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { fixture, signedRequest } from "../helpers/stripe";

beforeEach(resetDb);

describe("webhook API version", () => {
  it("rejects events rendered in a different API version, without processing them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest(fixture("invoice.paid", { api_version: "2023-10-16" })));
    expect(res.status).toBe(400);
    expect(await db.webhookEvent.count()).toBe(0);
  });
});
