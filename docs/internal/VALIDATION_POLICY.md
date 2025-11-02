# Validation Policy (Frontend UX)

This document outlines how Scheduly applies input validation in the current in-memory frontend (React/webpack) implementation, with a focus on string length checks and user experience. It is intended to keep the UX consistent while being easy to port to server/API later.

## Principles
- Do not destroy user input. Never clear a field on validation failure.
- Validate softly during editing. Block as little as possible; validate strictly only when values are complete.
- Communicate clearly. Highlight fields in red and show a toast or inline status instead of throwing disruptive errors.
- Keep client and server aligned. Use the same limits and schemas so that API migration is seamless.

## Behavior Model
- Visual cues
  - Field highlight: add a red border (invalid) and keep the current value intact.
  - Text counter: show current length/max for relevant text inputs; turn red when exceeding the limit.
  - Status/Toast: short message indicating what to fix (e.g., "コメントは500文字以内で入力してください").
- When validation runs
  - Text inputs: evaluate on every change for counters and red border; actual persistence follows each screen’s policy (see below).
  - Datetime (datetime-local): allow incomplete values while typing; run structural rules only for complete values. For schedule order, allow saving even if dtend ≤ dtstart, but highlight + toast.
- Error logging
  - Foreseeable validation failures (422) are logged with `console.debug` (not `console.error`) to avoid noisy overlays.

## Field Limits (current)
- Project
  - name: 120 chars
  - description: 2000 chars
- Candidate (schedule)
  - summary: 120 chars
  - location: 120 chars
  - description: 2000 chars
  - status: enum [CONFIRMED, TENTATIVE, CANCELLED]
  - datetime: `datetime-local` complete format `YYYY-MM-DDTHH:MM` for strict checks
- Participant
  - displayName: 80 chars, required, unique within project
- Response
  - comment: 500 chars
  - mark: enum [o, d, x, pending]

## Screen-Specific Save Policy
- Admin (organizer)
  - Project name/description: live updates; show counters and red border on overflow; do not block save.
  - Candidates (schedules):
    - Text fields: update immediately; counters and red border on overflow.
    - Datetime: allow incomplete interim values; on complete values, run structural checks. For order (`dtend` ≤ `dtstart`), keep the user input, highlight fields, and show a toast.
- Participant (user inline editor)
  - Mark (○/△/×): save immediately on click.
  - Comment: save on blur only; show red border and message when > 500; keep the text.
  - Rename participant: show counter (0/80); red border on overflow or service error; error message inline.

## Implementation Notes
- Schemas live in `src/frontend/shared/validation.js` (lightweight helpers; replaceable by zod later):
  - `buildResponseRules`, `buildCandidateRules`, `buildParticipantRules`, common primitives (maxLength, enum, etc.)
- Service layer throws `Error` with `code = 422` on validation failure. UI maps these to red border + toast.
- Admin UI catches errors and parses field names from messages to set per-field error flags.

## Mapping Validation → UI
- 422 (comment): toast "コメントは500文字以内で入力してください"; red border; counter turns red.
- 422 (summary/location/description/name): toast "<field> は <limit> 文字以内で入力してください" (or generic); red border; counter red.
- Datetime order: toast "dtend must be after dtstart"; both fields highlighted; input preserved.

## Future Server/API
- Keep same max lengths and enums server-side and return 422 with structured details.
- Consider echoing the offending field list to simplify UI mapping.
