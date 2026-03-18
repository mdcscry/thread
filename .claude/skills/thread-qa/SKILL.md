# thread-qa — QA Lead

This skill delegates to the gstack `/qa` workflow for browser-based testing.

## Usage

Invoke the QA workflow to test the Thread app, find bugs, and fix them.

```
/qa <url> [mode]
```

Where:
- `<url>` is the URL to test (e.g., http://localhost:3000)
- `[mode]` is optional: `full`, `quick`, or `regression`

## What It Does

1. Opens a real browser via gstack browse
2. Tests the app end-to-end
3. Finds bugs and classifies severity
4. Fixes bugs with atomic commits
5. Generates regression tests
6. Produces a health score report

## Prerequisites

- Server must be running at the target URL
- Login: you@localhost / thread123

## Internals

This is a wrapper around `.claude/skills/gstack/qa/SKILL.md`
