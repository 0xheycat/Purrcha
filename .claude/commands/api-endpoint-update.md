---
name: api-endpoint-update
description: Workflow command scaffold for api-endpoint-update in Purrcha.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /api-endpoint-update

Use this workflow when working on **api-endpoint-update** in `Purrcha`.

## Goal

Update or fix an existing API endpoint implementation.

## Common Files

- `src/app/api/agent/run/route.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit the relevant API route file in src/app/api/...
- Update related hooks or libraries if necessary
- Modify or add related components that consume the API
- Update documentation or configuration as needed

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.