---
status: candidate
date: 2026-10-20
decision-maker: dharishan04
---

# 0001 · A history range is at most 7 days

Module decision for `sensors`, moved here from the Clarifications in `specs/1.md` (0031: a choice
is a decision record, not part of the locked contract).

## Decision

`GET /sensors/{id}/history` refuses a range longer than 7 days; exactly 7 days is allowed.
Contract rule: SENSORS-R004.

## Rejected alternatives

- **No maximum.** Not evaluated in the slice; recorded as dismissed.

## Enforced by

The case `app/cases/1/history.spec.ts` (a range of exactly 7 days, and one just over).
