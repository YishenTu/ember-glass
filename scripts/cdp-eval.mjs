// Evaluate a JS expression in Paseo's renderer and print the result.
// Paseo must be started with: open -a Paseo --args --remote-debugging-port=9333
// Usage: node scripts/cdp-eval.mjs '<expression>'   (PORT env overrides 9333)
const expr = process.argv[2];
if (!expr) {
  console.error("usage: node scripts/cdp-eval.mjs '<expression>'");
  process.exit(2);
}
const port = process.env.PORT ?? 9333;
const targets = await (await fetch(`http://localhost:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({
  id: 1,
  method: "Runtime.evaluate",
  params: { expression: expr, returnByValue: true, awaitPromise: true },
}));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id !== 1) return;
  const r = m.result;
  console.log(JSON.stringify(r.exceptionDetails ?? r.result.value ?? r.result, null, 1));
  process.exit(r.exceptionDetails ? 1 : 0);
};
