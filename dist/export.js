(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShipLoopExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const json = (value) => JSON.stringify(value, null, 2);
  const quoted = (value) => JSON.stringify(value === undefined ? null : value);
  const category = (card) => card.category || (['context', 'feedback', 'task'].includes(card.type) ? 'data' : 'execution');
  const pins = (card, direction) => card.pins?.[direction] || [];
  const block = (value, language = '') => {
    const text = String(value ?? '');
    const length = Math.max(3, ...(text.match(/`+/g) || []).map((part) => part.length + 1));
    const fence = '`'.repeat(length);
    return `${fence}${language}\n${text}\n${fence}`;
  };

  function describe(snapshot) {
    const { diagram, context } = snapshot;
    const lines = [
      '# Current ship-loop diagram',
      '',
      'This is a complete snapshot of the participant’s current board. The board may be empty, partial, disconnected, or cyclic. Workshop progression and canvas position do not imply execution order.',
      '',
      '## Company, game, or product context',
      '',
      context ? block(context) : 'Not supplied. Inspect the target repository and ask for the product details needed to implement this diagram.',
      '',
      `Elements: ${diagram.cards.length}. Transitions: ${diagram.edges.length}. Workshop stage: ${quoted(diagram.stage)}. Canvas view: ${quoted(diagram.view)}.`,
      '',
      'Execution edges select the next state through named execution pins. Variable edges carry values between data pins and do not schedule work. A card’s body is its participant-authored specification. Blank labels are explicitly preserved. Every pin is listed, including unconnected pins.',
      '',
      '## States and other elements',
      '',
    ];
    if (!diagram.cards.length) lines.push('The board contains no elements. Do not invent a loop or substitute the workshop’s final example.', '');
    diagram.cards.forEach((card, index) => {
      lines.push(
        `### Element ${index + 1}: ${quoted(card.title)}`,
        '',
        `ID: ${quoted(card.id)}; type: ${quoted(card.type)}; category: ${quoted(category(card))}; position: x=${quoted(card.x)}, y=${quoted(card.y)}.`,
        '',
        'Complete body:',
        block(card.body),
        '',
      );
      ['inputs', 'outputs'].forEach((direction) => {
        const list = pins(card, direction);
        lines.push(`${direction === 'inputs' ? 'Input' : 'Output'} pins (${list.length}):`);
        if (!list.length) lines.push('- None.');
        list.forEach((pin) => {
          const edges = diagram.edges.filter((edge) => direction === 'inputs'
            ? edge.to === card.id && edge.toPin === pin.id
            : edge.from === card.id && edge.fromPin === pin.id);
          lines.push(`- ID ${quoted(pin.id)}; label ${quoted(pin.name)}; kind ${quoted(pin.kind)}; data type ${quoted(pin.dataType)}; connected edge IDs: ${edges.length ? edges.map((edge) => quoted(edge.id)).join(', ') : 'none (unconnected)'}.`);
        });
        lines.push('');
      });
      if (!diagram.edges.some((edge) => edge.from === card.id || edge.to === card.id)) lines.push('This element is disconnected.', '');
    });
    lines.push('## Directed transitions and data connections', '');
    if (!diagram.edges.length) lines.push('There are no connections; no order or data propagation is implied.', '');
    diagram.edges.forEach((edge, index) => {
      const from = diagram.cards.find((card) => card.id === edge.from);
      const to = diagram.cards.find((card) => card.id === edge.to);
      const fromPin = from && pins(from, 'outputs').find((pin) => pin.id === edge.fromPin);
      const toPin = to && pins(to, 'inputs').find((pin) => pin.id === edge.toPin);
      lines.push(
        `${index + 1}. Edge ID ${quoted(edge.id)}; kind ${quoted(edge.kind)}; label/condition ${quoted(edge.label)}.`,
        `   Source element ${quoted(edge.from)} (${quoted(from?.title)}), output pin ${quoted(edge.fromPin)} (${quoted(fromPin?.name)}, ${quoted(fromPin?.kind)}, data type ${quoted(fromPin?.dataType)}).`,
        `   → Target element ${quoted(edge.to)} (${quoted(to?.title)}), input pin ${quoted(edge.toPin)} (${quoted(toPin?.name)}, ${quoted(toPin?.kind)}, data type ${quoted(toPin?.dataType)}).`,
        `   Meaning: ${edge.kind === 'execution' ? 'execution transition; the selected output/edge condition guards this route' : edge.kind === 'variable' ? 'variable connection; propagate this output value to the target input without scheduling the target' : 'unknown connection kind; resolve explicitly before implementation'}.`,
      );
      if (!from || !to || !fromPin || !toPin) lines.push('   Incomplete endpoint: preserve it and request a repair; do not invent a connection.');
      lines.push('');
    });
    lines.push(
      '## Exact machine-readable snapshot',
      '',
      'The JSON below preserves every field of the current board, including custom text, IDs, pin definitions, connections, positions, and canvas metadata. Use this as the authoritative topology; the prose explains its meaning.',
      '',
      block(json(snapshot), 'json'),
      '',
    );
    return lines.join('\n');
  }

  function prompt(snapshot, actions) {
    return [
      actions ? '# Build GitHub Actions for this ship loop' : '# Build this ship loop for my company, game, or product',
      '',
      'You are the implementation agent. Build the ship loop depicted in the complete diagram below for the participant’s company, game, or product. This export is a procedural handoff: the workshop website has no connection to you and has performed no work in the target repository.',
      '',
      '1. Inspect the target repository, company workflow instructions, product context, work intake, tools and integrations, validation methods, agent runner, delivery process, and any existing CI before changing anything. Reuse suitable existing infrastructure. If context is missing, make progress on independent work and ask for the specific decisions needed.',
      '2. Treat the supplied current diagram as the scope. Implement every execution state, data element, pin, and transition, preserving stable IDs and participant-authored text. Do not silently insert stages from the workshop’s completed reference loop. An empty board is a request to define missing requirements, not permission to invent a loop. Retain disconnected elements and explicitly resolve how they are entered or used.',
      '3. Define each state’s entry conditions, work, outputs, failure behavior, completion evidence, and selected output pin. Preserve human-owned work and approval boundaries. Define each execution edge’s guard from its output pin, label, and source body; ask when branches, multiple routes, joins, or missing links are ambiguous. Do not treat layout coordinates as execution order.',
      '4. Implement variable connections separately from execution. Define value schemas, source and destination pins, persistence, lifetime, and the mapping/aggregation inside each data element. Pass feedback into the next attempt where depicted. Document missing and optional values, stale outputs across retries, and how artifacts identify the exact code or product revision they describe.',
      '5. Support depicted cycles with explicit attempt and wall-clock limits and preserve their exit paths. Choose bounded operational limits even when the board omits them, documenting this infrastructure choice without adding graph states. Make retries idempotent, preserve checkpoints/evidence, and make failure or exhausted limits visible. Never report success for an unimplemented state or an unresolved transition.',
      '6. Adapt commands, integrations, identities, labels, models, secrets, environments, and permissions to this product. Keep credentials outside prompts and artifacts. Ask for missing integration choices rather than fabricating a provider or command. Validate all external input; never interpolate diagram text or task text into shell/YAML code. Use least privilege and retain the diagram’s human decisions.',
      actions
        ? '7. Deliver actual .github/workflows YAML, supporting controller/adapters, graph configuration, setup documentation, and focused tests. Use a manual workflow_dispatch entry and reusable workflow_call where useful; add issue/event triggers only when selected and configured for this repository. GitHub job dependencies form a DAG, so implement cyclic execution in a bounded controller or an explicitly persisted dispatch protocol. Map every element/edge to its implementation, handle human pauses/resume, upload diagnostic artifacts even on failure, and document required secrets, permissions, runner dependencies, and installation. Distinguish completed implementation from setup still required.'
        : '7. Deliver the implementation, configuration, setup/run instructions, and focused validation appropriate to this repository. Explain where each diagram element and edge is implemented. Include tests for branch selection, data propagation, failure/retry limits, and human handoffs. Clearly identify remaining setup or unresolved participant decisions.',
      '',
      describe(snapshot),
    ].join('\n');
  }

  const controller = String.raw`#!/usr/bin/env python3
"""Bounded ship-loop starter. Run from the repository root; Python stdlib only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


class SetupError(Exception):
    pass


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def category(card):
    return card.get("category") or ("data" if card.get("type") in ("context", "feedback", "task") else "execution")


def pin_list(card, direction):
    return card.get("pins", {}).get(direction, [])


def validate(graph):
    cards = {}
    for card in graph["cards"]:
        key = card.get("id")
        if not isinstance(key, str) or not key or key in cards:
            raise SetupError("Element IDs must be unique nonempty strings")
        cards[key] = card
        for direction in ("inputs", "outputs"):
            seen = set()
            for pin in pin_list(card, direction):
                if not isinstance(pin.get("id"), str) or not pin["id"] or pin["id"] in seen or pin.get("kind") not in ("exec", "data"):
                    raise SetupError("Invalid or duplicate pin on element " + key)
                seen.add(pin["id"])
    seen_edges = set()
    for edge in graph["edges"]:
        if not isinstance(edge.get("id"), str) or not edge["id"] or edge["id"] in seen_edges:
            raise SetupError("Edge IDs must be unique nonempty strings")
        seen_edges.add(edge["id"])
        kind = {"execution": "exec", "variable": "data"}.get(edge.get("kind"))
        if kind is None:
            raise SetupError("Unknown edge kind: " + str(edge.get("kind")))
        endpoints = []
        for field, pin_field, direction in (("from", "fromPin", "outputs"), ("to", "toPin", "inputs")):
            card = cards.get(edge.get(field))
            pin = next((pin for pin in pin_list(card or {}, direction) if pin["id"] == edge.get(pin_field)), None)
            if not card or not pin or pin["kind"] != kind:
                raise SetupError("Missing or incompatible endpoint on edge " + edge["id"])
            if kind == "exec" and category(card) != "execution":
                raise SetupError("Execution edge targets a data element: " + edge["id"])
            endpoints.append(pin)
        if kind == "data" and not endpoints[1].get("multi") and endpoints[0].get("dataType") != endpoints[1].get("dataType"):
            raise SetupError("Incompatible variable types on edge " + edge["id"])
    return cards


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph", default=".ship-loop/graph.json")
    parser.add_argument("--adapters", default=".ship-loop/adapters.json")
    parser.add_argument("--inputs", help="JSON file containing values keyed by element ID and output pin ID")
    parser.add_argument("--start", default=os.environ.get("SHIP_LOOP_START", ""))
    parser.add_argument("--max-steps", default=os.environ.get("SHIP_LOOP_MAX_STEPS", "100"))
    parser.add_argument("--output", default="ship-loop-run")
    parser.add_argument("--resume", help="Previously paused result.json checkpoint")
    parser.add_argument("--human-result", help="Explicit human decision JSON: nodeId, outputPin, outputs")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    state = {"status": "starting", "steps": 0, "elapsedSeconds": 0, "history": [], "values": {}, "nodeId": None, "inputPin": None}
    started = time.monotonic()
    previous_elapsed = 0

    def save(status, message, code):
        state.update(status=status, message=message, elapsedSeconds=previous_elapsed + time.monotonic() - started)
        (output / "result.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # JSON encoding prevents multiline text becoming workflow commands or summary markup.
        summary = "Ship loop status: " + status + "\n" + json.dumps(message, ensure_ascii=False) + "\n"
        print(summary)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
                stream.write("Ship loop status: " + status + ". Inspect the result artifact for details.\n")
        return code

    try:
        args.max_steps = int(args.max_steps)
        snapshot = read_json(args.graph)
        graph = snapshot["diagram"]
        digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode("utf-8")).hexdigest()
        cards = validate(graph)
        config = read_json(args.adapters)
        timeout = float(config.get("timeoutSeconds", 900))
        adapter_timeout = float(config.get("adapterTimeoutSeconds", 300))
        if not 1 <= args.max_steps <= 10000 or not 0 < timeout <= 3600 or not 0 < adapter_timeout <= timeout:
            raise SetupError("Use max steps 1..10000, total timeout 1..3600, and adapter timeout no larger than total")
        state["graphDigest"] = digest
        decision = None
        if args.resume:
            state = read_json(args.resume)
            if state.get("graphDigest") != digest or state.get("status") != "waiting_for_human":
                raise SetupError("Resume requires a human checkpoint for this exact diagram and context")
            if not args.human_result:
                raise SetupError("Resume requires --human-result after the depicted human work is performed")
            decision = read_json(args.human_result)
            if decision.get("nodeId") != state.get("nodeId"):
                raise SetupError("Human result does not match the paused element")
            previous_elapsed = state["elapsedSeconds"]
        else:
            if args.human_result:
                raise SetupError("--human-result requires --resume")
            initial = read_json(args.inputs) if args.inputs else json.loads(os.environ.get("SHIP_LOOP_INPUTS", "{}"))
            if not isinstance(initial, dict):
                raise SetupError("Initial values must be an object keyed by element ID")
            for node_id, values in initial.items():
                if node_id not in cards or not isinstance(values, dict):
                    raise SetupError("Initial values refer to an unknown element or are not an object")
                allowed = {pin["id"] for pin in pin_list(cards[node_id], "outputs") if pin["kind"] == "data"}
                if set(values) - allowed:
                    raise SetupError("Initial values refer to an undeclared output pin")
            state["values"] = initial
            entries = [card["id"] for card in graph["cards"] if category(card) == "execution" and not any(edge["kind"] == "execution" and edge["to"] == card["id"] for edge in graph["edges"])]
            entry = args.start or config.get("entryNode")
            if not entry:
                if len(entries) != 1:
                    raise SetupError("Choose an explicit entryNode or --start; candidate IDs: " + json.dumps(entries))
                entry = entries[0]
            if entry not in cards or category(cards[entry]) != "execution":
                raise SetupError("Entry must name an execution element")
            state["nodeId"] = entry

        missing = object()

        def resolve_input(node_id, pin_id, seen):
            routes = [edge for edge in graph["edges"] if edge["kind"] == "variable" and edge["to"] == node_id and edge["toPin"] == pin_id]
            target = next((pin for pin in pin_list(cards[node_id], "inputs") if pin["id"] == pin_id), {})
            if target.get("multi"):
                gathered = {}
                for route in routes:
                    value = resolve_output(route["from"], route["fromPin"], seen)
                    if value is not missing:
                        gathered[route["from"] + "." + route["fromPin"]] = value
                return gathered if gathered else missing
            if len(routes) > 1:
                raise SetupError("Multiple values target one input; define aggregation explicitly: " + node_id + "/" + pin_id)
            if not routes:
                return missing
            route = routes[0]
            return resolve_output(route["from"], route["fromPin"], seen)

        def resolve_output(node_id, pin_id, seen):
            key = (node_id, pin_id)
            if key in seen:
                return missing
            known = state["values"].get(node_id, {})
            if pin_id in known:
                return known[pin_id]
            card = cards[node_id]
            if category(card) != "data":
                return missing
            binding = config.get("dataBindings", {}).get(node_id, {}).get(pin_id)
            if binding is None:
                raise SetupError("Configure dataBindings for " + node_id + "/" + pin_id + " or supply an initial output value")
            if not isinstance(binding, dict) or len(binding) != 1:
                raise SetupError("A data binding must have exactly one key: input, inputs, or literal")
            if "literal" in binding:
                return binding["literal"]
            input_ids = {pin["id"] for pin in pin_list(card, "inputs") if pin["kind"] == "data"}
            if "input" in binding:
                if binding["input"] not in input_ids:
                    raise SetupError("Data binding names an unknown input pin")
                return resolve_input(node_id, binding["input"], seen | {key})
            if "inputs" in binding and isinstance(binding["inputs"], list) and set(binding["inputs"]) <= input_ids:
                result = {}
                for input_id in binding["inputs"]:
                    value = resolve_input(node_id, input_id, seen | {key})
                    if value is not missing:
                        result[input_id] = value
                return result if result else missing
            raise SetupError("Unsupported data binding for " + node_id + "/" + pin_id)

        while True:
            if state["steps"] >= args.max_steps or previous_elapsed + time.monotonic() - started >= timeout:
                return save("limit_reached", "Step or active runtime budget exhausted; work is not complete", 4)
            card = cards[state["nodeId"]]
            inputs, missing_inputs = {}, []
            for pin in pin_list(card, "inputs"):
                if pin["kind"] != "data":
                    continue
                value = resolve_input(card["id"], pin["id"], set())
                if value is missing:
                    missing_inputs.append(pin["id"])
                else:
                    inputs[pin["id"]] = value
            request = {
                "snapshot": snapshot, "node": card, "inputPin": state["inputPin"], "inputs": inputs,
                "missingInputs": missing_inputs, "step": state["steps"] + 1, "history": state["history"],
                "limits": {"maxSteps": args.max_steps, "stepsRemaining": args.max_steps - state["steps"],
                           "activeSecondsRemaining": max(0, timeout - previous_elapsed - (time.monotonic() - started))},
            }
            if card.get("type") == "human":
                if decision is None:
                    (output / "human-request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    return save("waiting_for_human", "Perform the depicted human work, then explicitly resume with a human result: " + card["id"], 3)
                result, decision = decision, None
            else:
                command = config.get("commands", {}).get(card["id"])
                if not isinstance(command, list) or not command or not all(isinstance(arg, str) and arg for arg in command):
                    raise SetupError("Implement and configure an adapter command for element " + card["id"])
                remaining = timeout - previous_elapsed - (time.monotonic() - started)
                if remaining <= 0:
                    return save("limit_reached", "Active runtime budget exhausted", 4)
                # argv is repository-owned configuration. Participant text is JSON on stdin, never executable shell text.
                run = subprocess.run(command, input=json.dumps(request), text=True, capture_output=True, timeout=min(adapter_timeout, remaining), check=False)
                if run.returncode:
                    raise SetupError("Adapter failed with exit code " + str(run.returncode) + " for " + card["id"] + "; no successful transition was recorded")
                try:
                    result = json.loads(run.stdout)
                except json.JSONDecodeError as error:
                    raise SetupError("Adapter must return one JSON result for " + card["id"]) from error
            if not isinstance(result, dict) or "outputPin" not in result or not isinstance(result.get("outputs"), dict):
                raise SetupError("Result must contain outputPin and an outputs object")
            exec_pins = {pin["id"] for pin in pin_list(card, "outputs") if pin["kind"] == "exec"}
            data_pins = {pin["id"] for pin in pin_list(card, "outputs") if pin["kind"] == "data"}
            if set(result["outputs"]) - data_pins:
                raise SetupError("Result contains undeclared data outputs for " + card["id"])
            selected = result["outputPin"]
            if (exec_pins and selected not in exec_pins) or (not exec_pins and selected is not None):
                raise SetupError("Select a declared execution output, or null only for a terminal element")
            # Replace this node's outputs: omitted outputs cannot accidentally reuse its previous attempt.
            state["values"][card["id"]] = result["outputs"]
            state["steps"] += 1
            state["history"].append({"step": state["steps"], "nodeId": card["id"], "inputPin": state["inputPin"], "outputPin": selected})
            if selected is None:
                outcome = result.get("outcome")
                if outcome not in ("completed", "stopped", "failed"):
                    raise SetupError("Terminal result requires outcome: completed, stopped, or failed; derive it from the state body")
                message = result.get("message") or ("Reached terminal element " + card["id"] + "; disconnected elements were not executed")
                return save(outcome, str(message), {"completed": 0, "stopped": 4, "failed": 2}[outcome])
            routes = [edge for edge in graph["edges"] if edge["kind"] == "execution" and edge["from"] == card["id"] and edge["fromPin"] == selected]
            if not routes:
                return save("incomplete", "Selected output has no connected transition: " + card["id"] + "/" + selected, 4)
            if len(routes) > 1:
                raise SetupError("Selected output has multiple routes; define fan-out or edge selection explicitly: " + card["id"] + "/" + selected)
            route = routes[0]
            state["history"][-1]["edgeId"] = route["id"]
            state["nodeId"], state["inputPin"] = route["to"], route["toPin"]
    except subprocess.TimeoutExpired:
        return save("limit_reached", "Adapter exceeded its active runtime budget; do not assume completion", 4)
    except (SetupError, OSError, ValueError, KeyError, TypeError) as error:
        return save("setup_or_execution_failed", str(error), 2)


if __name__ == "__main__":
    sys.exit(main())
`;

  const dispatchWorkflow = `name: Ship loop — manual entry

on:
  workflow_dispatch:
    inputs:
      start_node:
        description: 'Entry element ID; blank requires one unambiguous entry'
        type: string
        default: ''
      max_steps:
        description: 'Maximum executed states, including retries (1–10000)'
        type: number
        default: 100
      initial_values:
        description: 'JSON: element ID → data output pin ID → value; no secrets'
        type: string
        default: '{}'

permissions:
  contents: read

concurrency:
  group: ship-loop-\${{ github.repository }}-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  run:
    uses: ./.github/workflows/ship-loop-run.yml
    with:
      start_node: \${{ inputs.start_node }}
      max_steps: \${{ inputs.max_steps }}
      initial_values: \${{ inputs.initial_values }}
`;

  const reusableWorkflow = `name: Ship loop — reusable controller

on:
  workflow_call:
    inputs:
      start_node:
        type: string
        default: ''
      max_steps:
        type: number
        default: 100
      initial_values:
        type: string
        default: '{}'

permissions:
  contents: read

jobs:
  controller:
    runs-on: ubuntu-latest
    timeout-minutes: 65
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-python@v7
        with:
          python-version: '3.12'
      # Add repository-owned dependencies and explicit adapter secrets here.
      - name: Execute the bounded diagram
        env:
          SHIP_LOOP_START: \${{ inputs.start_node }}
          SHIP_LOOP_MAX_STEPS: \${{ inputs.max_steps }}
          SHIP_LOOP_INPUTS: \${{ inputs.initial_values }}
        run: python .ship-loop/run.py
      - name: Preserve results and human handoff
        if: \${{ always() }}
        uses: actions/upload-artifact@v7
        with:
          name: ship-loop-\${{ github.run_id }}-\${{ github.run_attempt }}
          path: ship-loop-run/
          if-no-files-found: warn
          retention-days: 7
`;

  function actionBundle(snapshot) {
    const execution = snapshot.diagram.cards.filter((card) => category(card) === 'execution' && card.type !== 'human');
    const data = snapshot.diagram.cards.filter((card) => category(card) === 'data');
    const config = {
      entryNode: null,
      timeoutSeconds: 900,
      adapterTimeoutSeconds: 300,
      commands: Object.fromEntries(execution.map((card) => [card.id, []])),
      dataBindings: Object.fromEntries(data.map((card) => [card.id, Object.fromEntries(pins(card, 'outputs').filter((pin) => pin.kind === 'data').map((pin) => [pin.id, null]))])),
    };
    const instructions = [
      '# GitHub Actions ship-loop starter — setup required',
      '',
      'This bundle contains runnable workflow/controller infrastructure and the exact current diagram. It does not contain a product-specific agent, test runner, issue integration, or credentials. It deliberately fails when an adapter or data mapping is missing. It never reports an unimplemented state as successful.',
      '',
      '## Install and configure',
      '',
      '1. Copy the .github/workflows and .ship-loop directories into your target repository. Review the exported DIAGRAM.md, which includes the company/game/product context and every current state, element, pin, transition, and raw field. Use IMPLEMENTATION-PROMPT.md to ask an agent to complete the repository-specific setup.',
      '2. Implement repository-owned adapter programs for each non-human execution element, including trigger elements. Set each corresponding commands entry in .ship-loop/adapters.json to an argument array, for example ["python", "scripts/ship_loop_adapter.py"]. No command is inferred from card text. Install each adapter’s dependencies in the reusable workflow.',
      '3. Configure dataBindings for every used data-element output. A binding is exactly one of {"input":"input-pin-id"} (forward one input), {"inputs":["input-a","input-b"]} (object of available inputs keyed by pin ID), or {"literal": any JSON value}. Null requires setup. Bindings do not execute data bodies; implement any transformation in an upstream adapter and preserve its meaning. Initial values override bindings. Cyclic data with no available seed is reported as missing.',
      '4. Set entryNode or provide start_node if the graph has multiple entries, disconnected execution elements, or a closed cycle. The only inferred entry is the sole execution element with no incoming execution edge. Empty/data-only graphs require clarification. No missing paths are invented.',
      '5. Configure explicit secrets, tool identities, runner requirements, permissions, and branch policy. The starter has contents: read, no persisted checkout credentials, and no automatic merge. Writes such as draft PR creation need your explicitly configured authentication and appropriately scoped permissions in both workflows. Do not put secrets into diagram bodies, initial values, adapter output, or artifacts.',
      '6. Run locally from the repository root with python3 .ship-loop/run.py --inputs initial-values.json. Initial values are a JSON object {"element-id":{"output-pin-id":value}}. Then commit the workflows to the default branch to expose the manual Run workflow button. Select the intended ref and provide the entry ID, maximum steps, and initial values. Add issue/schedule/webhook triggers only after implementing that product’s event-to-input mapping.',
      '',
      '## Adapter contract',
      '',
      'Each adapter is invoked with its configured argv, repository root as working directory, and a JSON request on stdin. The request contains snapshot (complete diagram/context), node (including body and pins), inputPin (arrival execution pin, null for entry), inputs (available data values keyed by input pin), missingInputs (unavailable pin IDs), step, history (visited states and selected edges), and limits (maxSteps, stepsRemaining including this visit, activeSecondsRemaining). Budget states can count relevant visits from history and compare time/steps before selecting a retry route. Card text is specification data, never shell code. The adapter must validate required inputs, perform actual work, evaluate the outgoing guard, and emit exactly one JSON object on stdout:',
      '',
      block('{"outputPin":"declared-execution-output-id","outputs":{"declared-data-output-id":"actual value or artifact reference"}}', 'json'),
      '',
      'Use outputPin: null only when the element has no execution outputs. Terminal results also require outcome: "completed", "stopped", or "failed", with an optional message. Derive the outcome from the state body: leaving a draft after exhausted attempts is stopped, a failed task is failed, and verified completion or a legitimate no-op is completed. Reaching a terminal alone is not success. Human terminal decisions use the same outcome field. An adapter with execution outputs must select one declared output. A nonzero adapter exit or invalid JSON fails the run. The controller never interprets natural-language conditions: adapters must evaluate pin labels, edge labels, and state bodies before choosing an output. A single output wired to multiple destinations is rejected; implement an explicit routing/fan-out policy before using that topology. Multiple variable edges into one input are rejected unless that input is marked multi (such as an agent\u2019s Context); a multi input receives an object of the available values keyed by "sourceElementId.sourcePinId".',
      '',
      'Available values propagate only along variable edges. Data cards require the bindings above. The controller replaces a visited node’s previous outputs with that visit’s outputs; other nodes retain their latest values. Adapters must add revision/attempt identifiers and reject stale values where the diagram requires current-attempt evidence. Missing values are explicit so feedback may be optional on a first attempt. Inputs are never created from element titles or bodies.',
      '',
      '## Human work, completion, and limits',
      '',
      'Human elements are never run as adapters. The controller writes human-request.json and result.json, then exits 3 with status waiting_for_human. The GitHub run is intentionally non-successful and uploads the handoff artifact; this is a durable pause, not completed work. Download the artifact, perform the depicted human action, and prepare a decision file with nodeId, outputPin, and outputs using the same result contract. Resume locally with:',
      '',
      block('python3 .ship-loop/run.py --resume downloaded/result.json --human-result decision.json', 'sh'),
      '',
      'Resume requires the identical diagram/context, retains step and active-runtime budgets, and skips only the human action that the decision confirms. Human waiting time is excluded from active runtime. Preserve the repository checkout and any referenced files when moving between runners; the checkpoint stores JSON values and graph identity, not a workspace backup. Resume is an explicit local operation in this starter. Add a trusted approval/checkpoint retrieval mechanism if you need resume through GitHub Actions.',
      '',
      'Exit 0 means the selected path reached a terminal with an explicit completed outcome; disconnected paths were not executed. Exit 2 is setup/adapter/graph failure or a failed terminal outcome, exit 3 is a human pause, and exit 4 is a stopped terminal, unresolved endpoint, or exhausted budget. result.json stores status, path history, values, current node, and elapsed time. Adapter stdout/stderr is not echoed to workflow logs; report non-secret diagnostics as artifact references in outputs or inspect the adapter locally.',
      '',
      'Cycles run inside the controller instead of attempting cyclic GitHub job dependencies. max_steps defaults to 100; timeoutSeconds defaults to 900 active seconds and adapterTimeoutSeconds to 300. The configured maximum active runtime is one hour. Treat these as operational limits to adapt, not additional graph states. Configure each adapter’s subprocess cleanup, retry safety, artifact persistence, and idempotency before running work with external effects. Workflow concurrency serializes one ref; choose an issue/product-specific key if concurrent work is needed.',
      '',
      '## Workflow references',
      '',
      '- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)',
      '- [Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)',
      '- [Artifact storage](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)',
      '',
      'The exported actions use the official checkout, setup-python, and upload-artifact v7 release lines. Review and pin approved commit SHAs according to your repository’s policy before production use.',
      '',
    ].join('\n');
    return [
      { path: 'README.md', content: instructions },
      { path: 'DIAGRAM.md', content: describe(snapshot) },
      { path: 'IMPLEMENTATION-PROMPT.md', content: prompt(snapshot, true) },
      { path: '.github/workflows/ship-loop.yml', content: dispatchWorkflow },
      { path: '.github/workflows/ship-loop-run.yml', content: reusableWorkflow },
      { path: '.ship-loop/graph.json', content: json(snapshot) + '\n' },
      { path: '.ship-loop/adapters.json', content: json(config) + '\n' },
      { path: '.ship-loop/run.py', content: controller },
    ];
  }

  function build(state, options = {}) {
    if (!state || !Array.isArray(state.cards) || !Array.isArray(state.edges)) throw new Error('A current board with cards and edges is required.');
    const snapshot = { schemaVersion: 1, context: String(options.context || '').trim(), diagram: JSON.parse(JSON.stringify(state)) };
    const format = options.format || 'agent';
    if (format === 'actions') return { files: actionBundle(snapshot), note: 'GitHub Actions starter: configure your adapters, data mappings, and credentials before running. Includes the complete current diagram.' };
    if (format === 'json') return { files: [{ path: 'ship-loop-blueprint.json', content: json({ format: 'ship-loop-blueprint-v2', ...snapshot.diagram }) + '\n' }], note: 'Exact current board snapshot, including all elements, pins, transitions, and layout.' };
    if (!['agent', 'actions-prompt'].includes(format)) throw new Error('Unknown export format: ' + format);
    return {
      files: [{ path: format === 'agent' ? 'ship-loop-agent-prompt.md' : 'ship-loop-actions-prompt.md', content: prompt(snapshot, format === 'actions-prompt') }],
      note: 'Copy or download this complete description and give it to an agent in your product repository.',
    };
  }

  return { build };
});
