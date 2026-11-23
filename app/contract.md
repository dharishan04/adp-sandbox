---
module: sensors
stability: provisional
openapi: app/openapi.yaml
---
# sensors contract

Behavioural rules only. The shape of each operation is in `app/openapi.yaml`; a rule never restates it.

## SENSORS-R001 · History holds only that sensor's readings in the range, oldest first
Operation: GET /sensors/{id}/history

- **Given** readings of several sensors **When** one sensor's history is asked for **Then** only that sensor's readings are returned
- **Given** readings inside and outside the range **Then** only those inside are returned, in ascending time order

## SENSORS-R002 · Both bounds of the range are inclusive
Operation: GET /sensors/{id}/history

- **Given** a reading whose time equals `from` or `to` **Then** it is returned

## SENSORS-R003 · An unknown sensor has no history
Operation: GET /sensors/{id}/history

- **Given** a sensor ID that is not known **Then** 404 `unknown_sensor`

## SENSORS-R004 · A range longer than 7 days is refused
Operation: GET /sensors/{id}/history
Decided in: docs/decisions/0001-history-range-is-at-most-seven-days.md

- **Given** `to - from` is more than 7 days **Then** 400 `range_too_large`
- **Given** `to - from` is exactly 7 days **Then** 200

## SENSORS-R005 · A range with no readings is an empty history, not an error
Operation: GET /sensors/{id}/history

- **Given** a known sensor and a range within the maximum that holds no readings **Then** 200 with no readings

## SENSORS-R006 · A sensor ID naming an object prototype member is an unknown sensor
Operation: GET /sensors/{id}/history, GET /sensors/{id}/latest

- **Given** the ID `__proto__`, `constructor` or `toString` **Then** both operations answer 404 `unknown_sensor`, never a crash or a 200

## SENSORS-R007 · One day of an hourly sensor is 25 readings
Operation: GET /sensors/{id}/history

- **Given** an hourly sensor **When** a range from 00:00 to 00:00 the next day is asked for **Then** exactly 25 readings, in ascending time order
