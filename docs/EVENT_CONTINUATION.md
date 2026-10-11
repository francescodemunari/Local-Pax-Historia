# Play from an event

Updated 11 October 2026. This choice complements the player-specific
**Next important event** search; it can also select ordinary news when the
player wants to intervene sooner. See [national milestone rules](AI_RELIABILITY.md#player-specific-milestones--11-october-2026).

The events list and event playback can offer **Play from this event** for an
earlier event in the latest resolved turn. Selecting it replaces that turn with
the same simulation applied only through the event's calendar date. This is a
real change to the saved world and date, not a camera-only rewind.

All developments and effects on that day apply together. Later reports,
movement, territorial changes, diplomatic changes and political state changes
are discarded. Orders whose execution falls after the chosen date remain
pending. A military operation that has begun remains active with its existing
fronts, formations and unfinished standing orders.

No additional model request is made. The engine reuses its recorded proposal,
clips its timeline, validates the retained effects and runs the normal state
execution path against the pre-turn world. Movement and map ownership checks
still apply. Legacy effects without explicit dates retain the dates assigned by
normal engine execution, so a future march or end-of-turn settlement cannot be
pulled forward by replay. The model does not supply authoritative save snapshots.

An undated civilian outcome explicitly linked by `action_id` to dated news
retains the date of its final linked development. Its future completion is
discarded on earlier continuation even when the event has no state patch or
unrelated earlier changes affect the player. The order remains pending without
the discarded success summary.

## Availability and persistence

Only the latest unchanged resolved turn retains a checkpoint. The selected
event must fall after that turn's starting date and before the current saved
date. An event on the current date is already playable. Older saves and older
turns without a checkpoint do not advertise this feature.

Continuation also supports eligible dates after day 365 within a valid longer
fixed-duration turn, such as a 24-month advance. This trusted replay does not
weaken the public time-jump input limits.

A new order, edited order, diplomatic message or other saved mutation
invalidates the checkpoint. This prevents continuing from a past event from
silently deleting work written after the turn. Starting another turn replaces
the old checkpoint. The checkpoint survives a backend restart and save/reload.

The save stores one private `_eventReplay` object containing the pre-turn state,
the applied proposal and the latest turn's event identities. It does not nest
older checkpoints and is excluded from API JSON and model context. This adds
one copy of campaign state and one turn proposal to a save, rather than storing
a full world snapshot for every event. Normal save mutation drops obsolete
checkpoint data.

## HTTP contract

An event exposes `can_resume: true` and `resume_revision` when continuation is
available. Other events expose `can_resume: false`. Eligibility is derived on
load from the live save revision, never accepted from a client or model.

`POST /api/game/resume-event` accepts:

```json
{"saveId":"save_identifier","eventId":"event_identifier","revision":7}
```

`revision` must be the event's `resume_revision`. The result includes the usual
turn response fields (`new_date`, `events`, unit/territory changes and campaign
information), plus `resumed_from_event`, `revision` and the authoritative loaded
game object in `state`. The client should replace its current world from this
response, discard later playback and return control to the player. It must not
invoke another time advance to perform the selection.

Malformed selection returns HTTP 400. Unavailable or stale continuation and a
turn already being resolved return HTTP 409. The per-save turn lock and normal
atomic revision-checked save path cover replay. An invalid retained effect or
revision conflict leaves the saved world unchanged.

## Verification

`node scripts/test_event_continuation.js` uses recorded, mocked turn proposals
and temporary test saves. It covers authoritative replay, both fronts and air
support, all simultaneous effects, pending future orders, continued campaigns,
backend reload, private bounded checkpoint storage and atomic rejection of
stale, missing and invalid continuation data. No browser or paid model calls
are used. Concurrent replay/time advancement/deletion requests are rejected;
an external save writer's newer revision is preserved.

The same regression covers future civilian orders linked only through event
`action_id` and continuation at day 517 of a valid 24-month turn.
Standalone movement/disband events retain their explicit execution dates;
calendar-dated diplomatic changes execute and replay on the same day. Selecting
an earlier event leaves these future effects unapplied and their orders pending.
`node scripts/test_event_continuation_ui.js` checks the event-list/playback
controls, authoritative state refresh and stale-response handling through code
without a browser. Final visual/gameplay checks remain with the player.

`node scripts/test_event_continuation_api.js` checks the real HTTP route and
completion broadcast, private data omission, malformed inputs, stale choices
and overlapping turn requests against a local ephemeral server with mock AI.
