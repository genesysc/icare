import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { adminOnly } from "../../src/sourcing-admin";

const appWith = (rpcResult: { data: unknown; error: unknown }) => {
  const app = new Hono<any>();
  app.use("*", async (c, next) => { c.set("supabase", { rpc: async () => rpcResult }); await next(); });
  app.use("*", adminOnly);
  app.get("/x", (c) => c.json({ ok: true }));
  return app;
};

describe("adminOnly", () => {
  it("lets an admin through", async () => {
    const r = await appWith({ data: true, error: null }).request("/x");
    expect(r.status).toBe(200);
  });
  it("403s a signed-in non-admin", async () => {
    const r = await appWith({ data: false, error: null }).request("/x");
    expect(r.status).toBe(403);
  });
  it("403s when the check errors (fail closed)", async () => {
    const r = await appWith({ data: null, error: { message: "boom" } }).request("/x");
    expect(r.status).toBe(403);
  });
});
