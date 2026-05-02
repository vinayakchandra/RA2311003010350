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

async function Log(stack, level, packageName, message) {
  assertValidPayload(stack, level, packageName, message);

  const payload = {
    stack,
    level,
    package: packageName,
    message,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  const bearerToken = process.env.LOG_API_TOKEN;
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
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
