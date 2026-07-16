/**
 * Smoke tests — flowTypes runtime helpers
 * Run: npx tsx scripts/test-flow-runtime.ts
 */
import {
  connectionMatches,
  extractInteractiveOptions,
  graphHasCycle,
  matchInteractiveOption,
  normalizeHandle,
  parseInteractiveInbound,
  resolveNextConnections,
  validateFlowGraph,
  type FlowConnection,
  type FlowNode,
} from "../src/services/flowTypes";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("OK", msg);
}

// handles
assert(normalizeHandle("default") === "main", "default→main");
assert(normalizeHandle("sim") === "yes", "sim→yes");

// exact connection match (no accidental main bleed)
const yes: FlowConnection = { id: "1", from: "c1", fromHandle: "yes", to: "a" };
const no: FlowConnection = { id: "2", from: "c1", fromHandle: "no", to: "b" };
const main: FlowConnection = { id: "3", from: "c1", fromHandle: "main", to: "m" };
assert(connectionMatches(yes, "c1", "yes"), "yes matches yes");
assert(!connectionMatches(yes, "c1", "no"), "yes does not match no");
assert(!connectionMatches(main, "c1", "yes"), "main does not match yes (exact)");

const nextYes = resolveNextConnections([yes, no, main], "c1", "yes");
assert(nextYes.length === 1 && nextYes[0].to === "a", "resolveNext yes → a");
const nextMissing = resolveNextConnections([main], "c1", "yes");
assert(nextMissing.length === 1 && nextMissing[0].to === "m", "fallback to main when branch missing");

// interactive parse
const btn = parseInteractiveInbound("[button_reply] Quero (id:opt_quero)");
assert(btn.kind === "button" && btn.id === "opt_quero", "parse button id");
const list = parseInteractiveInbound("[list_reply] Item A (id:row_1)");
assert(list.kind === "list" && list.id === "row_1", "parse list id");
const num = parseInteractiveInbound("2");
assert(num.kind === "number_choice", "number choice");

const options = [
  { id: "opt_1", label: "Opção 1" },
  { id: "opt_2", label: "Opção 2" },
];
assert(matchInteractiveOption(btn, [{ id: "opt_quero", label: "Quero" }]).handle === "opt_quero", "match by id");
assert(matchInteractiveOption(num, options).handle === "opt_2", "match by number 2");

// extract from mensagemSteps
const extracted = extractInteractiveOptions({
  mensagemSteps: [
    {
      tipo: "botoes",
      caption: "Escolha",
      buttons: [
        { id: "s", label: "Sim" },
        { id: "n", label: "Não" },
      ],
    },
  ],
});
assert(extracted.length === 2 && extracted[0].id === "s", "extract buttons from steps");

// cycle
const nodes: FlowNode[] = [
  { id: "a", type: "trigger", subtype: "x", label: "A", data: {} },
  { id: "b", type: "action", subtype: "y", label: "B", data: {} },
];
const cycleConns: FlowConnection[] = [
  { id: "1", from: "a", fromHandle: "main", to: "b" },
  { id: "2", from: "b", fromHandle: "main", to: "a" },
];
assert(graphHasCycle(nodes, cycleConns), "detects cycle");

const okGraph = validateFlowGraph(
  [
    { id: "t", type: "trigger", subtype: "message_received", label: "T", data: {} },
    { id: "e", type: "end", subtype: "end", label: "E", data: {} },
  ],
  [{ id: "c", from: "t", fromHandle: "main", to: "e" }],
);
assert(okGraph.ok, "valid minimal graph");

const bad = validateFlowGraph(
  [{ id: "t", type: "trigger", subtype: "x", label: "T", data: {} }],
  [],
);
assert(!bad.ok && bad.errors.some((e) => /encerramento/i.test(e)), "missing end fails validation");

console.log("\nAll flow runtime smoke tests passed.");
