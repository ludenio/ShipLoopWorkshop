(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShipLoopBlocks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const exec = (id, name) => ({ id, kind: 'exec', name });
  const data = (id, name, dataType = 'context') => ({ id, kind: 'data', name, dataType });
  const enter = () => exec('exec', '');
  const task = () => data('task', 'Task', 'task');
  const context = () => data('context', 'Context');
  const result = () => data('result', 'Result');
  const criteria = () => data('criteria', 'Acceptance criteria');
  const feedback = () => data('feedback', 'Feedback', 'feedback');
  const configuration = () => data('configuration', 'Configuration');

  const presets = [
    {
      id: 'start-trigger', group: 'flow', type: 'trigger', title: 'Start on an event',
      hint: 'Manual, scheduled, or external',
      body: 'Configure one entry mode: a manual start, a schedule, or a specified external event. Define the source, eligibility rule, event-to-task mapping, and duplicate-event key. Start once for an eligible event and output its task and provenance. A start block describes required trigger wiring; it does not subscribe to any service by itself. Invalid events fail visibly before work begins.',
      pins: { inputs: [configuration()], outputs: [exec('started', 'Started'), task(), data('event', 'Event context')] },
    },
    {
      id: 'understand-task', group: 'flow', type: 'agent', title: 'Understand the task',
      hint: 'Proceed, clarify, or stop',
      body: 'Read the task, context, and acceptance criteria. Identify the intended outcome, scope, dependencies, and evidence needed. Select Proceed with a concrete plan, Clarify with focused questions when a decision is missing, or No work with a reason when no action is appropriate. Do not invent company policy or silently widen the task.',
      pins: { inputs: [enter(), task(), context(), criteria()], outputs: [exec('proceed', 'Proceed'), exec('clarify', 'Clarify'), exec('no-work', 'No work'), data('plan', 'Plan'), feedback()] },
    },
    {
      id: 'agent-task', group: 'flow', type: 'agent', title: 'Do an agent task',
      hint: 'Create, analyze, or improve',
      body: 'Perform the defined task using the supplied context, criteria, and optional feedback from an earlier attempt. This may produce a design, analysis, content, response, configuration, or other product change. Stay within the assigned scope and permissions. Select Done with a versioned result and work evidence, Clarify with a missing decision, or Failed with a diagnostic. Done means this step finished; it does not imply acceptance or delivery.',
      pins: { inputs: [enter(), exec('again', 'Retry'), task(), context(), criteria(), feedback()], outputs: [exec('done', 'Done'), exec('clarify', 'Clarify'), exec('failed', 'Failed'), result(), feedback()] },
    },
    {
      id: 'refine-result', group: 'flow', type: 'agent', title: 'Refine a result',
      hint: 'Improve the current version',
      body: 'Improve the supplied result using the task, acceptance criteria, and feedback. Preserve its intended scope and record what changed. Select Refined with the new version and revision evidence; select Blocked with an explanation when refinement needs a missing decision, input, or capability. Evidence for an older version must be checked again before the new version is accepted.',
      pins: { inputs: [enter(), exec('again', 'Retry'), task(), result(), criteria(), feedback()], outputs: [exec('refined', 'Refined'), exec('blocked', 'Blocked'), result(), feedback()] },
    },
    {
      id: 'review-result', group: 'flow', type: 'agent', title: 'Review a result',
      hint: 'Judge quality and fit',
      body: 'Independently assess the exact result version against the task, context, and acceptance criteria. Define what findings require revision for this scenario. Select Accepted with supporting evidence, Changes needed with actionable findings, or Unavailable when a reliable judgment needs missing information. Review does not grant a human approval or permission to publish.',
      pins: { inputs: [enter(), task(), result(), context(), criteria()], outputs: [exec('accepted', 'Accepted'), exec('changes', 'Changes needed'), exec('unavailable', 'Unavailable'), feedback(), data('evidence', 'Review evidence')] },
    },
    {
      id: 'task', group: 'data', type: 'task', title: 'Task',
      hint: 'Goal, scope, and accountable owner',
      body: 'The work request: stable identifier, version, desired outcome, requester, owner, scope, priority, constraints, and acceptance references. Specify which source supplies it and how updates are handled. This value carries task data; it does not start work by itself.',
      pins: { inputs: [task()], outputs: [task()] },
    },
    {
      id: 'context', group: 'data', type: 'context', title: 'Context',
      hint: 'Facts, references, and constraints',
      body: 'Relevant knowledge, source references, plans, dependencies, or prior decisions. Include provenance, retrieval time, and version or freshness limits where needed. Define the schema and which incoming value is forwarded. This is a passive value; retrieval and transformation belong in execution blocks.',
      pins: { inputs: [context()], outputs: [context()] },
    },
    {
      id: 'acceptance-criteria', group: 'data', type: 'context', title: 'Acceptance criteria',
      hint: 'The definition of a good result',
      body: 'Versioned, observable conditions for accepting this task’s result. State required checks, thresholds, quality expectations, review policy, and any human approval needed. Identify the criteria owner and distinguish required conditions from preferences. These are inputs to validation and decisions, not evidence that the result passed.',
      pins: { inputs: [criteria()], outputs: [criteria()] },
    },
    {
      id: 'result', group: 'data', type: 'context', title: 'Result or artifact',
      hint: 'The exact output being evaluated',
      body: 'A value or reference to the produced deliverable: for example a document, design, analysis, content package, product build, or updated record. Include its stable identifier, version, attempt, author or producer, and location. Tie checks and approvals to this exact version. This block carries the reference; persistent storage must be configured separately.',
      pins: { inputs: [result()], outputs: [result()] },
    },
    {
      id: 'feedback', group: 'data', type: 'feedback', title: 'Feedback',
      hint: 'Findings, questions, and next actions',
      body: 'Actionable findings, validation failures, human responses, or observed problems for a decision or another attempt. Include source, severity or impact, affected result version, evidence, and expected correction. Define forwarding or aggregation explicitly when combining feedback. Keep an empty value distinct from feedback that has not been collected.',
      pins: { inputs: [feedback()], outputs: [feedback()] },
    },
    {
      id: 'metrics', group: 'data', type: 'context', title: 'Metrics and evidence',
      hint: 'Measurements with time and provenance',
      body: 'Measured outcomes or check evidence with metric definitions, units, source, observation window, sample size, timestamps, and the result version they describe. Include baseline and threshold references where applicable. Mark unavailable or stale evidence explicitly. This value does not collect measurements or monitor anything by itself.',
      pins: { inputs: [data('metrics', 'Metrics and evidence')], outputs: [data('metrics', 'Metrics and evidence')] },
    },
    {
      id: 'configuration', group: 'data', type: 'context', title: 'Environment and configuration',
      hint: 'Tools, destinations, and run limits',
      body: 'Non-secret configuration for this scenario: environment, tool identifiers, source and destination references, owners, channels, timeouts, retry limits, budgets, and policy references. Reference credentials by their configured names; never place secret values on the board. Define the configuration source and version. This passive value does not provision an environment or apply settings by itself.',
      pins: { inputs: [configuration()], outputs: [configuration()] },
    },
  ];

  return { presets };
});
