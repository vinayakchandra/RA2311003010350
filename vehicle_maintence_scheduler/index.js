"use strict";

const { Log } = require("../logging_middleware");

const BASE_URL = "http://20.207.122.201/evaluation-service";
const DEPOTS_URL = `${BASE_URL}/depots`;
const VEHICLES_URL = `${BASE_URL}/vehicles`;
const TASKS_URL_TEMPLATE =
  process.env.TASKS_URL_TEMPLATE || `${BASE_URL}/depots/{depotId}/tasks`;
const AUTH_URL = `${BASE_URL}/auth`;

const DEFAULT_AUTH_PAYLOAD = {
  email: "vs9419@srmist.edu.in",
  name: "vinayak chandra suryavanshi",
  rollNo: "ra2311003010350",
  accessCode: "QkbpxH",
  clientID: "7759367b-2aa1-4a6c-ae11-ae18b0bf241c",
  clientSecret: "PbKzBnbUvXHQkHFe",
};

async function ensureAccessToken() {
  if (process.env.ACCESS_TOKEN || process.env.LOG_API_TOKEN) return;

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEFAULT_AUTH_PAYLOAD),
  });

  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Auth API returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.access_token) {
    throw new Error(`Failed to get access token (${res.status}): ${text}`);
  }

  process.env.ACCESS_TOKEN = json.access_token;
}

function authHeaders() {
  const token = process.env.ACCESS_TOKEN || process.env.LOG_API_TOKEN;
  if (!token) {
    throw new Error("Set ACCESS_TOKEN (bearer token) before running scheduler.");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status}): ${text}`);
  }
  return json;
}

function solveKnapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i += 1) {
    const t = tasks[i - 1].duration;
    const s = tasks[i - 1].score;
    for (let h = 0; h <= capacity; h += 1) {
      dp[i][h] = dp[i - 1][h];
      if (t <= h) {
        dp[i][h] = Math.max(dp[i][h], dp[i - 1][h - t] + s);
      }
    }
  }

  const selected = [];
  let h = capacity;
  for (let i = n; i >= 1; i -= 1) {
    if (dp[i][h] !== dp[i - 1][h]) {
      selected.push(tasks[i - 1]);
      h -= tasks[i - 1].duration;
    }
  }
  selected.reverse();

  const totalHours = selected.reduce((sum, x) => sum + x.duration, 0);
  const totalScore = selected.reduce((sum, x) => sum + x.score, 0);
  return { selected, totalHours, totalScore };
}

function normalizeTasks(rawTasks) {
  return rawTasks.map((t, idx) => ({
    id: t.TaskID ?? t.taskId ?? t.ID ?? t.id ?? idx + 1,
    duration: Number(
      t.Duration ?? t.duration ?? t.MechanicHours ?? t.mechanicHours ?? 0
    ),
    score: Number(t.Impact ?? t.impact ?? t.ImpactScore ?? t.score ?? 0),
    raw: t,
  }));
}

async function run() {
  await ensureAccessToken();
  await Log("backend", "info", "service", "vehicle scheduler started");
  const depotsResp = await fetchJson(DEPOTS_URL);
  const depots = depotsResp.depots || depotsResp.data || [];
  await Log("backend", "info", "service", `depots fetched count=${depots.length}`);
  const vehiclesResp = await fetchJson(VEHICLES_URL);
  const allVehicles = normalizeTasks(vehiclesResp.vehicles || []);
  await Log(
    "backend",
    "info",
    "service",
    `vehicles fetched count=${allVehicles.length}`
  );

  const results = [];
  for (const depot of depots) {
    const depotId = depot.ID ?? depot.id;
    const capacity = Number(
      depot.MechanicHours ?? depot.mechanicHours ?? depot.capacity ?? 0
    );

    let tasks = allVehicles.filter(
      (t) => t.duration > 0 && t.score >= 0
    );
    if (tasks.length === 0) {
      const tasksUrl = TASKS_URL_TEMPLATE.replace("{depotId}", String(depotId));
      await Log("backend", "debug", "service", `fallback depot=${depotId}`);
      const tasksResp = await fetchJson(tasksUrl);
      const rawTasks = tasksResp.tasks || tasksResp.vehicles || tasksResp.data || [];
      tasks = normalizeTasks(rawTasks).filter((t) => t.duration > 0 && t.score >= 0);
    }

    const best = solveKnapsack(tasks, capacity);
    results.push({
      depotId,
      availableHours: capacity,
      selectedCount: best.selected.length,
      totalHours: best.totalHours,
      totalScore: best.totalScore,
      selectedTaskIds: best.selected.map((x) => x.id),
    });

    await Log(
      "backend",
      "info",
      "service",
      `depot=${depotId} selected=${best.selected.length} score=${best.totalScore}`
    );
  }

  await Log("backend", "info", "service", "vehicle scheduler completed");
  return { results };
}

run()
  .then((out) => {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  })
  .catch(async (err) => {
    try {
      await Log("backend", "error", "handler", err.message);
    } catch (_) {}
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
