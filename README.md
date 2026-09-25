# Ship Loop Workshop

Materials for an interactive workshop on building a **ship loop**: a reliable workflow that takes a task from a first request through work, validation, delivery, and feedback. Teams can adapt it to software, games, content, support, or internal operations.

This session is for **advanced developers who already work with coding agents**. In the room you do not follow a finished pipeline. You start with the smallest system that could work, then grow it together — adding and dropping pieces from the group's experience — until it is production-ready.

The guided walkthrough is a **software-delivery example**, not a required workflow for every company. Its [reference implementation](docs/README.md) follows Nikolai's issue resolver through version 32 (22 September 2026), including work on existing pull requests, cleanup inside each attempt, and review against the original request.

## Open the board

- Live workshop: [ludenio.github.io/ShipLoopWorkshop](https://ludenio.github.io/ShipLoopWorkshop/)
- Locally: open `docs/index.html` (or serve the `docs/` folder)

Committed changes on `main` publish automatically to GitHub Pages from `docs/`.

## Reusable blocks

The left column is a shared library for company and scenario templates. Search by purpose, then edit the block's text, inputs, and outputs. Workflow blocks are **Start on an event** (a trigger), **Agent**, and **Human**. Variables are **Task** and **Context**; rename a Context block for what it holds, such as "Metrics Report".

For example, a content team can connect trigger → draft → review, sending review feedback back to the draft for another attempt. These are starting points: each team supplies its own criteria, tools, and ownership.

Pull requests, commits, and other software-delivery steps belong to the guided walkthrough, which has its own presets. Adding a block describes an operation; execution happens in the implementation built from the exported diagram. Variables describe values rather than creating storage.

## Export your loop

Build your diagram, then choose **Export loop**. Add your company, game, or product context and select:

- **Agent prompt**: a complete text description of the current diagram and instructions for an agent to build it for your project.
- **GitHub Actions**: a downloadable starter bundle with workflows, the diagram configuration, a controller, and adapter setup instructions.
- **GitHub Actions prompt**: the current diagram plus instructions for an agent to implement the required workflows.

Preview and copy the text, or download the export. The export describes the current board's states, elements, connections, and transition conditions, including your edits. The website generates it locally; you give the result to your agent yourself. The GitHub Actions starter needs repository-specific commands, runner configuration, and credentials before it can run your loop. **Board JSON** remains available for saving an exact copy of the board's data.

## Development checks

No build step or browser dependencies are required. With Node.js and Python 3 installed, run `node --test tests/*.test.cjs` to check export fidelity, the generated controller, and ZIP downloads. Keep the website files in `docs/` and `dist/` synchronized; GitHub Pages serves `docs/`.

## Other workshops

New to agents? Start with [Game Development with AI Agents](https://ludenio.github.io/WebGameTemplateForAgents/).
