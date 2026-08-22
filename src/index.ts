import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/db-check", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS ok").first();
  return c.json({ db: result });
});

export default app;
