"use strict";

const LOG_ENDPOINT = "http://20.207.122.201/evaluation-service/logs";

const ALLOWED_STACKS = new Set(["backend", "frontend"]);
const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);
const BACKEND_ONLY_PACKAGES = new Set([
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
]);
const FRONTEND_ONLY_PACKAGES = new Set([
  "api",
  "component",
  "hook",
  "page",
  "state",
  "style",
]);
const SHARED_PACKAGES = new Set(["auth", "config", "middleware", "utils"]);

function isValidPackageForStack(stack, packageName) {
  if (SHARED_PACKAGES.has(packageName)) return true;
  if (stack === "backend") return BACKEND_ONLY_PACKAGES.has(packageName);
  if (stack === "frontend") return FRONTEND_ONLY_PACKAGES.has(packageName);
  return false;
}

function assertValidPayload(stack, level, packageName, message) {
  if (!ALLOWED_STACKS.has(stack)) {
    throw new Error("Invalid stack");
  }

  if (!ALLOWED_LEVELS.has(level)) {
    throw new Error("Invalid level");
  }

  if (!isValidPackageForStack(stack, packageName)) {
    throw new Error(`Invalid package "${packageName}" for stack "${stack}"`);
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("message must be a non-empty string");
  }
}

function normalizeMessage(message) {
  const cleaned = String(message).replace(/\s+/g, " ").trim();
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 45)}...`;
}

async function Log(stack, level, packageName, message) {
  const normalizedMessage = normalizeMessage(message);
  assertValidPayload(stack, level, packageName, normalizedMessage);

  const payload = {
    stack,
    level,
    package: packageName,
    message: normalizedMessage,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  const bearerToken = process.env.LOG_API_TOKEN || process.env.ACCESS_TOKEN;
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    throw new Error(
      "Missing bearer token. Set LOG_API_TOKEN or ACCESS_TOKEN environment variable."
    );
  }

  const response = await fetch(LOG_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Log API failed (${response.status}): ${text}`);
  }

  return response.json();
}

module.exports = {
  Log,
};
