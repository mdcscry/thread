# thread-plan-design-review — Senior Designer

Design audit skill.

## Usage

```
/plan-design-review
```

## What It Does

1. 80-item design audit
2. Grades: Design Score, AI Slop Score
3. Infers your design system
4. Flags problematic patterns
5. Report only — never touches code

## Grades

- **Design Score** — A to F
- **AI Slop Score** — Detects AI-generated patterns

## Internals

Wrapper around `.claude/skills/gstack/plan-design-review/SKILL.md`
