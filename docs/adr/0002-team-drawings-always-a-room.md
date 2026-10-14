# Team Drawings are always a Room, and moves to Team are one-way

Every Team Drawing is edited through its Room, never by a solo writer. Any tab that opens one joins its Room, alone or not; the solo scene write refuses it with the same "join the Room" answer a shared Drawing gets. Members join through a second socket entry keyed by Drawing id, next to the Share link's token entry. Both hand back the same Room id (the Drawing id), so a member from the sidebar and a guest from an anyone-link meet in one Room. The Room engine from ADR 0001 is reused unchanged: protocol, merge rule, persistence, flush throttle, heartbeat, follow mode, Scene images, seat cap and close codes.

A Drawing or folder moves from Private to Team, never back. No server function moves a row from Team to Private.

We chose this over "Team Drawings are solo until two members meet" because a Handoff in the middle of a session is the riskiest moment in canvas sharing: both writers must flush before they let go. A Room of one makes a second member's arrival a plain join, with no switch of writer. One-way moves keep it that way: a Team Drawing never hands back to a solo writer, and no member can quietly take shared work away from the team.

## Consequences

- Every open Team Drawing is a websocket, not only shared ones. With the 25-seat cap and a team-sized instance this is well within limits.
- The by-id entry runs the token entry's seat-then-recheck: it resolves the session on the upgrade and again after the socket is seated. It admits iff the member can see the Drawing under the access rule, the Drawing is in Team, and it is not trashed. Every refusal is the same 4010, so a Drawing id can't be probed.
- Room images have a by-id route too (`/api/drawings/<id>/files/<fileId>`), gated by the same check, so images open to exactly who the socket admits.
- A Team Drawing's Room does not hang on its Share link. Stopping or regenerating the link sends only guests away; members stay seated.
- Stored `appState` stays frozen at the last solo save (ADR 0001). For a Team Drawing that is the last save before it moved to Team.
- The Live badge shows Team Rooms to every member and Private Rooms to their Creator only, from the `space` and `createdBy` the Room caches at spin-up.
