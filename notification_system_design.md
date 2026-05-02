# Stage 1

## Campus Notifications Microservice - REST API Contract

Base URL: `/api/v1`

Auth Model:
- Pre-authorized users (no login endpoint in this service)
- Every request includes:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
  - `Accept: application/json`

---

## 1) List Notifications (Inbox)

**GET** `/notifications`

Query Params:
- `page` (number, default `1`)
- `limit` (number, default `20`, max `100`)
- `status` (`unread|read|all`, default `all`)
- `type` (`placement|event|result|all`, default `all`)

Response `200`:

```json
{
  "page": 1,
  "limit": 20,
  "total": 125,
  "items": [
    {
      "id": "ntf_001",
      "type": "placement",
      "title": "Placement Drive: ABC Corp",
      "message": "Online test starts at 10:00 AM tomorrow.",
      "priority": "high",
      "isRead": false,
      "createdAt": "2026-05-02T09:30:00Z"
    }
  ]
}
```

---

## 2) Get Notification by ID

**GET** `/notifications/{notificationId}`

Response `200`:

```json
{
  "id": "ntf_001",
  "type": "placement",
  "title": "Placement Drive: ABC Corp",
  "message": "Online test starts at 10:00 AM tomorrow.",
  "priority": "high",
  "meta": {
    "company": "ABC Corp",
    "batch": "2027"
  },
  "isRead": false,
  "createdAt": "2026-05-02T09:30:00Z"
}
```

Response `404`:

```json
{
  "error": "NOT_FOUND",
  "message": "Notification not found"
}
```

---

## 3) Mark One Notification as Read

**PATCH** `/notifications/{notificationId}/read`

Request:

```json
{
  "isRead": true
}
```

Response `200`:

```json
{
  "id": "ntf_001",
  "isRead": true,
  "readAt": "2026-05-02T10:10:00Z"
}
```

---

## 4) Mark All Notifications as Read

**PATCH** `/notifications/read-all`

Request:

```json
{
  "type": "all"
}
```

Response `200`:

```json
{
  "updatedCount": 18
}
```

---

## 5) Delete Notification

**DELETE** `/notifications/{notificationId}`

Response `200`:

```json
{
  "deleted": true
}
```

---

## 6) Create Notification (Internal/Admin/Event Producer)

**POST** `/notifications`

Request:

```json
{
  "userId": "st_1022",
  "type": "result",
  "title": "Semester 6 Result Published",
  "message": "Your result is now available on portal.",
  "priority": "medium",
  "meta": {
    "semester": 6
  }
}
```

Response `201`:

```json
{
  "id": "ntf_7781",
  "created": true,
  "createdAt": "2026-05-02T10:20:00Z"
}
```

---

## Common Error Response

```json
{
  "error": "VALIDATION_ERROR",
  "message": "type must be one of placement,event,result"
}
```

Status codes:
- `400` validation failure
- `401` invalid/missing token
- `403` forbidden
- `404` not found
- `500` server error

---

## Real-Time Notification Mechanism

Use WebSocket for push updates.

### WebSocket Endpoint

`GET /ws/notifications?token=<bearer_token>`

### Server-to-Client Event Payload

```json
{
  "event": "notification.created",
  "data": {
    "id": "ntf_7781",
    "type": "event",
    "title": "Hackathon Starts Today",
    "message": "Reporting time is 9:00 AM.",
    "priority": "high",
    "createdAt": "2026-05-02T10:30:00Z"
  }
}
```

### Delivery Rules

- On new notification, push event immediately to online users.
- If user is offline, notification remains in DB and appears via `GET /notifications`.
- Client should acknowledge event with:

```json
{
  "event": "notification.ack",
  "data": {
    "id": "ntf_7781"
  }
}
```
