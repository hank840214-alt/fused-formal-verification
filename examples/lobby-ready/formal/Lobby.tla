---------------------------- MODULE Lobby ----------------------------
(* A toy lobby (examples/lobby-ready/server.mjs). Players press "ready"; the host can change the
   room's config; a config change clears every ready flag. The rule: a player who is ready is ready
   for the config the room has NOW.

   Atomic steps = the code between awaits. handleReady has one await, so it is two steps:
   ReadyBegin (read the version) and ReadyCommit (write the flag). handleConfig and handleStart
   have no interleaving point that matters here, so each is one step.

   Fix mirrors the `fix` switch in server.mjs: after the await, reject when the version moved. *)
EXTENDS Naturals

CONSTANTS Players,     \* the player ids, e.g. {p1, p2}; a symmetry set
          MaxVersion,  \* how many config changes the host may make (bounds the state space)
          Fix          \* TRUE = today's code; FALSE = the mutant without the re-check

VARIABLES version,  \* config version the room is at
          ready,    \* ready[p]: the flag
          seen,     \* seen[p]: the version p agreed to when the flag was set
          pc,       \* pc[p]: "idle" or "mid" (parked on the await inside handleReady)
          captured, \* captured[p]: the version read before the await
          started   \* 0 = not started, else the version the game started with

vars == <<version, ready, seen, pc, captured, started>>

TypeOK ==
  /\ version \in 1..MaxVersion
  /\ ready \in [Players -> BOOLEAN]
  /\ seen \in [Players -> 1..MaxVersion]
  /\ pc \in [Players -> {"idle", "mid"}]
  /\ captured \in [Players -> 1..MaxVersion]
  /\ started \in 0..MaxVersion

Init ==
  /\ version = 1
  /\ ready = [p \in Players |-> FALSE]
  /\ seen = [p \in Players |-> 1]
  /\ pc = [p \in Players |-> "idle"]
  /\ captured = [p \in Players |-> 1]
  /\ started = 0

\* handleReady, before `await store.write`: server.mjs "const version = state.config.version"
ReadyBegin(p) ==
  /\ started = 0
  /\ pc[p] = "idle"
  /\ ~ready[p]
  /\ captured' = [captured EXCEPT ![p] = version]
  /\ pc' = [pc EXCEPT ![p] = "mid"]
  /\ UNCHANGED <<version, ready, seen, started>>

\* handleReady, after the await: the re-check (Fix) and the write
ReadyCommit(p) ==
  /\ pc[p] = "mid"
  /\ pc' = [pc EXCEPT ![p] = "idle"]
  /\ IF Fix /\ captured[p] # version
       THEN UNCHANGED <<ready, seen>>
       ELSE /\ ready' = [ready EXCEPT ![p] = TRUE]
            /\ seen' = [seen EXCEPT ![p] = captured[p]]
  /\ UNCHANGED <<version, captured, started>>

\* handleConfig: a new version, every flag cleared
HostChange ==
  /\ started = 0
  /\ version < MaxVersion
  /\ version' = version + 1
  /\ ready' = [p \in Players |-> FALSE]
  /\ UNCHANGED <<seen, pc, captured, started>>

\* handleStart: only when every player is ready
Start ==
  /\ started = 0
  /\ \A p \in Players : ready[p]
  /\ started' = version
  /\ UNCHANGED <<version, ready, seen, pc, captured>>

\* A finished game is a correct end state; without this step TLC reports it as a deadlock.
Done ==
  /\ started # 0
  /\ \A p \in Players : pc[p] = "idle"
  /\ UNCHANGED vars

Next ==
  \/ \E p \in Players : ReadyBegin(p) \/ ReadyCommit(p)
  \/ HostChange
  \/ Start
  \/ Done

Spec == Init /\ [][Next]_vars

(* The rule, in the owner's words: nobody is "ready" for a config they never saw. *)
ReadyMatchesConfig == \A p \in Players : ready[p] => seen[p] = version

(* The harm: the game never starts on a config some player did not agree to. *)
StartOnAgreedConfig == started # 0 => \A p \in Players : seen[p] = started
=======================================================================
