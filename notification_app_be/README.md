# Notification App BE

Run:

```bash
node notification_app_be/index.js
```

Environment:
- `ACCESS_TOKEN` (or `LOG_API_TOKEN`) for logging middleware auth
- `PORT` (optional, default `3001`)

Base API:
- `/api/v1/notifications`

Realtime:
- `GET /api/v1/notifications/stream` (SSE)
