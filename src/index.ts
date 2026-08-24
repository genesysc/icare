import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/db-check", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS ok").first();
  return c.json({ db: result });
});

app.get("/media-check", async (c) => {
  const list = await c.env.MEDIA.list({ limit: 1 });
  return c.json({ bucket: "icare", objects: list.objects.length });
});

export default app;
