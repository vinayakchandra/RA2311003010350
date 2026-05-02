# Stage 1

## Campus Notifications Microservice - REST API Contract

Base URL: `/api/v1`

This service assumes users are already authenticated elsewhere, so there is no login endpoint here.  
Every request should include:
- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `Accept: application/json`

---

## 1) List Notifications (Inbox)

**GET** `/notifications`

Query params:
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

Use WebSocket to push newly created notifications.

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

- If user is online, push event immediately.
- If user is offline, notification remains in DB and will appear through `GET /notifications`.
- Client should acknowledge delivery:

```json
{
  "event": "notification.ack",
  "data": {
    "id": "ntf_7781"
  }
}
```

# Stage 2

## Persistent Storage Choice

Recommended DB: **PostgreSQL**

Why PostgreSQL works well here:
- Strong consistency for read/unread and delete flows
- Rich indexing options for inbox filters (`userId`, `isRead`, `type`, `createdAt`)
- JSONB support for flexible `meta`
- Reliable pagination and transactional updates

---

## DB Schema

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('placement', 'event', 'result')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_user_type_created
  ON notifications (user_id, type, created_at DESC);
```

---

## Query Mapping to Stage 1 APIs

### 1) `GET /notifications`

```sql
SELECT id, type, title, message, priority, is_read, created_at
FROM notifications
WHERE user_id = $1
  AND deleted_at IS NULL
  AND ($2::text = 'all' OR (is_read = CASE WHEN $2 = 'read' THEN TRUE ELSE FALSE END))
  AND ($3::text = 'all' OR type = $3)
ORDER BY created_at DESC
LIMIT $4 OFFSET $5;
```

Count query:

```sql
SELECT COUNT(*)
FROM notifications
WHERE user_id = $1
  AND deleted_at IS NULL
  AND ($2::text = 'all' OR (is_read = CASE WHEN $2 = 'read' THEN TRUE ELSE FALSE END))
  AND ($3::text = 'all' OR type = $3);
```

### 2) `GET /notifications/{id}`

```sql
SELECT id, type, title, message, priority, meta, is_read, created_at
FROM notifications
WHERE id = $1
  AND user_id = $2
  AND deleted_at IS NULL;
```

### 3) `POST /notifications`

```sql
INSERT INTO notifications (
  id, user_id, type, title, message, priority, meta
) VALUES (
  $1, $2, $3, $4, $5, $6, $7::jsonb
)
RETURNING id, created_at;
```

### 4) `PATCH /notifications/{id}/read`

```sql
UPDATE notifications
SET is_read = TRUE,
    read_at = NOW()
WHERE id = $1
  AND user_id = $2
  AND deleted_at IS NULL
RETURNING id, is_read, read_at;
```

### 5) `PATCH /notifications/read-all`

```sql
UPDATE notifications
SET is_read = TRUE,
    read_at = NOW()
WHERE user_id = $1
  AND deleted_at IS NULL
  AND is_read = FALSE
  AND ($2::text = 'all' OR type = $2);
```

### 6) `DELETE /notifications/{id}` (Soft Delete)

```sql
UPDATE notifications
SET deleted_at = NOW()
WHERE id = $1
  AND user_id = $2
  AND deleted_at IS NULL;
```

---

## Scale Problems and Practical Mitigations

1. Large inbox scans slow down over time.  
Mitigation: composite indexes (above) and keyset pagination for deep browsing.

2. High notification write volume.  
Mitigation: async producer-consumer pipeline, batched inserts, and connection pooling.

3. Read/write contention on heavy users.  
Mitigation: partition by time (`created_at`, monthly) and use read replicas for list endpoints.

4. Storage growth.  
Mitigation: retention policy (archive/purge old read notifications) and partition drop for old data.

5. Realtime fanout pressure.  
Mitigation: publish events via Redis/Kafka and let websocket/SSE nodes scale horizontally.

# Stage 3

## Given Query Review

Given query:

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

Is it logically correct? Yes, for unread rows of a student.  
Is it complete for production? Not quite, if soft-delete exists. You should add `deleted_at IS NULL`.

Why this gets slow at scale (~5,000,000 rows):
- `SELECT *` pulls unnecessary columns, which increases I/O.
- Without a matching composite index, the database scans too many rows.
- Sorting by `createdAt DESC` is expensive when the index does not support that order.

---

## What to Change

Use selected columns + pagination + a matching index.

Optimized query:

```sql
SELECT id, type, title, message, priority, is_read, created_at
FROM notifications
WHERE user_id = $1
  AND is_read = FALSE
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

Recommended index:

```sql
CREATE INDEX idx_notifications_user_unread_created
ON notifications (user_id, is_read, created_at DESC)
WHERE deleted_at IS NULL;
```

Rough complexity:
- Without index: close to `O(N)` plus sort.
- With index: close to `O(log N + K)` where `K` is page size.

---

## Should We Add Indexes on Every Column?

No. That usually hurts more than it helps.

Why:
- Every extra index slows inserts/updates/deletes.
- Disk and memory usage increase.
- Query planner still picks only the index that best matches the query pattern.

Better approach:
- Build indexes around actual filter + sort usage.
- Validate with `EXPLAIN (ANALYZE, BUFFERS)`.

---

## Query: Students with Placement Notification in Last 7 Days

```sql
SELECT DISTINCT user_id
FROM notifications
WHERE type = 'placement'
  AND created_at >= NOW() - INTERVAL '7 days'
  AND deleted_at IS NULL;
```

Optional supporting index:

```sql
CREATE INDEX idx_notifications_type_created
ON notifications (type, created_at DESC)
WHERE deleted_at IS NULL;
```

# Stage 4

## Problem

Right now, if every page load fetches full notifications for every student, the DB gets hammered with repeated reads. Latency goes up and UX drops.

## Recommended Direction (Combined Strategy)

1. **Push-first for active users**  
Use WebSocket/SSE so active clients receive new notifications instantly, instead of constant polling.

2. **Incremental sync API**  
Client sends `since=<lastSeenTimestamp>` and receives only deltas.

3. **Cache hot inbox reads**  
Store first-page inbox and unread summary in Redis per user (example key: `notif:user:{id}:inbox`, short TTL).

4. **Keyset pagination**  
Use cursor pagination (`created_at`, `id`) instead of deep `OFFSET`.

5. **Unread count endpoint**  
Call `/notifications/unread-count` before loading full list.

6. **Read replicas + pooling**  
Serve read-heavy queries from replicas and keep writes on primary.

---

## API/Query Improvements

- `GET /notifications?cursor=<token>&limit=20`
- `GET /notifications?since=2026-05-02T00:00:00Z`
- `GET /notifications/unread-count`

Example keyset query:

```sql
SELECT id, type, title, message, priority, is_read, created_at
FROM notifications
WHERE user_id = $1
  AND deleted_at IS NULL
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT $4;
```

Unread count query:

```sql
SELECT COUNT(*)
FROM notifications
WHERE user_id = $1
  AND is_read = FALSE
  AND deleted_at IS NULL;
```

---

## Tradeoffs

1. **WebSocket/SSE**  
Pros: real-time UX, lower repeated reads  
Cons: connection lifecycle and fanout design complexity

2. **Redis cache**  
Pros: lower latency, reduced DB pressure  
Cons: invalidation complexity, short eventual-consistency window

3. **Incremental sync**  
Pros: smaller payloads, faster load  
Cons: client must track timestamp/cursor correctly

4. **Read replicas**  
Pros: fast read scaling  
Cons: replication lag can show slightly stale data

5. **Keyset pagination**  
Pros: predictable performance at depth  
Cons: random page jumps are less convenient

---

## Expected Impact

- DB QPS drops because full inbox fetch is no longer the default on each load.
- p50 and p95 latencies improve due to smaller queries and caching.
- Users see fresher notifications with faster unread badge updates.

# Stage 5

## Gaps in Current `notify_all`

If the current implementation loops user-by-user and does email + DB + push inline, these are the main issues:

1. No atomicity around external side effects  
If `send_email` fails midway, delivery state becomes inconsistent.

2. Throughput is too low  
Sequentially processing 50,000 users will take too long.

3. No robust retry flow  
Transient provider failures are not recovered automatically.

4. No idempotency  
Retries can produce duplicate emails/push sends.

5. No durable progress tracking  
If process restarts, progress can be lost.

---

## If 200 Emails Fail Midway, What Should Happen?

- Do not rerun the full batch blindly.
- Persist per-recipient status: `pending`, `sent`, `failed`.
- Retry only failed recipients with exponential backoff and max attempts.
- Route permanent failures to DLQ for manual or scheduled replay.

---

## Should DB Save and Email Send Be in One Transaction?

No, not in a distributed ACID transaction.

Reason:
- Email providers are external systems and cannot reliably join DB transactions.
- Use **Transactional Outbox** instead:
  1. Save notifications + outbox events in one DB transaction.
  2. Async workers read outbox and perform email/push with idempotency keys.

This gives consistency and recoverability without blocking on provider latency.

---

## Reliable and Scalable Redesign

1. API receives `Notify All`.
2. Create `campaign` record.
3. In one DB transaction, bulk insert:
   - recipients
   - in-app notifications
   - outbox events
4. Return `202 Accepted` with `campaignId`.
5. Worker pool consumes outbox:
   - `email_sender_worker`
   - `push_sender_worker`
6. Workers apply idempotency key `(campaign_id, student_id, channel)`, retry transient failures, and persist final state.
7. Send final hard failures to DLQ.

---

## Revised Pseudocode

```text
function notify_all(campaign_input):
    campaign_id = uuid()

    db.transaction:
        insert into campaigns(campaign_id, message, status='queued')
        recipients = fetch_target_students(campaign_input)

        bulk_insert campaign_recipients(
            campaign_id, student_id, status='pending'
        )

        bulk_insert notifications(
            id, user_id, type='placement', title, message, is_read=false
        )

        bulk_insert outbox(
            event_id, campaign_id, student_id, channel, payload, status='pending'
        ) for channel in ['email', 'push']

    enqueue("outbox_dispatch", campaign_id)
    return { campaignId: campaign_id, status: "accepted" }


worker outbox_dispatch():
    events = fetch_pending_outbox_batch(limit=500)
    parallel_for event in events:
        if already_processed(event.idempotency_key):
            mark_outbox_sent(event)
            continue

        result = send_channel(event.channel, event.payload)
        if result.success:
            mark_outbox_sent(event)
            mark_recipient_channel_sent(event.campaign_id, event.student_id, event.channel)
        else if result.retryable and event.retry_count < MAX_RETRIES:
            schedule_retry(event, backoff(event.retry_count))
        else:
            mark_outbox_failed(event)
            move_to_dlq(event)

    update_campaign_status(campaign_id):
        if all recipients complete -> status='completed'
        if some failed after max retries -> status='completed_with_failures'
```

---

## Performance and Resilience Notes

- Tune batch sizes (for example 500-2000 events per poll).
- Partition queues by campaign or user hash as volume grows.
- Track metrics: success rate, retries, DLQ count, p95 send latency.
- Keep API asynchronous and expose `GET /campaigns/{campaignId}/status`.

# Stage 6

## Priority Inbox (Top 10)

Implementation file:
- `notification_app_be/stage6_priority_inbox.js`

What this script does:
1. Gets bearer token from `/evaluation-service/auth`.
2. Calls protected endpoint:
   - `GET http://20.207.122.201/evaluation-service/notifications`
   - Header: `Authorization: Bearer <access_token>`
3. Filters unread notifications.
4. Scores each notification by:
   - Type weight: `Placement > Result > Event`
   - Recency: newer items rank higher within same type
5. Prints top 10 scored notifications.

## Efficient Top-10 Maintenance for Streaming Input

For continuous notification streams, keep a min-heap of size 10:
- Compute score for each unread notification.
- If heap size < 10, push directly.
- Otherwise compare with heap min and replace only when higher.

Per-notification update cost is `O(log 10)`, which is effectively constant.  
This avoids repeatedly sorting the full list and holds up well at high event rates.
