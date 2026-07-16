/**
 * Smoke tests for flowTypes helpers (run: npx tsx scripts/test-flow-types.ts)
 */
import {
  connectionMatches,
  isCollectNode,
  isWaitNode,
  normalizeHandle,
  type FlowConnection,
  type FlowNode,
} from "../src/services/flowTypes";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("OK", msg);
}

assert(normalizeHandle("default") === "main", "default → main");
assert(normalizeHandle("DEFAULT") === "main", "DEFAULT → main");
assert(normalizeHandle("yes") === "yes", "yes stays");
assert(normalizeHandle("sim") === "yes", "sim → yes");
assert(normalizeHandle("nao") === "no", "nao → no");

const conn: FlowConnection = { id: "c1", from: "a", fromHandle: "default", to: "b" };
// default normalizes to main on both sides when comparing via normalize in match
assert(connectionMatches({ ...conn, fromHandle: "main" }, "a", "main"), "main matches main");
assert(!connectionMatches(conn, "a", null), "null handle does not match");
// fromHandle "default" normalizes to main
assert(connectionMatches(conn, "a", "main"), "default fromHandle matches main result");

const waitNode: FlowNode = { id: "w1", type: "wait", subtype: "wait_reply", label: "Wait", data: {} };
const collectNode: FlowNode = {
  id: "c1",
  type: "action",
  subtype: "collect_email",
  label: "Email",
  data: {},
};
assert(isWaitNode(waitNode), "isWaitNode");
assert(isCollectNode(collectNode), "isCollectNode by subtype");

console.log("\nAll flowTypes smoke tests passed.");
