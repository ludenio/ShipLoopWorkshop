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

  const presets = [
    {
      id: 'start-trigger', group: 'flow', type: 'trigger', title: 'Start on an event',
      hint: 'Manual, scheduled, or external',
      body: 'Configure one entry mode: a manual start, a schedule, or a specified external event. Define the source, eligibility rule, event-to-task mapping, and duplicate-event key. Start once for an eligible event and output its task and provenance. A start block describes required trigger wiring; it does not subscribe to any service by itself. Invalid events fail visibly before work begins.',
      pins: { inputs: [context()], outputs: [exec('started', 'Started'), task(), data('event', 'Event context')] },
    },
    {
      id: 'agent-task', group: 'flow', type: 'agent', title: 'Agent',
      hint: 'Create, analyze, review, or improve',
      body: 'Perform the defined task using the supplied context and any feedback from an earlier attempt. This may produce a design, analysis, review, content, response, configuration, or other product change. Stay within the assigned scope and permissions. Select Done with a versioned result and work evidence, Clarify with a missing decision, or Failed with a diagnostic. Done means this step finished; it does not imply acceptance or delivery.',
      pins: { inputs: [enter(), exec('again', 'Retry'), task(), context()], outputs: [exec('done', 'Done'), exec('clarify', 'Clarify'), exec('failed', 'Failed'), data('result', 'Result')] },
    },
    {
      id: 'human', group: 'flow', type: 'human', title: 'Human',
      hint: 'Decide, approve, or answer',
      body: 'A named person or role reviews the supplied task and context, then approves, rejects with reasons, or answers an open question. State who responds, through which channel, and how long the run waits. Select Approved or Rejected and output the response. Work waiting on a person pauses until they respond or the wait ends.',
      pins: { inputs: [enter(), task(), context()], outputs: [exec('approved', 'Approved'), exec('rejected', 'Rejected'), data('response', 'Response')] },
    },
    {
      id: 'task', group: 'data', type: 'task', title: 'Task',
      hint: 'Goal, scope, and accountable owner',
      body: 'The work request: stable identifier, version, desired outcome, requester, owner, scope, priority, constraints, and acceptance references. Specify which source supplies it and how updates are handled. This value carries task data; it does not start work by itself.',
      pins: { inputs: [task()], outputs: [task()] },
    },
    {
      id: 'context', group: 'data', type: 'context', title: 'Context',
      hint: 'Rename it for what it holds',
      body: 'Any information a step needs or produces: facts, references, criteria, results, feedback, metrics, or configuration. Rename it to match what it holds, for example Metrics Report. Include provenance and version or freshness limits where needed. This is a passive value; retrieval and transformation belong in execution blocks.',
      pins: { inputs: [context()], outputs: [context()] },
    },
  ];

  return { presets };
});
