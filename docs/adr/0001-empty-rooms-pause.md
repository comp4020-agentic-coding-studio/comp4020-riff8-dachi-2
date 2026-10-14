# ADR 0001: an empty room pauses, and the world waits for you

- Status: accepted
- Context: crit 9 (_All at once_) asks for one multi-user behaviour decided against what good means for this app. The pod's prompt asks for "an explicit policy for empty rooms" and warns that players "cannot unexpectedly miss entire worlds while absent".

## The question

What does a player find when they come back to a room, an hour or a day later? Plenty is a shared world whose whole argument is that the players' own choices consume it. If it can be consumed while they're not looking, the argument breaks: the loss has to be theirs.

## Decision

A room simulates only while at least one player is connected. When the last one leaves, the server saves the room, stops ticking it, and unloads it from memory after a minute. The next player to arrive loads it exactly as it was left, under a new incarnation, and the clock resumes. While anyone is connected, everything runs for everyone, including the buildings of players who've left: their machines keep working under their name.

## Alternatives weighed

1. **Always-on simulation.** The world keeps running for absent players, the way an idle game or a farm sim's crops do. It makes returning exciting ("look how much the harvesters did"), and it's the option a pod member arguing for "machines doing the work" would pick. But it lets automation empty a world nobody watched end, which is precisely the moment the game exists to show. It also needs a machine running around the clock, which the course's autostop Fly setup (and its cost) is built to avoid.
2. **Capped offline progress.** On return, simulate the missed time up to a cap (say, ten minutes of economy) with a summary. Softer, and common in idle games. But any cap still means a player can return to a forest that was cut down without them, and the summary becomes the experience instead of the land. It also doubles the simulation paths that have to stay consistent with the ledger.
3. **Pause only when the host leaves.** Simple, but it makes one player's attendance govern everyone, and the host role already moves to whoever is still here.

## Consequences and costs

- A room can't progress when nobody is playing, so a group that wants machines to "work overnight" can't have that. This is the cost the pod will argue against, and the game accepts it: in Plenty, absence is a pause, never a loss.
- One player alone keeps the whole world running for everyone else's buildings too. A solo player can drain a world the rest of the group cared about while they're offline; the archive records who did what, but nothing prevents it. The alternative (pausing per player) isn't coherent in a shared world.
- It fits the infrastructure for free: Fly's proxy counts WebSocket connections, so the machine stops exactly when no room has anyone in it, and nothing is lost because nothing should have been running.
- Returning is cheap and consistent: a reload or a reconnect gets a fresh authoritative snapshot, never the browser's old copy, and a server restart in between invalidates any half-sent actions via the incarnation id.
