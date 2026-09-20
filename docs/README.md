# Ship Loop

Reference for the system this workshop grows toward. The interactive board does not start here.

An agent implements a task, cleans up, reviews, and tests in a bounded loop, then marks a pull request ready for a person to merge.

## Stages

| # | Stage | What it does |
|---|-------|----------------|
| 1 | `preflight` | Check the runner |
| 2 | `understand` | Understand the issue |
| 3 | `baseline` | Run tests before changes |
| 4 | `branch` | Branch and open a draft pull request |
| 5 | `implement` | Implementation; Nikolai commits locally |
| 6 | `simplify` | Clean up and simplify; the edits are amended into the attempt's commit, then pushed |
| 7 | `review` | Code review of that commit |
| 8 | `tests` | Run tests after changes |
| 9 | `ready` | Mark the pull request ready |

## Flow

```mermaid
%%{init: {"theme": "base", "themeVariables": {"lineColor": "#64748b", "primaryTextColor": "#0f172a", "primaryBorderColor": "#64748b", "clusterBkg": "#fff7ed", "clusterBorder": "#d97706", "fontFamily": "ui-sans-serif, system-ui, sans-serif"}}}%%
graph TD
    S1["1. Check the runner<br/>preflight"] --> S2["2. Understand the issue"]
    S2 -->|needs clarification| STOP1(["Stop: questions on the issue<br/>label needinfo"])
    S2 -->|not actionable| STOP2(["Stop: nothing to change"])
    S2 -->|proceed| S3["3. Run tests before changes<br/>baseline"]
    S3 --> S4["4. Branch and draft PR"]

    subgraph LOOP["attempt loop — max 3 attempts, one commit each"]
        Implementation["5. Implementation<br/>local commit"]
        Implementation -->|committed| S6["6. Clean up and simplify<br/>fresh turn, amend, push"]
        S6 -->|pushed| S7["7. Code review"]
        S7 -->|P0 or P1 found| REJ["rejected by code review"]
        S7 -->|no P0 or P1| S8["8. Run tests after changes"]
        S8 -->|failed| REJ2["rejected by tests"]
        REJ --> NEXT{"attempts and time left?"}
        REJ2 --> NEXT
        NEXT -->|yes: findings as feedback| Implementation
    end

    S4 --> Implementation
    Implementation -->|needs clarification| STOP1
    Implementation -->|gave up or changed nothing| STOP4(["Stop: run ends,<br/>empty PR closed"])
    NEXT -->|no| STOP3(["Stop: PR stays a draft<br/>with the last attempt"])
    S8 -->|passed| S9["9. Mark pull request ready"]
    S9 --> DONE(["Ready — human reviews and merges"])

    classDef step fill:#ffffff,stroke:#334155,stroke-width:2px,color:#0f172a
    classDef stop fill:#fef2f2,stroke:#b91c1c,stroke-width:2px,color:#0f172a
    classDef gate fill:#fffbeb,stroke:#b45309,stroke-width:2px,color:#0f172a
    classDef ok fill:#ecfdf5,stroke:#047857,stroke-width:2px,color:#0f172a
    class S1,S2,S3,S4,Implementation,S6,S7,S8,S9 step
    class STOP1,STOP2,STOP3,STOP4,REJ,REJ2 stop
    class NEXT gate
    class DONE ok
```
