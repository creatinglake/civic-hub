/**
 * Test flow script — validates the full civic hub lifecycle:
 *   1. Create a civic.vote process
 *   2. Submit votes
 *   3. Close the vote
 *   4. Fetch and verify events
 *
 * Run: npm run test:flow  (server must be running on port 3000)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

function log(label: string, obj: unknown) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(JSON.stringify(obj, null, 2));
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log("🏛️  Civic Hub — Test Flow\n");
  console.log(`Target: ${BASE}`);

  // 1. Health check
  console.log("\n── Step 1: Health check ──");
  const health = await request("GET", "/health");
  assert(health.status === 200, "Health check returns 200");

  // 2. Create a vote process
  console.log("\n── Step 2: Create civic.vote process ──");
  const createRes = await request("POST", "/process", {
    definition: { type: "civic.vote", version: "0.1" },
    title: "Test Vote: Park Improvements",
    description: "Should we add benches to the park?",
    createdBy: "user:testrunner",
    state: { options: ["yes", "no", "abstain"] },
  });
  assert(createRes.status === 201, "Process created with 201");
  assert(createRes.data.id !== undefined, "Process has an ID");
  assert(createRes.data.status === "open", "Process status is open");

  const processId = createRes.data.id;
  log("Created Process", createRes.data);

  // 3. Submit votes
  console.log("\n── Step 3: Submit votes ──");
  const votes = [
    { actor: "user:alice", option: "yes" },
    { actor: "user:bob", option: "no" },
    { actor: "user:carol", option: "yes" },
  ];

  for (const v of votes) {
    const voteRes = await request("POST", `/process/${processId}/action`, {
      type: "vote.submit",
      actor: v.actor,
      payload: { option: v.option },
    });
    assert(voteRes.status === 200, `${v.actor} voted ${v.option}`);
  }

  // 4. Get process state
  console.log("\n── Step 4: Get process state ──");
  const getRes = await request("GET", `/process/${processId}`);
  assert(getRes.status === 200, "Process retrieved");
  assert(getRes.data.state.type === "civic.vote", "state.type is civic.vote");
  assert(getRes.data.state.status === "open", "state.status is open");
  log("Process State", getRes.data);

  // 5. Close the vote
  console.log("\n── Step 5: Close vote ──");
  const closeRes = await request("POST", `/process/${processId}/action`, {
    type: "vote.close",
    actor: "user:testrunner",
    payload: {},
  });
  assert(closeRes.status === 200, "Vote closed");
  assert(closeRes.data.process.status === "closed", "Process status is closed");
  assert(typeof closeRes.data.result.total_votes === "number", "Result uses snake_case total_votes");
  log("Tally", closeRes.data.result);

  // 5b. Validate: cannot vote on closed process
  console.log("\n── Step 5b: Validate closed process guards ──");
  const lateVote = await request("POST", `/process/${processId}/action`, {
    type: "vote.submit",
    actor: "user:dave",
    payload: { option: "yes" },
  });
  assert(lateVote.status === 400, "Voting on closed process returns 400");

  const doubleClose = await request("POST", `/process/${processId}/action`, {
    type: "vote.close",
    actor: "user:testrunner",
    payload: {},
  });
  assert(doubleClose.status === 400, "Closing already-closed process returns 400");

  // 6. Fetch all events
  console.log("\n── Step 6: Fetch all events ──");
  const eventsRes = await request("GET", "/events");
  assert(eventsRes.status === 200, "Events retrieved");
  assert(eventsRes.data.count >= 5, `Got ${eventsRes.data.count} events (expected ≥5)`);

  // 7. Verify event structure
  console.log("\n── Step 7: Verify event structure ──");
  const latestEvent = eventsRes.data.events[eventsRes.data.events.length - 1];
  assert(typeof latestEvent.id === "string", "Event has id");
  assert(typeof latestEvent.type === "string", "Event has type");
  assert(typeof latestEvent.actor?.id === "string", "Event has actor.id");
  assert(typeof latestEvent.object?.type === "string", "Event has object.type");
  assert(typeof latestEvent.context?.process_id === "string", "Event has context.process_id");
  assert(typeof latestEvent.context?.hub_id === "string", "Event has context.hub_id");
  assert(typeof latestEvent.metadata?.created_at === "string", "Event has metadata.created_at");
  assert(typeof latestEvent.metadata?.source === "string", "Event has metadata.source");

  // 7b. Verify standardized object types
  console.log("\n── Step 7b: Verify standardized object types ──");
  const eventTypes = eventsRes.data.events.map((e: any) => e.type);
  assert(eventTypes.includes("vote.created"), "Has vote.created event");
  assert(eventTypes.includes("vote.submitted"), "Has vote.submitted event");
  assert(eventTypes.includes("vote.closed"), "Has vote.closed event");

  const createdEvt = eventsRes.data.events.find((e: any) => e.type === "vote.created");
  assert(createdEvt.object.type === "civic.process", "vote.created object type is civic.process");
  assert(createdEvt.object.process_type === "civic.vote", "vote.created has process_type");
  assert(typeof createdEvt.object.title === "string", "vote.created has title");

  const submittedEvt = eventsRes.data.events.find((e: any) => e.type === "vote.submitted");
  assert(submittedEvt.object.type === "civic.vote", "vote.submitted object type is civic.vote");
  assert("previous_vote" in submittedEvt.object, "vote.submitted uses snake_case previous_vote");

  const closedEvt = eventsRes.data.events.find((e: any) => e.type === "vote.closed");
  assert(closedEvt.object.type === "civic.vote.result", "vote.closed object type is civic.vote.result");
  assert("total_votes" in closedEvt.object, "vote.closed uses snake_case total_votes");

  const updatedEvt = eventsRes.data.events.find((e: any) => e.type === "process.updated");
  assert(updatedEvt !== undefined, "Has process.updated event");
  assert(updatedEvt.object.type === "civic.process", "process.updated object type is civic.process");
  assert(updatedEvt.object.status === "closed", "process.updated reflects new status");

  log("Sample Event (vote.created)", createdEvt);
  log("Sample Event (vote.submitted)", submittedEvt);
  log("Sample Event (vote.closed)", closedEvt);
  log("Sample Event (process.updated)", updatedEvt);

  // 8. Filter events by process
  console.log("\n── Step 8: Filter events by process_id ──");
  const filteredRes = await request("GET", `/events?process_id=${processId}`);
  assert(filteredRes.status === 200, "Filtered events retrieved");
  assert(filteredRes.data.count >= 5, `Filtered: ${filteredRes.data.count} events for this process`);

  // 8b. Filter events by type
  console.log("\n── Step 8b: Filter events by type ──");
  const typeFilterRes = await request("GET", "/events?type=vote.submitted");
  assert(typeFilterRes.status === 200, "Type-filtered events retrieved");
  assert(typeFilterRes.data.count === 3, `Got ${typeFilterRes.data.count} vote.submitted events (expected 3)`);

  // 8c. Combine filters
  console.log("\n── Step 8c: Combine filters ──");
  const comboRes = await request("GET", `/events?process_id=${processId}&type=vote.closed`);
  assert(comboRes.status === 200, "Combined filter works");
  assert(comboRes.data.count === 1, `Got ${comboRes.data.count} vote.closed for this process (expected 1)`);

  // 9. Discovery manifest
  console.log("\n── Step 9: Discovery manifest ──");
  const manifestRes = await request("GET", "/.well-known/civic.json");
  assert(manifestRes.status === 200, "Manifest retrieved");
  assert(manifestRes.data.feeds?.events !== undefined, "Manifest has feeds.events");
  log("Manifest", manifestRes.data);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All tests passed!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

run().catch((err) => {
  console.error("\n❌ Test flow failed:", err.message);
  process.exit(1);
});
