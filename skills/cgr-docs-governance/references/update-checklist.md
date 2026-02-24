# Documentation Update Checklist

## If API payload/validation changes

- update endpoint section in operation docs
- add sample curl with valid/invalid examples

## If workflow behavior changes

- update expected output fields
- add interpretation of counters/reason codes

## If observability changes

- update event catalog and LOG_LEVEL guidance

## If production incident is fixed

- record symptom, cause, fix, and verification command

## Always include

- absolute date for status snapshots
- at least one command that verifies the new behavior
