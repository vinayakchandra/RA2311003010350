# Logging Middleware

Reusable logger function for the evaluation API:

`Log(stack, level, package, message)`

## Usage

```js
const { Log } = require("./index");

async function run() {
  const res = await Log(
    "backend",
    "error",
    "handler",
    "received string, expected bool"
  );
  console.log(res);
}

run().catch(console.error);
```

## Notes

- Values are validated exactly as per the given constraints.
- Optional auth token can be passed via `LOG_API_TOKEN`:
  - `Authorization: Bearer <token>`
