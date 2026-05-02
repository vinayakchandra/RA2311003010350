"use strict";

const BASE_URL = "http://20.207.122.201/evaluation-service";
const AUTH_URL = `${BASE_URL}/auth`;
const NOTIFICATIONS_URL = `${BASE_URL}/notifications`;

const AUTH_PAYLOAD = {
  email: "vs9419@srmist.edu.in",
  name: "vinayak chandra suryavanshi",
  rollNo: "ra2311003010350",
  accessCode: "QkbpxH",
  clientID: "7759367b-2aa1-4a6c-ae11-ae18b0bf241c",
  clientSecret: "PbKzBnbUvXHQkHFe",
};

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

async function getAccessToken() {
  if (process.env.ACCESS_TOKEN) return process.env.ACCESS_TOKEN;
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(AUTH_PAYLOAD),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

function scoreNotification(n) {
  const weight = TYPE_WEIGHT[n.Type] || 0;
  const ts = new Date(n.Timestamp).getTime();
  return weight * 1e13 + ts;
}

function topN(notifications, n) {
  return notifications
    .filter((x) => !x.IsRead)
    .map((x) => ({ ...x, _score: scoreNotification(x) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, n);
}

async function run() {
  const token = await getAccessToken();
  const res = await fetch(NOTIFICATIONS_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const items = json.notifications || [];
  const top10 = topN(items, 10);
  process.stdout.write(JSON.stringify({ top10 }, null, 2) + "\n");
}

run().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
