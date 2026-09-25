const $ = (selector) => document.querySelector(selector);

const types = {
  trigger: { icon: 'ϟ', label: 'Trigger', category: 'execution' },
  agent: { icon: '✳', label: 'Agent', category: 'execution' },
  automation: { icon: '⚙', label: 'Automation', category: 'execution' },
  human: { icon: '◎', label: 'Human', category: 'execution' },
  context: { icon: '▤', label: 'Context', category: 'data' },
  feedback: { icon: '⌁', label: 'Feedback', category: 'data' },
  task: { icon: '▣', label: 'Task', category: 'data' },
};
const dataTypes = ['context', 'feedback', 'task'];
const TYPE_ALIASES = { artifact: 'context', text: 'context', review: 'feedback', prompt: 'agent', action: 'agent' };
const DATA_ALIASES = { artifact: 'context', text: 'context', review: 'feedback', bool: 'context', issue: 'task' };
const variableTypes = {
  context: { label: 'Context', color: 'var(--context)' },
  feedback: { label: 'Feedback', color: 'var(--feedback)' },
  task: { label: 'Task', color: 'var(--task)' },
  artifact: { label: 'Context', color: 'var(--context)' },
  review: { label: 'Feedback', color: 'var(--feedback)' },
  text: { label: 'Context', color: 'var(--context)' },
  bool: { label: 'Context', color: 'var(--context)' },
  issue: { label: 'Task', color: 'var(--task)' },
};
const canonicalType = (type) => TYPE_ALIASES[type] || type;
const canonicalDataType = (type) => DATA_ALIASES[type] || type;
// The guided software-delivery example keeps its own steps and pin contracts.
// The palette below is shared by company- and scenario-specific templates.
const lessonPresets = [
  { id: 'person', group: 'flow', type: 'human', title: 'A person', hint: 'Starts the agent', body: 'Starts the agent and asks it to solve the task.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }] } },
  { id: 'implementation', group: 'flow', type: 'agent', title: 'Implement', hint: 'Solve the task', body: 'Solve the task it is given and hand over the changes.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'again', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'changes', kind: 'data', name: 'Changes', dataType: 'context' }, { id: 'problems', kind: 'data', name: 'Problems', dataType: 'feedback' }] } },
  { id: 'task-created', group: 'flow', type: 'trigger', title: 'Task Created', hint: 'Carries the task', body: 'A task was created. It starts the run and hands the task on.', pins: { inputs: [{ id: 'again', kind: 'exec', name: '' }, { id: 'task', kind: 'data', name: 'Task', dataType: 'task', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'task', kind: 'data', name: 'Task', dataType: 'task' }] } },
  { id: 'classify', group: 'flow', type: 'agent', title: 'Classify the Task', hint: 'Clear or unclear', body: 'Clear, and obvious how to proceed: continue. Unclear: hand it to a person.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'clear', kind: 'exec', name: 'Clear' }, { id: 'unclear', kind: 'exec', name: 'Unclear' }] } },
  { id: 'need-human', group: 'flow', type: 'human', title: 'Need Human', hint: 'Execution stops', body: 'Work cannot continue: information is missing, or the project is already broken. A person takes over.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [] } },
  { id: 'run-tests', group: 'flow', type: 'agent', title: 'Run Auto Tests', hint: 'Before or after the change', body: 'Run the test suite. Report whether it passed and what failed.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'passed', kind: 'exec', name: 'Passed' }, { id: 'failed', kind: 'exec', name: 'Failed' }, { id: 'report', kind: 'data', name: 'Failure report', dataType: 'feedback' }] } },
  { id: 'pull-request', group: 'flow', type: 'agent', title: 'Create Pull Request', hint: 'Tests passed', body: 'The tests passed. Open a pull request with the changes.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'pr', kind: 'data', name: 'Pull Request', dataType: 'context' }] } },
  { id: 'explainer', group: 'flow', type: 'agent', title: 'Explain', hint: 'Explains the change', body: 'Writes a human-readable report: what was fixed, how to reproduce the original issue, and how to test the fix.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Explanation', dataType: 'context' }] } },
  { id: 'cleanup', group: 'flow', type: 'agent', title: 'Clean Up', hint: 'Simplify changes', body: 'Simplify changes.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'changes', kind: 'data', name: 'Changes', dataType: 'context' }, { id: 'problems', kind: 'data', name: 'Problems', dataType: 'feedback' }] } },
  { id: 'review', group: 'flow', type: 'agent', title: 'Code Review', hint: 'Approve or reject', body: 'Review the changes. Approve them, or send them back to Implement.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'approved', kind: 'exec', name: 'Approved' }, { id: 'rejected', kind: 'exec', name: 'Rejected' }, { id: 'changes', kind: 'data', name: 'Changes', dataType: 'context' }, { id: 'problems', kind: 'data', name: 'Problems', dataType: 'feedback' }] } },
  { id: 'doctor', group: 'flow', type: 'agent', title: 'Doctor', hint: 'Report in, task out', body: 'Reads the Problems Report and writes a new task that fixes what went wrong.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'task', kind: 'data', name: 'New task', dataType: 'task' }] } },
  { id: 'second-opinion', group: 'flow', type: 'agent', title: 'Bro', hint: 'Any agent can ask', body: 'An independent agent any other agent can consult before it commits to a decision.', pins: { inputs: [], outputs: [{ id: 'opinion', kind: 'data', name: 'Opinion', dataType: 'context' }] } },
  { id: 'player-report', group: 'flow', type: 'human', title: 'Player Report', hint: 'A player reports an issue', body: 'A player reports an issue with logs, screenshots, or a written description.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Report', dataType: 'feedback' }] } },
  { id: 'designer-report', group: 'flow', type: 'human', title: 'Game Designer Report', hint: 'What should change', body: 'A game designer plays the game and describes what should change, and why.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Report', dataType: 'feedback' }] } },
  { id: 'playtest-report', group: 'flow', type: 'automation', title: 'Playtest Report', hint: 'When a playtest ends', body: 'When a playtest ends, its report becomes a task.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'context', kind: 'data', name: 'Context', dataType: 'context', multi: true }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Report', dataType: 'feedback' }] } },
  { id: 'after-playtest', group: 'flow', type: 'agent', title: 'Auto Playtest', hint: 'An agent plays the game', body: 'Play the game through Automation Bridge, which lets the agent interact with the game, then write a Playtest Report.', pins: { inputs: [{ id: 'exec', kind: 'exec', name: '' }], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Playtest report', dataType: 'feedback' }] } },
  { id: 'qa-report', group: 'flow', type: 'human', title: 'QA Report', hint: 'Testers file bugs', body: 'Testers play the game and file bugs with reproduction steps and other relevant details.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Report', dataType: 'feedback' }] } },
  { id: 'human-playtest', group: 'flow', type: 'human', title: 'Human Playtest', hint: 'People play the game', body: 'People play the game and write a Playtest Report.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }, { id: 'report', kind: 'data', name: 'Playtest report', dataType: 'feedback' }] } },
  { id: 'cron', group: 'flow', type: 'trigger', title: 'Cron', hint: 'Every day at 4:00 a.m.', body: 'Starts Auto Playtest every day at 4:00 a.m.', pins: { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }] } },
  { id: 'task', group: 'data', type: 'task', title: 'Task', hint: 'The work to solve', body: 'The task already exists. Pass it to the agent as the work to solve.', pins: { inputs: [{ id: 'task', kind: 'data', name: 'Task', dataType: 'task', multi: true }], outputs: [{ id: 'task', kind: 'data', name: 'Task', dataType: 'task' }] } },
  { id: 'pull-request-var', group: 'data', type: 'context', title: 'Pull Request', hint: 'The result of the run', body: 'The pull request with the changes.', pins: { inputs: [{ id: 'pr', kind: 'data', name: 'Pull Request', dataType: 'context' }], outputs: [{ id: 'pr', kind: 'data', name: 'Pull Request', dataType: 'context' }] } },
  { id: 'problems-report', group: 'data', type: 'feedback', title: 'Problems Report', hint: 'Shared by every agent', body: 'A shared record. Each agent adds the issues it hit near the end of its work.', pins: { inputs: [{ id: 'add', kind: 'data', name: 'Add issues', dataType: 'feedback', multi: true }], outputs: [{ id: 'report', kind: 'data', name: 'Problems Report', dataType: 'feedback' }] } },
];
const lessonPresetById = Object.fromEntries(lessonPresets.map((preset) => [preset.id, preset]));
const presets = ShipLoopBlocks.presets;
const presetById = Object.fromEntries(presets.map((preset) => [preset.id, preset]));
const lessonSteps = [
  ['Start with an empty board', 'Nothing is on the board yet. A ship loop starts from a task that already exists.', 'A task exists →'],
  ['A task exists', 'The task is already here. Nothing is solving it yet.', 'Give it to an agent →', () => {
    place('task', 'task', 40, 48 + NODE_H + NODE_GAP);
  }],
  ['The task goes to Implement', 'The task goes into Implement’s Context: the information it needs to solve it. Nothing starts it yet.', 'Let a person start it →', () => {
    place('implement', 'implementation', 40 + NODE_W + NODE_GAP, 48);
    edge('task', 'implement', '', 'variable', 'task', 'context');
  }],
  ['A person starts the work', 'A person starts Implement with the white control arrow, and the agent solves the task. Someone has to remember to start every run.', 'Start when a task is created →', () => {
    placeNext('person', 'person', 'implement', 'left');
    edge('person', 'implement', '', 'execution', 'exec', 'exec');
  }],
  ['Task Created starts the work', 'The person no longer starts the run. When a task is created, Task Created starts Implement and hands it the task, so a separate Task is no longer needed. It starts on every task, even one that is too vague to act on.', 'Classify the task first →', () => {
    placeNext('created', 'task-created', 'person', 'left');
    removeCard('person');
    removeCard('task');
    edge('created', 'implement', '', 'execution', 'exec', 'exec');
    edge('created', 'implement', '', 'variable', 'task', 'context');
  }],
  ['Classify the task', 'Before any work, the agent classifies the task. A clear task, obvious how to proceed, goes to Implement. Nothing handles an unclear one yet.', 'Hand unclear tasks to a person →', () => {
    state.edges = state.edges.filter((item) => !(item.from === 'created' && item.to === 'implement' && item.kind === 'execution'));
    placeNext('classify', 'classify', 'created', 'right');
    edge('created', 'classify', '', 'execution', 'exec', 'exec');
    edge('created', 'classify', '', 'variable', 'task', 'context');
    edge('classify', 'implement', 'Clear', 'execution', 'clear', 'exec');
  }],
  ['Unclear tasks go to Need Human', 'An unclear task goes to Need Human and the run stops, because work cannot continue without the missing information. Clear tasks are still edited without a known starting point.', 'Run tests before the work →', () => {
    placeNext('needhuman', 'need-human', 'classify', 'below');
    edge('classify', 'needhuman', 'Unclear', 'execution', 'unclear', 'exec');
    edge('created', 'needhuman', '', 'variable', 'task', 'context');
  }],
  ['Tests run before the work', 'A clear task runs the suite before changing anything. Passed: Implement starts. Failed: the project is already broken, so the task goes to Need Human too. Nothing checks the change itself yet.', 'Run tests after the work →', () => {
    unlink('classify', 'implement');
    insertBefore('baseline', 'run-tests', 'implement');
    edge('classify', 'baseline', 'Clear', 'execution', 'clear', 'exec');
    edge('baseline', 'implement', 'Passed', 'execution', 'passed', 'exec');
    edge('baseline', 'needhuman', 'Failed', 'execution', 'failed', 'exec');
  }],
  ['Tests run again after the work', 'Implement hands its Changes to a second test run, which judges them. Nothing happens yet when these tests fail.', 'Send failures back →', () => {
    placeReturning('tests', 'run-tests', 'implement');
    edge('implement', 'tests', '', 'execution', 'exec', 'exec');
    edge('implement', 'tests', '', 'variable', 'changes', 'context');
  }],
  ['Failed tests go back to Implement', 'When the tests after the work fail, control returns to Implement for another attempt. It does not know what broke yet.', 'Pass the failure report →', () => {
    edge('tests', 'implement', 'Failed', 'execution', 'failed', 'again');
  }],
  ['The failure report joins the Context', 'The failure report goes into Implement’s Context, so the next attempt knows what broke. A passing run still goes nowhere.', 'Open a pull request →', () => {
    edge('tests', 'implement', '', 'variable', 'report', 'context');
  }],
  ['Passing tests open a pull request', 'When the tests after the work pass, the agent opens a pull request with the changes.', 'Keep the pull request →', () => {
    placeNext('pr', 'pull-request', 'tests', 'right');
    edge('tests', 'pr', 'Passed', 'execution', 'passed', 'exec');
    edge('implement', 'pr', '', 'variable', 'changes', 'context');
  }],
  ['The Pull Request', 'The pull request becomes a variable: the result of the run. It says nothing about what changed or how to check it.', 'Explain the changes →', () => {
    placeNext('prvar', 'pull-request-var', 'pr', 'below');
    edge('pr', 'prvar', '', 'variable', 'pr', 'pr');
  }],
  ['Explain describes the change', 'Before the pull request opens, Explain reads the original task and the changes. It writes a clear report: what was fixed, how to reproduce the original issue, and how to test the fix. The report goes into the pull request for testers, reviewers, developers, and whoever merges it. Nobody reviews the changes before the tests.', 'Review the changes →', () => {
    unlink('tests', 'pr');
    insertBefore('explainer', 'explainer', 'pr');
    edge('tests', 'explainer', 'Passed', 'execution', 'passed', 'exec');
    edge('explainer', 'pr', '', 'execution', 'exec', 'exec');
    edge('created', 'explainer', '', 'variable', 'task', 'context');
    edge('implement', 'explainer', '', 'variable', 'changes', 'context');
    edge('explainer', 'pr', '', 'variable', 'report', 'context');
    setCardText('pr', '', 'Open a pull request with the changes and Explain’s report.');
    setCardText('prvar', '', 'The pull request: the changes plus a report that explains them.');
  }],
  ['Code Review', 'Code Review reads the changes before the tests. Approved: they go on to the tests, Explain, and the pull request. Rejected: control and the Changes go back to Implement for another attempt. The changes are still exactly as the writing turn left them.', 'Clean up the changes →', () => {
    unlink('implement', 'tests');
    unlink('implement', 'pr');
    unlink('implement', 'explainer');
    insertBefore('review', 'review', 'tests');
    edge('implement', 'review', '', 'execution', 'exec', 'exec');
    edge('implement', 'review', '', 'variable', 'changes', 'context');
    edge('review', 'tests', 'Approved', 'execution', 'approved', 'exec');
    edge('review', 'tests', '', 'variable', 'changes', 'context');
    edge('review', 'pr', '', 'variable', 'changes', 'context');
    edge('review', 'explainer', '', 'variable', 'changes', 'context');
    edge('review', 'implement', 'Rejected', 'execution', 'rejected', 'again');
    edge('review', 'implement', '', 'variable', 'changes', 'context');
  }],
  ['Clean Up', 'A fresh agent simplifies the changes before Code Review reads them. Nobody collects the problems the agents hit yet.', 'Collect the problems →', () => {
    unlink('implement', 'review');
    insertBefore('cleanup', 'cleanup', 'review');
    edge('implement', 'cleanup', '', 'execution', 'exec', 'exec');
    edge('implement', 'cleanup', '', 'variable', 'changes', 'context');
    edge('cleanup', 'review', '', 'execution', 'exec', 'exec');
    edge('cleanup', 'review', '', 'variable', 'changes', 'context');
  }],
  ['Problems go to a shared report', 'Every agent adds the issues it hit to one shared Problems Report. Nobody reads the report yet.', 'Call the Doctor →', () => {
    placeNext('problems', 'problems-report', 'tests', 'below');
    edge('implement', 'problems', '', 'variable', 'problems', 'add');
    edge('cleanup', 'problems', '', 'variable', 'problems', 'add');
    edge('review', 'problems', '', 'variable', 'problems', 'add');
    edge('baseline', 'problems', '', 'variable', 'report', 'add');
    edge('tests', 'problems', '', 'variable', 'report', 'add');
  }],
  ['The Doctor reads the report', 'When the pull request is open, the Doctor agent reads the Problems Report and writes a new task that addresses what went wrong. Nothing starts that task yet.', 'Use the new task →', () => {
    placeNext('doctor', 'doctor', 'pr', 'right');
    edge('pr', 'doctor', '', 'execution', 'exec', 'exec');
    edge('problems', 'doctor', '', 'variable', 'report', 'context');
  }],
  ['The Doctor’s task goes to Task Created', 'The Doctor passes its new task into Task Created. Nothing starts the loop for it yet.', 'Start the loop again →', () => {
    edge('doctor', 'created', '', 'variable', 'task', 'task');
  }],
  ['The new task starts the loop', 'The Doctor’s control arrow fires Task Created. A task is created, agents work and report problems, the Doctor writes a new task, and the loop runs again. Each agent still decides alone.', 'Ask Bro →', () => {
    edge('doctor', 'created', 'New task', 'execution', 'exec', 'again');
  }],
  ['Bro', 'Every agent can ask Bro, an independent agent, for a second opinion before it commits to a decision. So far only the Doctor creates tasks.', 'Where do tasks come from? →', () => {
    placeNext('opinion', 'second-opinion', 'created', 'below');
    ['classify', 'implement', 'cleanup', 'review', 'doctor'].forEach((id) => {
      edge('opinion', id, '', 'variable', 'opinion', 'context');
    });
  }],
  ['A player reports an issue', 'A player reports an issue with logs, screenshots, or a written description. The report goes into Task Created as the task, and the loop starts.', 'Add designer feedback →', () => {
    placeNext('player', 'player-report', 'created', 'left');
    edge('player', 'created', '', 'execution', 'exec', 'again');
    edge('player', 'created', '', 'variable', 'report', 'task');
  }],
  ['A game designer reports', 'A game designer plays the game and describes what should change, and why. That report creates a task too.', 'Add QA →', () => {
    placeNext('designer', 'designer-report', 'player', 'below');
    edge('designer', 'created', '', 'execution', 'exec', 'again');
    edge('designer', 'created', '', 'variable', 'report', 'task');
  }],
  ['QA files bugs', 'Testers play the game and file bugs with reproduction steps and other details. Each bug creates a task.', 'Add playtests →', () => {
    placeNext('qa', 'qa-report', 'designer', 'below');
    edge('qa', 'created', '', 'execution', 'exec', 'again');
    edge('qa', 'created', '', 'variable', 'report', 'task');
  }],
  ['Playtest Report', 'When a playtest ends, its Playtest Report creates a task. Nobody is playing the game yet.', 'Add a human playtest →', () => {
    placeNext('playtest', 'playtest-report', 'qa', 'below');
    edge('playtest', 'created', '', 'execution', 'exec', 'again');
    edge('playtest', 'created', '', 'variable', 'report', 'task');
  }],
  ['People playtest', 'In a Human Playtest, people play the game and write a report. It goes to Playtest Report, which creates a task. Every session needs people to find the time.', 'Let an agent playtest →', () => {
    placeNext('humanplay', 'human-playtest', 'playtest', 'left');
    edge('humanplay', 'playtest', '', 'execution', 'exec', 'exec');
    edge('humanplay', 'playtest', '', 'variable', 'report', 'context');
  }],
  ['An agent playtests', 'Auto Playtest: an agent plays the game through Automation Bridge, which lets it interact with the game, and sends its report to Playtest Report alongside the human one. Someone still has to start it.', 'Run it every night →', () => {
    placeNext('afterplay', 'after-playtest', 'humanplay', 'below');
    edge('afterplay', 'playtest', '', 'execution', 'exec', 'exec');
    edge('afterplay', 'playtest', '', 'variable', 'report', 'context');
  }],
  ['Cron starts the playtest', 'Every day at 4:00 a.m., Cron starts Auto Playtest. Human playtests still run whenever people play. Players, designers, QA, playtests, and the Doctor all create tasks, and every task starts the same loop. This is the ship loop.', 'Workshop complete ✓', () => {
    placeNext('cron', 'cron', 'afterplay', 'left');
    edge('cron', 'afterplay', '', 'execution', 'exec', 'exec');
  }],
];
const LAST_STAGE = lessonSteps.length - 1;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const GRID = 32;
const GRID_MAJOR = 160;
const defaultView = () => ({ x: 48, y: 48, zoom: 1 });

let state = { cards: [], edges: [], stage: 0, view: defaultView() };
let history = [];
let pendingEdge = null;
let dragMoved = false;
let pendingFit = false;
let pendingPan = false;
let stepMarks = { added: new Set(), changed: new Set() };
let stepEdgeKeys = new Set();
let removedGhosts = [];
let stepNote = '';
let stepMarkTimer = 0;
let edgeDrawStart = 0;
let laneExtent = null;
const MOVE_MS = 600;
let movedFrom = new Map();
let moveStart = 0;
let phaseDelay = 0;
let spaceHeld = false;
let pointerDrag = null;
let canvasPan = null;
let linkDrag = null;
let pinch = null;
const activePointers = new Map();
let saveTimer = 0;
let animateTimer = 0;
let autoCamera = true;
try { autoCamera = localStorage.getItem('ship-loop-auto-camera') !== 'off'; } catch {}

try {
  const saved = JSON.parse(localStorage.getItem('ship-loop-board-v1'));
  if (saved && Array.isArray(saved.cards) && Array.isArray(saved.edges)) {
    const hadView = saved.view && Number.isFinite(saved.view.zoom) && Number.isFinite(saved.view.x) && Number.isFinite(saved.view.y);
    state = saved;
    pendingFit = !hadView && saved.cards.length > 0;
  }
} catch {}

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cssTheme = (type) => `--color:var(--${canonicalType(type)})`;
const categoryFor = (card) => card.category || types[canonicalType(card.type)]?.category || 'execution';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const viewport = $('#viewport');
const board = $('#board');
const isEditingField = (el) => el?.closest?.('input, textarea, select, [contenteditable="true"]');

function defaultPins(type) {
  if (type === 'trigger') return { inputs: [], outputs: [{ id: 'exec', kind: 'exec', name: '' }] };
  if (dataTypes.includes(type)) {
    const name = types[type].label;
    return {
      inputs: [{ id: 'value', kind: 'data', name, dataType: type }],
      outputs: [{ id: 'value-out', kind: 'data', name, dataType: type }],
    };
  }
  return {
    inputs: [{ id: 'exec', kind: 'exec', name: '' }],
    outputs: [{ id: 'exec', kind: 'exec', name: '' }],
  };
}
function execName(pin) {
  const name = pin?.name || '';
  return name === 'Then' ? '' : name;
}
function pinColor(pin) {
  if (!pin || pin.kind === 'exec') return 'var(--exec)';
  return variableTypes[pin.dataType]?.color || 'var(--data)';
}
function ensureCardPins(card) {
  if (!card.pins || !Array.isArray(card.pins.inputs) || !Array.isArray(card.pins.outputs)) card.pins = defaultPins(card.type);
  const clean = (pin) => pin && pin.id && (pin.kind === 'exec' || pin.kind === 'data');
  card.pins.inputs = card.pins.inputs.filter(clean);
  card.pins.outputs = card.pins.outputs.filter(clean);
}
function listPins(card, dir) {
  ensureCardPins(card);
  return dir === 'in' ? card.pins.inputs : card.pins.outputs;
}
function findPin(card, pinId, dir) {
  return listPins(card, dir).find((pin) => pin.id === pinId) || null;
}
function firstPin(card, dir, kind) {
  return listPins(card, dir).find((pin) => pin.kind === kind) || null;
}
function addPin(card, dir, pin) {
  ensureCardPins(card);
  const list = dir === 'in' ? card.pins.inputs : card.pins.outputs;
  const existing = list.find((item) => item.id === pin.id) || list.find((item) => item.kind === pin.kind && item.kind === 'data' && item.name === pin.name);
  if (existing) return existing;
  list.push(pin);
  return pin;
}
function pinLinked(cardId, pinId, dir) {
  return state.edges.some((edge) => (dir === 'out' ? edge.from === cardId && edge.fromPin === pinId : edge.to === cardId && edge.toPin === pinId));
}
// Boards saved before the guided example was rebuilt cannot be migrated, so they start fresh.
function migrateWorkshop() {
  if (state.workshopV9) return;
  state.cards = [];
  state.edges = [];
  state.stage = 0;
  state.view = defaultView();
  state.workshopV9 = true;
}
function normalizeState() {
  migrateWorkshop();
  const rows = [];
  state.cards.forEach((card, index) => {
    card.type = types[card.type] ? card.type : 'agent';
    card.category = categoryFor(card);
    if (!Number.isFinite(card.x) || !Number.isFinite(card.y)) {
      const column = Number.isInteger(card.lane) ? card.lane : index % 5;
      const row = rows[column] || 0;
      rows[column] = row + 1;
      card.x = 40 + column * 280;
      card.y = 50 + row * 180;
    }
    ensureCardPins(card);
  });
  state.edges.forEach((edge) => {
    if (edge.kind === 'normal' || edge.kind === 'retry') edge.kind = 'execution';
    if (edge.kind !== 'variable') edge.kind = 'execution';
    const fromCard = state.cards.find((card) => card.id === edge.from);
    const toCard = state.cards.find((card) => card.id === edge.to);
    if (!fromCard || !toCard) return;
    const kind = edge.kind === 'variable' ? 'data' : 'exec';
    if (!edge.fromPin) {
      let pin = firstPin(fromCard, 'out', kind);
      if (!pin && kind === 'data') pin = addPin(fromCard, 'out', { id: uid(), kind: 'data', name: edge.label || 'Value', dataType: dataTypes.includes(fromCard.type) ? fromCard.type : 'context' });
      if (!pin && kind === 'exec') pin = addPin(fromCard, 'out', { id: 'exec', kind: 'exec', name: '' });
      edge.fromPin = pin?.id;
    }
    if (!edge.toPin) {
      let pin = firstPin(toCard, 'in', kind);
      if (!pin && kind === 'data') pin = addPin(toCard, 'in', { id: uid(), kind: 'data', name: edge.label || 'Value', dataType: dataTypes.includes(fromCard.type) ? fromCard.type : 'context' });
      if (!pin && kind === 'exec') pin = addPin(toCard, 'in', { id: 'exec', kind: 'exec', name: '' });
      edge.toPin = pin?.id;
    }
  });
  state.stage = Math.max(0, Math.min(LAST_STAGE, Number.isInteger(state.stage) ? state.stage : 0));
  const view = state.view || {};
  state.view = {
    x: Number.isFinite(view.x) ? view.x : 48,
    y: Number.isFinite(view.y) ? view.y : 48,
    zoom: clamp(Number.isFinite(view.zoom) ? view.zoom : 1, MIN_ZOOM, MAX_ZOOM),
  };
}
normalizeState();
if (!state.cards.length) pendingFit = false;

function checkpoint() { history.push(JSON.stringify({ cards: state.cards, edges: state.edges, stage: state.stage })); if (history.length > 30) history.shift(); }
function save() { try { localStorage.setItem('ship-loop-board-v1', JSON.stringify(state)); $('#saved').textContent = 'Saved on this device'; } catch { $('#saved').textContent = 'Storage unavailable · export to save'; } }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

function clientToViewport(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top, width: rect.width, height: rect.height };
}
function clientToWorld(clientX, clientY) {
  const point = clientToViewport(clientX, clientY);
  return { x: (point.x - state.view.x) / state.view.zoom, y: (point.y - state.view.y) / state.view.zoom };
}
function viewportCenter() {
  const rect = viewport.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2, width: rect.width, height: rect.height };
}
function updateGrid() {
  const { x, y, zoom } = state.view;
  const minor = GRID * zoom;
  const major = GRID_MAJOR * zoom;
  const showMinor = minor >= 10;
  viewport.style.backgroundImage = showMinor
    ? 'linear-gradient(var(--grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--grid-major) 1px,transparent 1px),linear-gradient(var(--grid-minor) 1px,transparent 1px),linear-gradient(90deg,var(--grid-minor) 1px,transparent 1px)'
    : 'linear-gradient(var(--grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--grid-major) 1px,transparent 1px)';
  viewport.style.backgroundSize = showMinor ? `${major}px ${major}px,${major}px ${major}px,${minor}px ${minor}px,${minor}px ${minor}px` : `${major}px ${major}px,${major}px ${major}px`;
  viewport.style.backgroundPosition = `${x}px ${y}px`;
}
const VIEW_ANIMATION_MS = 360;
let viewFrom = null;
function paintView() {
  board.style.transform = `translate3d(${state.view.x}px, ${state.view.y}px, 0) scale(${state.view.zoom})`;
  updateGrid();
  $('#zoom-reset').textContent = `${Math.round(state.view.zoom * 100)}%`;
}
// The view is tweened through state.view itself, so pin measurements match the painted board on every frame.
function applyView({ animate = false } = {}) {
  cancelAnimationFrame(animateTimer);
  const target = { ...state.view };
  const from = viewFrom;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const still = !from || (Math.abs(from.x - target.x) < 0.5 && Math.abs(from.y - target.y) < 0.5 && Math.abs(from.zoom - target.zoom) < 0.001);
  if (!animate || reduced || still) {
    viewFrom = { ...target };
    paintView();
    saveSoon();
    return;
  }
  const start = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const frame = (now) => {
    const t = Math.min(1, (now - start) / VIEW_ANIMATION_MS);
    const k = ease(t);
    state.view.x = from.x + (target.x - from.x) * k;
    state.view.y = from.y + (target.y - from.y) * k;
    state.view.zoom = from.zoom + (target.zoom - from.zoom) * k;
    viewFrom = { ...state.view };
    paintView();
    if (t < 1) animateTimer = requestAnimationFrame(frame);
    else saveSoon();
  };
  state.view.x = from.x;
  state.view.y = from.y;
  state.view.zoom = from.zoom;
  animateTimer = requestAnimationFrame(frame);
}
function setAutoCamera(on) {
  $('#zoom-auto').setAttribute('aria-pressed', String(on));
  if (autoCamera === on) return;
  autoCamera = on;
  try { localStorage.setItem('ship-loop-auto-camera', on ? 'on' : 'off'); } catch {}
  if (on) keepAllInView();
}
function zoomAt(screenX, screenY, nextZoom, { animate = true } = {}) {
  setAutoCamera(false);
  nextZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const worldX = (screenX - state.view.x) / state.view.zoom;
  const worldY = (screenY - state.view.y) / state.view.zoom;
  state.view.zoom = nextZoom;
  state.view.x = screenX - worldX * nextZoom;
  state.view.y = screenY - worldY * nextZoom;
  applyView({ animate });
}
function zoomBy(factor) {
  const center = viewportCenter();
  zoomAt(center.x, center.y, state.view.zoom * factor);
}
function contentBounds() {
  if (!state.cards.length) return { x: 0, y: 0, w: 640, h: 400 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  state.cards.forEach((card) => {
    const node = document.querySelector(`[data-id="${CSS.escape(card.id)}"]`);
    const width = node?.offsetWidth || 252;
    const height = node?.offsetHeight || 128;
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + width);
    maxY = Math.max(maxY, card.y + height);
  });
  const byId = new Map(state.cards.map((card) => [card.id, card]));
  const lanes = state.edges.filter((edge) => edge.kind === 'execution' && byId.has(edge.from) && byId.has(edge.to) && byId.get(edge.to).x < byId.get(edge.from).x).length;
  if (lanes) minY -= 44 + lanes * 22 + 16;
  if (laneExtent) {
    minY = Math.min(minY, laneExtent.top - 16);
    maxY = Math.max(maxY, laneExtent.bottom + 16);
  }
  return { x: minX, y: minY, w: Math.max(80, maxX - minX), h: Math.max(80, maxY - minY) };
}
function fitView({ animate = true } = {}) {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 40 || height < 40) return;
  const bounds = contentBounds();
  const padding = 72;
  const zoom = clamp(Math.min((width - padding * 2) / bounds.w, (height - padding * 2) / bounds.h), MIN_ZOOM, 1.15);
  state.view.zoom = zoom;
  state.view.x = (width - bounds.w * zoom) / 2 - bounds.x * zoom;
  state.view.y = (height - bounds.h * zoom) / 2 - bounds.y * zoom;
  applyView({ animate });
}
function keepAllInView() {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 40 || height < 40 || !state.cards.length) return;
  const bounds = contentBounds();
  const pad = 56;
  const fitZoom = Math.min((width - pad * 2) / bounds.w, (height - pad * 2) / bounds.h);
  const zoom = clamp(Math.min(state.view.zoom, fitZoom), MIN_ZOOM, MAX_ZOOM);
  const left = bounds.x * zoom + state.view.x;
  const top = bounds.y * zoom + state.view.y;
  const right = left + bounds.w * zoom;
  const bottom = top + bounds.h * zoom;
  const inside = zoom === state.view.zoom && left >= pad && top >= pad && right <= width - pad && bottom <= height - pad;
  if (inside) return;
  let x = state.view.x;
  let y = state.view.y;
  if (zoom !== state.view.zoom) {
    x = (width - bounds.w * zoom) / 2 - bounds.x * zoom;
    y = (height - bounds.h * zoom) / 2 - bounds.y * zoom;
  } else {
    if (left < pad) x += pad - left;
    else if (right > width - pad) x -= right - (width - pad);
    if (top < pad) y += pad - top;
    else if (bottom > height - pad) y -= bottom - (height - pad);
  }
  state.view.zoom = zoom;
  state.view.x = x;
  state.view.y = y;
  applyView({ animate: true });
}

function palette(items) {
  return items.map((preset) => {
    const type = types[preset.type];
    return `<button type="button" class="library-item" data-preset="${preset.id}" style="${cssTheme(preset.type)}"><span class="type-icon" aria-hidden="true">${type.icon}</span><span class="preset-copy"><strong>${escape(preset.title)}</strong><span class="preset-hint">${escape(preset.hint)}</span></span></button>`;
  }).join('');
}
function renderPalette() {
  const query = $('#block-search').value.trim().toLowerCase();
  const matches = presets.filter((preset) => [preset.title, preset.hint, preset.body, types[preset.type].label].join(' ').toLowerCase().includes(query));
  const flow = matches.filter((preset) => preset.group === 'flow');
  const data = matches.filter((preset) => preset.group === 'data');
  $('#flow-library').innerHTML = palette(flow);
  $('#data-library').innerHTML = palette(data);
  $('#flow-group').hidden = flow.length === 0;
  $('#data-group').hidden = data.length === 0;
  $('#palette-empty').hidden = matches.length > 0;
  $('#palette-count').textContent = query ? `${matches.length} matching ${matches.length === 1 ? 'block' : 'blocks'}` : `${presets.length} reusable blocks`;
}
$('#block-search').addEventListener('input', renderPalette);
function pinSlotMarkup(card, pin, dir) {
  const linked = pinLinked(card.id, pin.id, dir);
  const color = pinColor(pin);
  const label = pin.kind === 'exec' ? execName(pin) : pin.name;
  const labelHtml = label ? `<span class="pin-label">${escape(label)}</span>` : '';
  return `<div class="pin-slot pin-slot-${pin.kind}${linked ? ' is-linked' : ''}" data-pin-node="${card.id}" data-pin-id="${pin.id}" data-pin-kind="${pin.kind}" data-pin-dir="${dir}" data-pin-type="${pin.dataType || 'exec'}"><button type="button" class="pin pin-${pin.kind}${linked ? ' is-linked' : ''}" style="--pin:${color}" aria-label="${dir === 'out' ? 'Output' : 'Input'} ${escape(label || (pin.kind === 'exec' ? 'control flow' : 'variable'))}"></button>${labelHtml}</div>`;
}
function nodeMarkup(card) {
  const type = types[card.type];
  ensureCardPins(card);
  const source = linkDrag && linkDrag.card.id === card.id;
  const mark = stepMarks.added.has(card.id) ? 'is-added' : stepMarks.changed.has(card.id) ? 'is-changed' : '';
  const badge = mark === 'is-added' ? 'Added' : mark === 'is-changed' ? 'Changed' : '';
  const appear = mark === 'is-added' && phaseDelay ? `--appear-delay:${Math.round(phaseDelay - (performance.now() - moveStart))}ms;` : '';
  const execIn = card.pins.inputs.filter((pin) => pin.kind === 'exec');
  const execOut = card.pins.outputs.filter((pin) => pin.kind === 'exec');
  const dataIn = card.pins.inputs.filter((pin) => pin.kind === 'data');
  const dataOut = card.pins.outputs.filter((pin) => pin.kind === 'data');
  const dataCols = dataIn.length || dataOut.length
    ? `<div class="pin-columns"><div class="pin-col pin-col-in">${dataIn.map((pin) => pinSlotMarkup(card, pin, 'in')).join('')}</div><div class="pin-col pin-col-out">${dataOut.map((pin) => pinSlotMarkup(card, pin, 'out')).join('')}</div></div>`
    : '';
  return `<article class="node card ${source ? 'selected' : ''} ${mark}" tabindex="0" role="button" aria-label="${badge ? `${badge}: ` : ''}Edit ${escape(card.title)}" data-id="${card.id}" data-category="${categoryFor(card)}" style="left:${card.x}px;top:${card.y}px;${appear}${cssTheme(card.type)}">${badge ? `<span class="node-badge">${badge}</span>` : ''}<div class="node-header"><div class="pin-col pin-col-in pin-col-exec">${execIn.map((pin) => pinSlotMarkup(card, pin, 'in')).join('')}</div><div class="node-kind">${type.icon} ${type.label}</div><div class="pin-col pin-col-out pin-col-exec">${execOut.map((pin) => pinSlotMarkup(card, pin, 'out')).join('')}</div></div><h3>${escape(card.title)}</h3><p>${escape(card.body)}</p>${dataCols}</article>`;
}
function ghostMarkup(card) {
  const type = types[card.type] || types.agent;
  return `<article class="node card is-removed" data-ghost="true" aria-hidden="true" style="left:${card.x}px;top:${card.y}px;${cssTheme(card.type)}"><span class="node-badge">Removed</span><div class="node-header"><div class="node-kind">${type.icon} ${type.label}</div></div><h3>${escape(card.title)}</h3><p>${escape(card.body)}</p></article>`;
}
function render() {
  save();
  renderPalette();
  $('#nodes').innerHTML = state.cards.map(nodeMarkup).join('') + removedGhosts.map(ghostMarkup).join('');
  const moving = playMoves();
  const [title, description, next] = lessonSteps[state.stage];
  const stepLabel = (value) => String(value).padStart(2, '0');
  $('#step-number').textContent = `${stepLabel(state.stage)} / ${stepLabel(LAST_STAGE)}`;
  $('#step-title').textContent = title;
  $('#step-description').textContent = description;
  $('#next').textContent = next;
  $('#next').disabled = state.stage === LAST_STAGE;
  $('#progress').innerHTML = lessonSteps.slice(1).map((_, index) => `<div class="progress-segment ${index < state.stage ? 'active' : ''}"></div>`).join('');
  $('#count').textContent = `${state.cards.length} nodes · ${state.edges.length} connections`;
  $('#undo').disabled = !history.length;
  $('#connection-hint').classList.toggle('active', !!linkDrag);
  $('#connection-hint').classList.toggle('is-step-note', !linkDrag && !!stepNote);
  if (linkDrag) {
    $('#connection-hint').textContent = linkDrag.pin.kind === 'exec' ? 'Drop on a white control pin or a node.' : 'Drop on a node to give it this variable.';
  } else if (stepNote) {
    $('#connection-hint').innerHTML = stepNote;
  } else {
    $('#connection-hint').textContent = 'Drag ▷ for control flow · Drag ● to pass a variable';
  }
  requestAnimationFrame(() => {
    drawEdges();
    if (pendingPan) {
      pendingPan = false;
      if (autoCamera) keepAllInView();
    } else if (pendingFit) {
      pendingFit = false;
      if (state.cards.length) fitView();
    }
    if (moving) followMoves();
  });
}
// Nodes are rebuilt on every render, so a slide resumes from the elapsed time instead of restarting.
function playMoves() {
  const elapsed = performance.now() - moveStart;
  if (!movedFrom.size || elapsed >= MOVE_MS) return false;
  movedFrom.forEach(({ dx, dy }, id) => {
    const node = document.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
    if (!node?.animate) return;
    const slide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: MOVE_MS, easing: 'cubic-bezier(.45, 0, .2, 1)', fill: 'backwards' });
    slide.currentTime = elapsed;
  });
  return true;
}
function followMoves() {
  drawEdges();
  if (performance.now() - moveStart < MOVE_MS) requestAnimationFrame(followMoves);
}
function nodeBox(card, el) {
  const width = el?.offsetWidth || 252;
  const height = el?.offsetHeight || 128;
  return { left: card.x, top: card.y, right: card.x + width, bottom: card.y + height, width, height };
}
function pinAnchor(card, pinId, dir) {
  const pinEl = document.querySelector(`[data-pin-node="${CSS.escape(card.id)}"][data-pin-id="${CSS.escape(pinId)}"][data-pin-dir="${dir}"] .pin`);
  if (pinEl) {
    const rect = pinEl.getBoundingClientRect();
    const base = viewport.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - base.left - state.view.x) / state.view.zoom,
      y: (rect.top + rect.height / 2 - base.top - state.view.y) / state.view.zoom,
    };
  }
  const box = nodeBox(card, document.querySelector(`[data-id="${CSS.escape(card.id)}"]`));
  return { x: dir === 'out' ? box.right : box.left, y: box.top + 36 };
}
function returnPath(sx, sy, tx, ty, dip) {
  const r = 56;
  return `M${sx},${sy} C${sx + r},${sy} ${sx + r},${dip} ${sx},${dip} L${tx},${dip} C${tx - r},${dip} ${tx - r},${ty} ${tx},${ty}`;
}
function lanePath(sx, sy, tx, ty, lane) {
  const r = 28;
  if (tx - sx < 4 * r) return returnPath(sx, sy, tx, ty, lane);
  return `M${sx},${sy} C${sx + r},${sy} ${sx + r},${lane} ${sx + 2 * r},${lane} L${tx - 2 * r},${lane} C${tx - r},${lane} ${tx - r},${ty} ${tx},${ty}`;
}
function splineBend(sx, tx) {
  return tx < sx ? 120 : Math.max(48, Math.abs(tx - sx) * 0.5);
}
function splinePath(sx, sy, tx, ty) {
  const bend = splineBend(sx, tx);
  return `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`;
}
function splineBlocked(sx, sy, tx, ty, boxes) {
  const bend = splineBend(sx, tx);
  const pad = 10;
  for (let step = 1; step < 32; step += 1) {
    const t = step / 32;
    const u = 1 - t;
    const x = u * u * u * sx + 3 * u * u * t * (sx + bend) + 3 * u * t * t * (tx - bend) + t * t * t * tx;
    const y = u * u * u * sy + 3 * u * u * t * sy + 3 * u * t * t * ty + t * t * t * ty;
    if (boxes.some((box) => x > box.left - pad && x < box.right + pad && y > box.top - pad && y < box.bottom + pad)) return true;
  }
  return false;
}
function drawEdges() {
  const svg = $('#arrows');
  const paths = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let returnLane = 0;
  const boxes = new Map(state.cards.map((card) => [card.id, nodeBox(card, document.querySelector(`.node[data-id="${CSS.escape(card.id)}"]`))]));
  const lanes = [];
  const claimLane = (y, dir, x0, x1) => {
    while (lanes.some((lane) => Math.abs(lane.y - y) < 12 && lane.x0 < x1 && lane.x1 > x0)) y += dir * 14;
    lanes.push({ y, x0, x1 });
    return y;
  };
  const byKind = (variable) => state.edges.filter((edge) => (edge.kind === 'variable') === variable);
  [...byKind(false), ...byKind(true)].forEach((edge) => {
    const fromCard = state.cards.find((card) => card.id === edge.from);
    const toCard = state.cards.find((card) => card.id === edge.to);
    if (!fromCard || !toCard) return;
    const start = pinAnchor(fromCard, edge.fromPin, 'out');
    const end = pinAnchor(toCard, edge.toPin, 'in');
    const data = edge.kind === 'variable';
    const fromPin = findPin(fromCard, edge.fromPin, 'out');
    const returning = !data && end.x < start.x;
    let dip = 0;
    let routed = false;
    if (returning) {
      const tops = state.cards.filter((card) => card.x < start.x && card.x + NODE_W > end.x).map((card) => card.y);
      dip = Math.min(start.y, end.y, ...tops) - 44 - returnLane * 22;
      returnLane += 1;
      lanes.push({ y: dip, x0: end.x - 60, x1: start.x + 60 });
    } else if (data) {
      const others = [...boxes].filter(([id]) => id !== edge.from && id !== edge.to).map(([, box]) => box);
      if (end.x < start.x + 24 || splineBlocked(start.x, start.y, end.x, end.y, others)) {
        const x0 = Math.min(start.x, end.x) - 60;
        const x1 = Math.max(start.x, end.x) + 60;
        const span = [...boxes.values()].filter((box) => box.left < x1 && box.right > x0);
        const above = Math.min(start.y, end.y, ...span.map((box) => box.top)) - 32;
        const below = Math.max(start.y, end.y, ...span.map((box) => box.bottom)) + 32;
        const up = start.y + end.y - 2 * above <= 2 * below - start.y - end.y;
        dip = up ? claimLane(above, -1, x0, x1) : claimLane(below, 1, x0, x1);
        routed = true;
      }
    }
    const path = returning ? returnPath(start.x, start.y, end.x, end.y, dip) : routed ? lanePath(start.x, start.y, end.x, end.y, dip) : splinePath(start.x, start.y, end.x, end.y);
    const lx = (start.x + end.x) / 2;
    const ly = returning ? dip : (start.y + end.y) / 2 - (data ? 0 : 10);
    const width = Math.max(34, (edge.label || '').length * 5.8 + 14);
    include(start.x, start.y);
    include(end.x, end.y);
    include(start.x + 48, start.y);
    include(end.x - 48, end.y);
    if (returning || routed) {
      include(start.x + 60, dip);
      include(end.x - 60, dip);
    }
    if (!data && edge.label) {
      include(lx - width / 2, ly - 12);
      include(lx + width / 2, ly + 12);
    }
    paths.push({ edge, data, path, lx, ly, width, color: data ? pinColor(fromPin) : 'var(--exec)' });
  });
  laneExtent = lanes.length ? { top: Math.min(...lanes.map((lane) => lane.y)), bottom: Math.max(...lanes.map((lane) => lane.y)) } : null;
  if (linkDrag) {
    const path = splinePath(linkDrag.start.x, linkDrag.start.y, linkDrag.current.x, linkDrag.current.y);
    include(linkDrag.start.x, linkDrag.start.y);
    include(linkDrag.current.x, linkDrag.current.y);
    paths.push({ preview: true, data: linkDrag.pin.kind === 'data', path, color: pinColor(linkDrag.pin) });
  }
  if (!paths.length) {
    svg.removeAttribute('viewBox');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.left = '0';
    svg.style.top = '0';
    svg.innerHTML = '';
    return;
  }
  const pad = 80;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.left = `${minX}px`;
  svg.style.top = `${minY}px`;
  let result = '';
  const freshOrder = [...stepEdgeKeys];
  const elapsed = performance.now() - edgeDrawStart;
  paths.forEach((item) => {
    if (item.preview) {
      result += `<path class="edge-spline preview-spline ${item.data ? 'data-spline' : 'execution-spline'}" d="${item.path}" style="--pin:${item.color}" stroke="${item.color}" stroke-width="${item.data ? 2 : 2.6}"/>`;
      return;
    }
    result += `<path class="edge-hit" data-edge="${item.edge.id}" d="${item.path}" stroke-width="18"/>`;
    const freshIndex = freshOrder.indexOf(item.edge.id);
    if (freshIndex < 0) {
      result += `<path class="edge-spline ${item.data ? 'data-spline' : 'execution-spline'}" d="${item.path}" style="--pin:${item.color}" stroke="${item.color}" stroke-width="${item.data ? 2 : 2.6}"/>`;
    } else {
      // Arrows are redrawn often; a negative delay resumes the draw-in instead of restarting it.
      const delay = `${Math.round(300 + freshIndex * 160 - elapsed)}ms`;
      result += `<path class="edge-spline ${item.data ? 'data-spline' : 'execution-spline'} is-fresh" pathLength="1" d="${item.path}" style="--pin:${item.color};--draw-delay:${delay}" stroke="${item.color}" stroke-width="${item.data ? 2 : 2.6}"/>`;
      result += `<circle class="edge-pulse" r="${item.data ? 4.5 : 5.5}" fill="${item.color}" style="offset-path:path('${item.path}');--draw-delay:${delay}"/>`;
    }
    if (!item.data && item.edge.label) result += `<g class="edge-label" data-edge="${item.edge.id}" role="button" tabindex="0" aria-label="Edit connection ${escape(item.edge.label)}"><rect x="${item.lx - item.width / 2}" y="${item.ly - 9}" width="${item.width}" height="18" rx="4"/><text x="${item.lx}" y="${item.ly + 3}" text-anchor="middle" font-size="10">${escape(item.edge.label)}</text></g>`;
  });
  svg.innerHTML = result;
}
function nextPosition() {
  const center = viewportCenter();
  const worldX = (center.x - state.view.x) / state.view.zoom - NODE_W / 2;
  const worldY = (center.y - state.view.y) / state.view.zoom - 64;
  return openSpot(worldX, worldY);
}
function variableTypeOptions(selected) {
  return dataTypes.map((key) => `<option value="${key}" ${key === canonicalDataType(selected) ? 'selected' : ''}>${variableTypes[key].label}</option>`).join('');
}
function pinEditorRow(pin, dir) {
  if (pin.kind === 'exec') return `<div class="pin-edit-row" data-pin-dir="${dir}" data-pin-id="${pin.id}" data-pin-kind="exec"><span class="pin-dot exec"></span><input value="${escape(execName(pin))}" maxlength="40" data-pin-name placeholder="Optional label"><span class="muted">flow</span></div>`;
  return `<div class="pin-edit-row" data-pin-dir="${dir}" data-pin-id="${pin.id}" data-pin-kind="data"><span class="pin-dot" style="--pin:${pinColor(pin)}"></span><input value="${escape(pin.name)}" maxlength="40" data-pin-name placeholder="Variable name"><select data-pin-type>${variableTypeOptions(pin.dataType || 'context')}</select><button type="button" data-remove-pin>Remove</button></div>`;
}
function readPinsFromEditor(dir) {
  return [...document.querySelectorAll(`.pin-edit-row[data-pin-dir="${dir}"]`)].map((row) => {
    const kind = row.dataset.pinKind;
    const pin = { id: row.dataset.pinId, kind, name: row.querySelector('[data-pin-name]').value.trim() };
    if (kind === 'data') pin.dataType = row.querySelector('[data-pin-type]').value;
    return pin;
  });
}
function openCard(id, type = 'agent') {
  const card = state.cards.find((item) => item.id === id);
  $('#card-id').value = card?.id || '';
  $('#card-title').value = card?.title || '';
  $('#card-body').value = card?.body || '';
  $('#card-type').innerHTML = Object.entries(types).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
  $('#card-type').value = card?.type || type;
  $('#card-category').value = card?.category || types[type]?.category || 'execution';
  $('#delete').hidden = !card;
  const pins = card ? (ensureCardPins(card), card.pins) : defaultPins(type);
  $('#pin-inputs').innerHTML = pins.inputs.map((pin) => pinEditorRow(pin, 'in')).join('');
  $('#pin-outputs').innerHTML = pins.outputs.map((pin) => pinEditorRow(pin, 'out')).join('');
  $('#card-connections').innerHTML = card ? state.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => `<div class="connection-row"><span>${edge.from === id ? '→' : '←'} ${escape(state.cards.find((item) => item.id === (edge.from === id ? edge.to : edge.from))?.title || '')} · ${escape(edge.label || (edge.kind === 'variable' ? 'variable' : 'flow'))}</span><button type="button" data-remove-edge="${edge.id}">Remove</button></div>`).join('') : '';
  $('#editor').showModal();
}
function openEdge(edge) {
  pendingEdge = { ...edge };
  const from = state.cards.find((card) => card.id === edge.from);
  const to = state.cards.find((card) => card.id === edge.to);
  const fromPin = from ? findPin(from, edge.fromPin, 'out') : null;
  const toPin = to ? findPin(to, edge.toPin, 'in') : null;
  $('#edge-summary').textContent = `${from?.title || ''} ${fromPin?.name ? `(${fromPin.name})` : ''} → ${to?.title || ''} ${toPin?.name ? `(${toPin.name})` : ''}`;
  $('#edge-label').value = edge.label || '';
  $('#edge-kind').value = edge.kind || 'execution';
  $('#edge-label-row').hidden = edge.kind === 'variable';
  $('#edge-editor').showModal();
}

function slotFromEvent(event) {
  return event.target.closest?.('.pin-slot') || document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.pin-slot') || null;
}
function pinFromSlot(slot) {
  if (!slot) return null;
  const card = state.cards.find((item) => item.id === slot.dataset.pinNode);
  if (!card) return null;
  const pin = findPin(card, slot.dataset.pinId, slot.dataset.pinDir);
  if (!pin) return null;
  return { card, pin, dir: slot.dataset.pinDir, slot };
}
function highlightDrops(source) {
  document.querySelectorAll('.pin-slot').forEach((slot) => {
    const target = pinFromSlot(slot);
    const ok = target && target.card.id !== source.card.id && target.dir !== source.dir && target.pin.kind === source.pin.kind;
    slot.classList.toggle('is-compatible', !!ok);
    slot.classList.remove('is-target');
  });
  document.querySelectorAll('.node').forEach((node) => node.classList.remove('is-drop-target'));
}
function clearHighlights() {
  document.querySelectorAll('.pin-slot').forEach((slot) => slot.classList.remove('is-compatible', 'is-target'));
  document.querySelectorAll('.node').forEach((node) => node.classList.remove('is-drop-target', 'selected'));
  viewport.classList.remove('is-linking');
}
function acceptPin(targetCard, source) {
  if (source.pin.kind === 'exec') {
    return firstPin(targetCard, 'in', 'exec') || addPin(targetCard, 'in', { id: 'exec', kind: 'exec', name: '' });
  }
  const match = listPins(targetCard, 'in').find((pin) => pin.kind === 'data' && (pin.id === source.pin.id || pin.name === source.pin.name || pin.dataType === source.pin.dataType && pin.name === source.pin.name));
  if (match) return match;
  const named = listPins(targetCard, 'in').find((pin) => pin.kind === 'data' && pin.name === source.pin.name);
  if (named) return named;
  return addPin(targetCard, 'in', { id: uid(), kind: 'data', name: source.pin.name || 'Value', dataType: canonicalDataType(source.pin.dataType || 'context') });
}
function connectPins(source, target) {
  if (!source || !target || source.card.id === target.card.id) return;
  let out = source.dir === 'out' ? source : target;
  let inn = source.dir === 'in' ? source : target;
  if (out.dir !== 'out' || inn.dir !== 'in') {
    if (source.dir === 'out' && target.card) {
      inn = { card: target.card, pin: acceptPin(target.card, source), dir: 'in' };
      out = source;
    } else return;
  }
  if (!inn.pin && inn.card && out.pin) inn.pin = acceptPin(inn.card, out);
  if (!out.pin && out.card && inn.pin) out.pin = firstPin(out.card, 'out', inn.pin.kind);
  if (!out.pin || !inn.pin || out.pin.kind !== inn.pin.kind) return;
  if (state.edges.some((edge) => edge.from === out.card.id && edge.to === inn.card.id && edge.fromPin === out.pin.id && edge.toPin === inn.pin.id)) return;
  checkpoint();
  // Alternative control paths may converge; a variable input has one source unless it gathers many.
  if (inn.pin.kind === 'data' && !inn.pin.multi) state.edges = state.edges.filter((edge) => !(edge.to === inn.card.id && edge.toPin === inn.pin.id && edge.kind === 'variable'));
  state.edges.push({
    id: uid(),
    from: out.card.id,
    to: inn.card.id,
    fromPin: out.pin.id,
    toPin: inn.pin.id,
    kind: out.pin.kind === 'data' ? 'variable' : 'execution',
    label: out.pin.kind === 'exec' ? execName(out.pin) : '',
  });
  render();
}
function dropLink(event, source) {
  const slot = slotFromEvent(event);
  const targetPin = pinFromSlot(slot);
  if (targetPin && targetPin.card.id !== source.card.id) {
    if (targetPin.pin.kind !== source.pin.kind) return;
    connectPins(source, targetPin);
    return;
  }
  const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node');
  if (!node) return;
  const card = state.cards.find((item) => item.id === node.dataset.id);
  if (!card || card.id === source.card.id) return;
  connectPins(source, { card, dir: 'in' });
}

document.addEventListener('click', (event) => {
  const close = event.target.closest('.close');
  if (close) {
    close.closest('dialog').close();
    return;
  }
  const library = event.target.closest('[data-preset]');
  if (library) return addFromPreset(library.dataset.preset);
  const edge = event.target.closest('[data-edge]');
  if (edge) return openEdge(state.edges.find((item) => item.id === edge.dataset.edge));
  const remove = event.target.closest('[data-remove-edge]');
  if (remove) { checkpoint(); state.edges = state.edges.filter((item) => item.id !== remove.dataset.removeEdge); return render(); }
  const removePin = event.target.closest('[data-remove-pin]');
  if (removePin) { removePin.closest('.pin-edit-row').remove(); return; }
  if (event.target.closest('.pin-slot, .pin')) return;
  const card = event.target.closest('.node');
  if (card && !dragMoved) chooseCard(card.dataset.id);
  dragMoved = false;
});
function chooseCard(id) { openCard(id); }
document.addEventListener('keydown', (event) => {
  if (event.target.matches('.node') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); chooseCard(event.target.dataset.id); return; }
  if (event.target.matches('.edge-label') && event.key === 'Enter') { openEdge(state.edges.find((item) => item.id === event.target.dataset.edge)); return; }
  if (event.key === 'Escape') { linkDrag = null; clearHighlights(); render(); }
  if (isEditingField(event.target) || event.target.closest('dialog, button, a')) return;
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    spaceHeld = true;
    viewport.classList.add('is-space');
  }
  if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomBy(1.2); }
  if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(1 / 1.2); }
  if (event.key === '0') { event.preventDefault(); const center = viewportCenter(); zoomAt(center.x, center.y, 1); }
  if (event.key === '1' || event.key === 'f' || event.key === 'F') { event.preventDefault(); fitView(); }
});
document.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    spaceHeld = false;
    viewport.classList.remove('is-space');
  }
});
window.addEventListener('blur', () => {
  spaceHeld = false;
  viewport.classList.remove('is-space');
});
$('#card-type').addEventListener('change', (event) => {
  $('#card-category').value = types[event.target.value].category;
  if (!$('#card-id').value) {
    const pins = defaultPins(event.target.value);
    $('#pin-inputs').innerHTML = pins.inputs.map((pin) => pinEditorRow(pin, 'in')).join('');
    $('#pin-outputs').innerHTML = pins.outputs.map((pin) => pinEditorRow(pin, 'out')).join('');
  }
});
$('#add-input').onclick = () => { $('#pin-inputs').insertAdjacentHTML('beforeend', pinEditorRow({ id: uid(), kind: 'data', name: 'Value', dataType: 'context' }, 'in')); };
$('#add-output').onclick = () => { $('#pin-outputs').insertAdjacentHTML('beforeend', pinEditorRow({ id: uid(), kind: 'data', name: 'Value', dataType: 'context' }, 'out')); };
$('#card-form').onsubmit = (event) => {
  event.preventDefault();
  if (!$('#card-title').value.trim()) return;
  checkpoint();
  const id = $('#card-id').value;
  const previous = state.cards.find((card) => card.id === id);
  const position = previous || nextPosition();
  const type = $('#card-type').value;
  const pins = { inputs: readPinsFromEditor('in'), outputs: readPinsFromEditor('out') };
  if (categoryFor({ type, category: $('#card-category').value }) === 'data') {
    pins.outputs.filter((pin) => pin.kind === 'data').forEach((pin) => { if (!pin.name) pin.name = $('#card-title').value.trim(); });
  }
  const card = { id: id || uid(), title: $('#card-title').value.trim(), body: $('#card-body').value, type, category: $('#card-category').value, x: position.x, y: position.y, pins };
  if (id) {
    const kept = new Set([...pins.inputs, ...pins.outputs].map((pin) => pin.id));
    state.edges = state.edges.filter((edge) => {
      if (edge.from === id && !kept.has(edge.fromPin)) return false;
      if (edge.to === id && !kept.has(edge.toPin)) return false;
      return true;
    });
    state.cards[state.cards.findIndex((item) => item.id === id)] = card;
  } else state.cards.push(card);
  $('#editor').close(); render();
};
$('#delete').onclick = () => { checkpoint(); const id = $('#card-id').value; state.cards = state.cards.filter((card) => card.id !== id); state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id); $('#editor').close(); render(); };
$('#edge-form').onsubmit = (event) => { event.preventDefault(); checkpoint(); const edge = { ...pendingEdge, label: $('#edge-label').value.trim(), kind: pendingEdge.kind }; const index = state.edges.findIndex((item) => item.id === edge.id); if (index >= 0) state.edges[index] = edge; $('#edge-editor').close(); render(); };
$('#delete-edge').onclick = () => { if (!pendingEdge) return; checkpoint(); state.edges = state.edges.filter((item) => item.id !== pendingEdge.id); $('#edge-editor').close(); render(); };
$('#undo').onclick = () => { if (!history.length) return; const previous = JSON.parse(history.pop()); state.cards = previous.cards; state.edges = previous.edges; state.stage = previous.stage; linkDrag = null; clearHighlights(); resetStepMarks(); render(); };
$('#reset').onclick = () => $('#reset-dialog').showModal();
$('#confirm-reset').onclick = () => { checkpoint(); state = { cards: [], edges: [], stage: 0, view: defaultView(), workshopV9: true }; linkDrag = null; clearHighlights(); resetStepMarks(); $('#reset-dialog').close(); applyView({ animate: true }); render(); };
$('#zoom-in').onclick = () => zoomBy(1.2);
$('#zoom-out').onclick = () => zoomBy(1 / 1.2);
$('#zoom-reset').onclick = () => { const center = viewportCenter(); zoomAt(center.x, center.y, 1); };
$('#zoom-fit').onclick = () => fitView();
$('#zoom-auto').onclick = () => setAutoCamera(!autoCamera);
setAutoCamera(autoCamera);

function beginPinch() {
  if (activePointers.size < 2) return;
  const points = [...activePointers.values()];
  const mid = clientToViewport((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
  pinch = {
    dist: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
    zoom: state.view.zoom,
    worldX: (mid.x - state.view.x) / state.view.zoom,
    worldY: (mid.y - state.view.y) / state.view.zoom,
  };
  pointerDrag = null;
  canvasPan = null;
  linkDrag = null;
  viewport.classList.add('is-panning');
}
function onPointerDown(event) {
  if (event.target.closest('dialog, aside, header, .board-toolbar, .lesson, footer')) return;
  if (!viewport.contains(event.target) && event.target !== viewport) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    event.preventDefault();
    beginPinch();
    return;
  }
  const slot = event.target.closest('.pin-slot, .pin')?.closest('.pin-slot');
  if (slot && !spaceHeld && event.button === 0) {
    const source = pinFromSlot(slot);
    if (!source) return;
    event.preventDefault();
    const start = pinAnchor(source.card, source.pin.id, source.dir);
    linkDrag = { ...source, start, current: clientToWorld(event.clientX, event.clientY), moved: false, sx: event.clientX, sy: event.clientY };
    viewport.classList.add('is-linking');
    highlightDrops(source);
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    drawEdges();
    return;
  }
  const node = event.target.closest('.node');
  const onHandle = event.target.closest('button, [data-edge], a, input, textarea, select');
  const panButton = event.button === 1 || event.button === 2;
  if (node && !onHandle && !spaceHeld && event.button === 0) {
    event.preventDefault();
    const card = state.cards.find((item) => item.id === node.dataset.id);
    if (!card) return;
    pointerDrag = { node, card, startX: event.clientX, startY: event.clientY, originX: card.x, originY: card.y, moved: false };
    try { node.setPointerCapture(event.pointerId); } catch {}
    return;
  }
  if (onHandle && !spaceHeld && !panButton) return;
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  event.preventDefault();
  canvasPan = { startX: event.clientX, startY: event.clientY, originX: state.view.x, originY: state.view.y, moved: false };
  viewport.classList.add('is-panning');
  try { viewport.setPointerCapture(event.pointerId); } catch {}
}
function onPointerMove(event) {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && activePointers.size >= 2) {
    event.preventDefault();
    const points = [...activePointers.values()];
    const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
    const mid = clientToViewport((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    const nextZoom = clamp(pinch.zoom * (dist / pinch.dist), MIN_ZOOM, MAX_ZOOM);
    setAutoCamera(false);
    state.view.zoom = nextZoom;
    state.view.x = mid.x - pinch.worldX * nextZoom;
    state.view.y = mid.y - pinch.worldY * nextZoom;
    applyView();
    return;
  }
  if (linkDrag) {
    event.preventDefault();
    linkDrag.current = clientToWorld(event.clientX, event.clientY);
    if (!linkDrag.moved && Math.hypot(event.clientX - linkDrag.sx, event.clientY - linkDrag.sy) > 3) linkDrag.moved = true;
    const slot = slotFromEvent(event);
    document.querySelectorAll('.pin-slot.is-target').forEach((el) => el.classList.remove('is-target'));
    document.querySelectorAll('.node.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    if (slot?.classList.contains('is-compatible')) slot.classList.add('is-target');
    else {
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node');
      if (node && node.dataset.id !== linkDrag.card.id) node.classList.add('is-drop-target');
    }
    drawEdges();
    return;
  }
  if (pointerDrag) {
    const dx = (event.clientX - pointerDrag.startX) / state.view.zoom;
    const dy = (event.clientY - pointerDrag.startY) / state.view.zoom;
    if (!pointerDrag.moved && Math.hypot(dx, dy) * state.view.zoom < 4) return;
    if (!pointerDrag.moved) { checkpoint(); pointerDrag.moved = true; }
    event.preventDefault();
    pointerDrag.card.x = pointerDrag.originX + dx;
    pointerDrag.card.y = pointerDrag.originY + dy;
    pointerDrag.node.style.left = `${pointerDrag.card.x}px`;
    pointerDrag.node.style.top = `${pointerDrag.card.y}px`;
    drawEdges();
    return;
  }
  if (canvasPan) {
    const dx = event.clientX - canvasPan.startX;
    const dy = event.clientY - canvasPan.startY;
    if (!canvasPan.moved && Math.hypot(dx, dy) < 3) return;
    canvasPan.moved = true;
    event.preventDefault();
    setAutoCamera(false);
    state.view.x = canvasPan.originX + dx;
    state.view.y = canvasPan.originY + dy;
    applyView();
  }
}
function endPointer(event) {
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinch = null;
  if (linkDrag) {
    if (linkDrag.moved) {
      dropLink(event, linkDrag);
      dragMoved = true;
    }
    linkDrag = null;
    clearHighlights();
    render();
  }
  if (pointerDrag) {
    if (pointerDrag.moved) { dragMoved = true; render(); }
    pointerDrag = null;
  }
  if (canvasPan) {
    if (canvasPan.moved) dragMoved = true;
    canvasPan = null;
  }
  if (!canvasPan && !pinch) viewport.classList.remove('is-panning');
}
document.addEventListener('pointerdown', onPointerDown);
document.addEventListener('pointermove', onPointerMove);
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
document.addEventListener('contextmenu', (event) => {
  if (viewport.contains(event.target) || event.target === viewport) event.preventDefault();
});
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = clientToViewport(event.clientX, event.clientY);
  const deltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
  const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  const zoomGesture = event.ctrlKey || event.metaKey || event.altKey || !deltaX;
  if (!zoomGesture) {
    setAutoCamera(false);
    state.view.x -= deltaX;
    state.view.y -= deltaY;
    applyView();
    return;
  }
  zoomAt(point.x, point.y, state.view.zoom * Math.exp(-deltaY * 0.0018), { animate: false });
}, { passive: false });
viewport.addEventListener('dblclick', (event) => {
  if (event.target.closest('.node, button, [data-edge]')) return;
  fitView();
});
['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
  viewport.addEventListener(name, (event) => event.preventDefault());
});

function edge(from, to, label = '', kind = 'execution', fromPin, toPin) {
  const fromCard = state.cards.find((cardItem) => cardItem.id === from);
  const toCard = state.cards.find((cardItem) => cardItem.id === to);
  if (!fromCard || !toCard) return;
  const pinKind = kind === 'variable' ? 'data' : 'exec';
  fromPin = fromPin || firstPin(fromCard, 'out', pinKind)?.id;
  toPin = toPin || firstPin(toCard, 'in', pinKind)?.id || acceptPin(toCard, { pin: findPin(fromCard, fromPin, 'out') || { kind: pinKind, name: label, dataType: 'context' } }).id;
  if (!fromPin || !toPin) return;
  if (state.edges.some((item) => item.from === from && item.to === to && item.fromPin === fromPin && item.toPin === toPin)) return;
  state.edges.push({ id: uid(), from, to, label, kind, fromPin, toPin });
}
function unlink(from, to) { state.edges = state.edges.filter((edgeItem) => edgeItem.from !== from || edgeItem.to !== to); }
function setCardText(id, title, body) {
  const item = state.cards.find((cardItem) => cardItem.id === id);
  if (!item) return;
  if (title) item.title = title;
  if (body) item.body = body;
}
const NODE_W = 252;
const NODE_H = 220;
const NODE_GAP = 96;
let reservedRects = [];
function cardRect(card) {
  const node = document.querySelector(`[data-id="${CSS.escape(card.id)}"]`);
  return { x: card.x, y: card.y, w: node?.offsetWidth || NODE_W, h: node?.offsetHeight || NODE_H };
}
function spotBlocked(x, y, w, h, obstacles) {
  return obstacles.some((box) => x < box.x + box.w + NODE_GAP && x + w + NODE_GAP > box.x && y < box.y + box.h + NODE_GAP && y + h + NODE_GAP > box.y);
}
function openSpot(x, y) {
  const obstacles = [...state.cards.map(cardRect), ...reservedRects];
  if (!spotBlocked(x, y, NODE_W, NODE_H, obstacles)) return { x, y };
  const stepX = NODE_W + NODE_GAP;
  const stepY = NODE_H + NODE_GAP;
  const prefer = ([dx, dy]) => (dy > 0 ? 0 : dy < 0 ? 2 : 1) * 4 + (dx < 0 ? 1 : 0);
  for (let radius = 1; radius <= 12; radius += 1) {
    const ring = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        ring.push([dx, dy]);
      }
    }
    ring.sort((a, b) => prefer(a) - prefer(b) || Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])));
    for (const [dx, dy] of ring) {
      const nx = x + dx * stepX;
      const ny = y + dy * stepY;
      if (!spotBlocked(nx, ny, NODE_W, NODE_H, obstacles)) return { x: nx, y: ny };
    }
  }
  let nx = x + stepX * 13;
  let guard = 0;
  while (spotBlocked(nx, y, NODE_W, NODE_H, obstacles) && guard < 40) {
    nx += stepX;
    guard += 1;
  }
  return { x: nx, y };
}
function pointBeside(anchorId, direction) {
  const card = state.cards.find((item) => item.id === anchorId);
  if (!card) return { x: 40, y: 48 };
  const rect = cardRect(card);
  if (direction === 'left') return { x: rect.x - NODE_W - NODE_GAP, y: rect.y };
  if (direction === 'below') return { x: rect.x, y: rect.y + rect.h + NODE_GAP };
  if (direction === 'above') return { x: rect.x, y: rect.y - NODE_H - NODE_GAP };
  return { x: rect.x + rect.w + NODE_GAP, y: rect.y };
}
function cardFromPreset(preset, id, { x, y }) {
  return { id, title: preset.title, body: preset.body, type: preset.type, category: types[preset.type].category, x, y, pins: JSON.parse(JSON.stringify(preset.pins)) };
}
function place(id, presetId, x, y) {
  const preset = lessonPresetById[presetId];
  if (!preset || state.cards.some((item) => item.id === id)) return;
  state.cards.push(cardFromPreset(preset, id, openSpot(x, y)));
}
function insertBefore(id, presetId, targetId) {
  const target = state.cards.find((item) => item.id === targetId);
  const preset = lessonPresetById[presetId];
  if (!target || !preset || state.cards.some((item) => item.id === id)) return;
  state.cards.push(cardFromPreset(preset, id, target));
  target.x += NODE_W + NODE_GAP;
}
function placeReturning(id, presetId, anchorId) {
  const origin = pointBeside(anchorId, 'right');
  place(id, presetId, origin.x + NODE_GAP, origin.y + Math.round(NODE_H * 0.6));
}
function placeNext(id, presetId, anchorId, direction) {
  const origin = pointBeside(anchorId, direction);
  place(id, presetId, origin.x, origin.y);
}
function flowLayout() {
  const byId = new Map(state.cards.map((card) => [card.id, card]));
  const isFlow = (card) => (card.category || types[card.type]?.category) === 'execution';
  const forward = state.edges.filter((item) => item.kind === 'execution' && item.toPin !== 'again');
  const produced = state.edges.filter((item) => item.kind === 'variable' && byId.has(item.from) && byId.has(item.to) && isFlow(byId.get(item.from)) && !isFlow(byId.get(item.to)) && byId.get(item.to).type !== 'task');
  const margin = 12;
  for (let pass = 0; pass < 80; pass += 1) {
    let moved = false;
    for (const item of forward) {
      const from = byId.get(item.from);
      const to = byId.get(item.to);
      if (!from || !to) continue;
      const min = from.x + cardRect(from).w + NODE_GAP;
      if (to.x < min) { to.x = min; moved = true; }
    }
    for (const item of produced) {
      const from = byId.get(item.from);
      const to = byId.get(item.to);
      if (to.x < from.x) { to.x = from.x; moved = true; }
    }
    const sorted = [...state.cards].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < sorted.length; i += 1) {
      const a = cardRect(sorted[i]);
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = cardRect(sorted[j]);
        if (a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y) {
          sorted[j].x = a.x + a.w + NODE_GAP;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}
function removeCard(id) {
  const item = state.cards.find((card) => card.id === id);
  if (item) reservedRects.push(cardRect(item));
  state.cards = state.cards.filter((card) => card.id !== id);
  state.edges = state.edges.filter((edgeItem) => edgeItem.from !== id && edgeItem.to !== id);
}
function edgeStructuralKey(item) {
  return [item.kind, item.from, item.fromPin, item.to, item.toPin, item.label || ''].join('|');
}
function edgeTouch(edges, id) {
  return edges.filter((item) => item.from === id || item.to === id).map(edgeStructuralKey).sort().join('~');
}
function resetStepMarks() {
  clearTimeout(stepMarkTimer);
  stepMarks = { added: new Set(), changed: new Set() };
  stepEdgeKeys = new Set();
  removedGhosts = [];
  reservedRects = [];
  stepNote = '';
  document.querySelectorAll('.node.is-added, .node.is-changed').forEach((node) => {
    node.classList.remove('is-added', 'is-changed');
    node.querySelector('.node-badge')?.remove();
  });
  document.querySelectorAll('.node.is-removed').forEach((node) => node.remove());
  document.querySelectorAll('#arrows .is-fresh').forEach((path) => path.classList.remove('is-fresh'));
  if (!linkDrag && $('#connection-hint')) {
    $('#connection-hint').classList.remove('is-step-note');
    $('#connection-hint').textContent = 'Drag ▷ for control flow · Drag ● to pass a variable';
  }
}
function publishStepChange(before) {
  const beforeIds = new Set(before.cards.map((card) => card.id));
  const afterIds = new Set(state.cards.map((card) => card.id));
  const added = state.cards.filter((card) => !beforeIds.has(card.id)).map((card) => card.id);
  const removed = before.cards.filter((card) => !afterIds.has(card.id));
  const changed = state.cards.filter((card) => {
    if (!beforeIds.has(card.id)) return false;
    const previous = before.cards.find((item) => item.id === card.id);
    return previous.x !== card.x || previous.y !== card.y || previous.title !== card.title || previous.body !== card.body || edgeTouch(before.edges, card.id) !== edgeTouch(state.edges, card.id);
  }).map((card) => card.id);
  const unchanged = state.cards.length - added.length - changed.length;
  const previousKeys = new Set(before.edges.map(edgeStructuralKey));
  stepMarks = { added: new Set(added), changed: new Set(changed) };
  stepEdgeKeys = new Set(state.edges.filter((item) => !previousKeys.has(edgeStructuralKey(item))).map((item) => item.id));
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  movedFrom = new Map();
  if (!reduced) {
    state.cards.forEach((card) => {
      const previous = before.cards.find((item) => item.id === card.id);
      if (previous && (previous.x !== card.x || previous.y !== card.y)) movedFrom.set(card.id, { dx: previous.x - card.x, dy: previous.y - card.y });
    });
  }
  moveStart = performance.now();
  phaseDelay = movedFrom.size ? MOVE_MS : 0;
  edgeDrawStart = moveStart + phaseDelay;
  removedGhosts = removed;
  const part = (count, label) => `<span class="delta delta-${label}">${count} ${label}</span>`;
  stepNote = `${part(added.length, 'added')} ${part(changed.length, 'changed')} ${part(removed.length, 'removed')} ${part(unchanged, 'unchanged')}`;
  pendingPan = true;
  clearTimeout(stepMarkTimer);
  stepMarkTimer = setTimeout(resetStepMarks, 3200 + phaseDelay);
  render();
}
function addFromPreset(presetId) {
  const preset = presetById[presetId];
  if (!preset) return;
  checkpoint();
  state.cards.push(cardFromPreset(preset, uid(), nextPosition()));
  render();
}
$('#next').onclick = () => {
  if (state.stage >= LAST_STAGE) return;
  checkpoint();
  reservedRects = [];
  const before = {
    cards: state.cards.map((card) => ({ id: card.id, title: card.title, body: card.body, type: card.type, category: card.category, x: card.x, y: card.y })),
    edges: state.edges.map((item) => ({ from: item.from, to: item.to, fromPin: item.fromPin, toPin: item.toPin, kind: item.kind, label: item.label || '' })),
  };
  state.stage += 1;
  lessonSteps[state.stage][3]?.();
  flowLayout();
  publishStepChange(before);
};

$('#export').onclick = () => ShipLoopExportUI.open(state);
new ResizeObserver(() => { paintView(); drawEdges(); }).observe(viewport);
window.addEventListener('resize', () => { paintView(); drawEdges(); });
applyView({ animate: false });
render();

function updateThemeButton() { const dark = document.documentElement.dataset.theme === 'dark'; $('#theme-toggle').textContent = dark ? '☼ Light' : '☾ Dark'; $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); }
$('#theme-toggle').onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('ship-loop-theme', theme); } catch {} updateThemeButton(); };
updateThemeButton();
