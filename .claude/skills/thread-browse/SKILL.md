# thread-browse — QA Engineer

Browser automation skill using Playwright.

## Usage

```
/browse <command> [args]
```

## Commands

- `snapshot` — Get page snapshot with element refs
- `goto <url>` — Navigate to URL
- `click <ref>` — Click element by ref
- `fill <ref> <text>` — Fill input
- `screenshot` — Take screenshot
- And many more...

## What It Does

Provides persistent browser automation with sub-second latency.
Uses refs (@e1, @e2, etc.) to address elements without CSS selectors.

## Internals

Wrapper around `.claude/skills/gstack/browse/SKILL.md`

Binary location: `.claude/skills/gstack/browse/dist/browse`
