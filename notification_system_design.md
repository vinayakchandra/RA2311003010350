# Notification System Design

## Objective
Design a backend notification service to deliver event-based alerts reliably and at scale.

## Scope
- Support notification channels (in-app, email, SMS as pluggable providers)
- Trigger notifications from backend domain events
- Persist delivery status for retries and auditability

## High-Level Components
1. API layer for creating and querying notifications
2. Event consumer / scheduler for async processing
3. Worker for channel-wise delivery
4. Retry mechanism with backoff
5. Storage for notification payload, status, and logs

## Data Model (Example)
- `notifications`
  - `id`
  - `user_id`
  - `channel`
  - `title`
  - `message`
  - `status` (`queued`, `sent`, `failed`)
  - `scheduled_at`
  - `sent_at`
  - `created_at`
- `notification_attempts`
  - `id`
  - `notification_id`
  - `attempt_no`
  - `provider_response`
  - `attempted_at`

## Delivery Flow
1. Backend event triggers notification request.
2. Request stored with `queued` status.
3. Worker picks queued jobs.
4. Provider call is attempted.
5. Status is updated (`sent`/`failed`).
6. Failed jobs are retried until max attempts.

## Reliability Considerations
- Idempotency key for duplicate event protection
- Dead-letter queue for repeatedly failing jobs
- Observability with structured logs and metrics

## Security
- Authenticate API requests
- Validate payloads and sanitize message content
- Encrypt sensitive data at rest and in transit

## Future Enhancements
- User notification preferences
- Template management
- Channel fallback strategy (e.g., email if push fails)
