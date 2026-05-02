# Vehicle Maintenance Scheduler

This service:
1. Fetches depots from `GET /evaluation-service/depots`
2. Fetches tasks per depot from `GET /evaluation-service/depots/{depotId}/tasks` (default template)
3. Solves optimal task selection using 0/1 knapsack
4. Logs lifecycle events via `logging_middleware/Log(...)`

## Run

```bash
export ACCESS_TOKEN='<bearer_access_token>'
node vehicle_maintence_scheduler/index.js
```

Optional endpoint override:

```bash
export TASKS_URL_TEMPLATE='http://20.207.122.201/evaluation-service/tasks?depotId={depotId}'
```

## Output

Prints JSON summary per depot:
- available hours
- selected task IDs
- total selected hours
- max total impact score
