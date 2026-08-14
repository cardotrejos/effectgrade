import { serve } from "@hono/node-server"
import { Hono } from "hono"

const app = new Hono()

app.get("/health", (context) => context.text("ok"))

serve({ fetch: app.fetch, port: 3000 })
