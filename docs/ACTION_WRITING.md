# Writing orders

Updated 11 October 2026. Wording improvement is optional and uses the current
provider. It is separate from planning several actions or advancing time.

The Actions panel places the draft composer before the queue so it stays easy to find. An order may contain up to 2000 characters. Use **Queue order** or **Ctrl + Enter** when it is ready. Orders are resolved by the Game Master when time advances.

**Improve wording** asks the configured AI provider to rewrite the current draft as one clear order. It is writing assistance, not a simulation or an approval. Its instructions preserve the player's objectives, fronts, places, force types, constraints and timing, while correcting spelling and removing repetition. It must not invent goals, deadlines, budgets, unit numbers or successful outcomes.

The original stays in the composer while an editable suggestion appears underneath. **Apply to draft** copies the reviewed suggestion into the composer. **Keep original** discards it. Neither button queues an order. The player can review the rewrite because models may still misunderstand an instruction.

**Help me plan actions** remains separate: it proposes several editable orders, each with its own Queue and Delete controls.

## Request handling

`POST /api/actions/improve` accepts `saveId` and `actionText` and returns `{ "action": "Suggested order" }`. The endpoint reads the selected nation, scenario and date for context, and never writes the save or creates an action. It uses the shared provider completion and JSON output negotiation. Invalid or truncated model replies return an error while leaving the draft and campaign unchanged. Invalid inputs are rejected before contacting the model.

Changing a draft invalidates its pending rewrite and closes its suggestion. Replies from a different campaign, an older turn or an older draft are ignored. Queuing an order preserves any new draft typed while the request is pending. Resetting or loading a campaign clears the old preview and prevents late requests from replacing new input.

## Verification

Run `node scripts/test_action_improvement.js`. The test mocks model replies, exercises the HTTP endpoint against an isolated save, and checks preview/apply/discard behavior and delayed-response races without opening a browser or making provider calls. It also verifies that both successful rewrites and model failures leave the campaign file unchanged.

These checks verify the review flow and persistence boundaries, not that every
model rewrite preserves meaning perfectly. The player reviews the preview
before applying it. See [playability scope](PLAYABILITY.md) for current gameplay
limits and [event continuation](EVENT_CONTINUATION.md) for returning control at
an earlier simulated event.
