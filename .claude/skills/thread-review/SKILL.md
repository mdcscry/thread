# thread-review — Staff Engineer

Code review skill that finds bugs and auto-fixes obvious issues.

## Usage

```
/review
```

## What It Does

1. Runs `git diff` on changes
2. Analyzes code for bugs and issues
3. Auto-fixes obvious problems
4. Flags issues that need human attention
5. Traces enum values through switch statements

## Internals

Wrapper around `.claude/skills/gstack/review/SKILL.md`
