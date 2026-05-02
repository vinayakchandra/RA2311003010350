"use strict";

const express = require("express");
const crypto = require("crypto");
const { Log } = require("../logging_middleware");

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_URL = "http://20.207.122.201/evaluation-service/auth";
const DEFAULT_AUTH_PAYLOAD = {
  email: "vs9419@srmist.edu.in",
  name: "vinayak chandra suryavanshi",
  rollNo: "ra2311003010350",
  accessCode: "QkbpxH",
  clientID: "7759367b-2aa1-4a6c-ae11-ae18b0bf241c",
  clientSecret: "PbKzBnbUvXHQkHFe",
};

app.use(express.json());

const notifications = [];
const sseClients = new Set();

function nowIso() {
  return new Date().toISOString();
}

async function ensureAccessToken() {
  if (process.env.ACCESS_TOKEN || process.env.LOG_API_TOKEN) return;
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEFAULT_AUTH_PAYLOAD),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || !json.access_token) {
    throw new Error(`Failed auth token (${res.status})`);
  }
  process.env.ACCESS_TOKEN = json.access_token;
}

async function safeLog(stack, level, pkg, message) {
  try {
    await ensureAccessToken();
    await Log(stack, level, pkg, message);
  } catch (_) {}
}

function pushRealtime(event, data) {
  const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function error(res, status, message) {
  return res.status(status).json({ error: "VALIDATION_ERROR", message });
}

function toView(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    isRead: n.isRead,
    createdAt: n.createdAt,
  };
}

app.get("/health", async (_, res) => {
  await safeLog("backend", "info", "route", "health check");
  res.json({ ok: true });
});

app.get("/api/v1/notifications", async (req, res) => {
  await safeLog("backend", "info", "route", "list notifications");
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const status = String(req.query.status || "all");
  const type = String(req.query.type || "all");

  let items = [...notifications];
  if (status === "read") items = items.filter((x) => x.isRead);
  if (status === "unread") items = items.filter((x) => !x.isRead);
  if (type !== "all") items = items.filter((x) => x.type === type);

  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit).map(toView);
  res.json({ page, limit, total, items: paged });
});

app.get("/api/v1/notifications/:id", async (req, res) => {
  await safeLog("backend", "info", "route", "get notification");
  const n = notifications.find((x) => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: "NOT_FOUND", message: "Notification not found" });
  res.json(n);
});

app.post("/api/v1/notifications", async (req, res) => {
  await safeLog("backend", "info", "route", "create notification");
  const { userId, type, title, message, priority = "medium", meta = {} } = req.body;
  if (!userId || !type || !title || !message) return error(res, 400, "userId, type, title, message are required");
  if (!["placement", "event", "result"].includes(type)) return error(res, 400, "type must be one of placement,event,result");
  if (!["low", "medium", "high"].includes(priority)) return error(res, 400, "priority must be one of low,medium,high");

  const n = {
    id: `ntf_${crypto.randomUUID()}`,
    userId,
    type,
    title,
    message,
    priority,
    meta,
    isRead: false,
    createdAt: nowIso(),
  };
  notifications.unshift(n);
  pushRealtime("notification.created", toView(n));
  res.status(201).json({ id: n.id, created: true, createdAt: n.createdAt });
});

app.patch("/api/v1/notifications/:id/read", async (req, res) => {
  await safeLog("backend", "info", "route", "mark notification read");
  const n = notifications.find((x) => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: "NOT_FOUND", message: "Notification not found" });
  n.isRead = true;
  n.readAt = nowIso();
  res.json({ id: n.id, isRead: true, readAt: n.readAt });
});

app.patch("/api/v1/notifications/read-all", async (req, res) => {
  await safeLog("backend", "info", "route", "mark all read");
  const type = req.body.type || "all";
  let count = 0;
  for (const n of notifications) {
    if (type === "all" || n.type === type) {
      if (!n.isRead) {
        n.isRead = true;
        n.readAt = nowIso();
        count += 1;
      }
    }
  }
  res.json({ updatedCount: count });
});

app.delete("/api/v1/notifications/:id", async (req, res) => {
  await safeLog("backend", "warn", "route", "delete notification");
  const idx = notifications.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "NOT_FOUND", message: "Notification not found" });
  notifications.splice(idx, 1);
  res.json({ deleted: true });
});

app.get("/api/v1/notifications/stream", async (req, res) => {
  await safeLog("backend", "info", "route", "sse stream connect");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
  req.on("close", () => sseClients.delete(res));
});

app.use(async (err, _req, res, _next) => {
  try {
    await safeLog("backend", "error", "handler", "notification api error");
  } catch (_) {}
  res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
});

app.listen(PORT, async () => {
  try {
    await ensureAccessToken();
    await safeLog("backend", "info", "service", "notification api started");
  } catch (_) {}
  process.stdout.write(`notification_app_be running on port ${PORT}\n`);
});
