---
id: 7
title: Reading history for a sensor over a time range
human_lead: lead-person
revision: 1
cases:
  - path: app/cases/7/history.spec.ts
    covers: [FR-001, FR-009]
milestones:
  - issue: 8
    covers: [FR-001, FR-009]
---
# Reading history

## Requirements
- **FR-001** GET /sensors/{id}/history?from&to returns readings in [from, to).
- **FR-002** Unknown sensor gives 404 `{ "error": "unknown_sensor" }`.
- **FR-003** [NEEDS CLARIFICATION: inclusive?] A range over 7 days gives 400 `{ "error": "range_too_large" }`.

## Success criteria
- **SC-001** A 24-hour range of hourly data returns 24 readings, oldest first.
