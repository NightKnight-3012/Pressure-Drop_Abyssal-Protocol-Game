# Balance pass: 7 November 2026

Follow-up verification, 8 November: after equipment hand-offs and authored replacements for the existing falling obstacles, the standard 60-seed sample at every crew size remains **100/100/100/98/90/97/90/100%** mission wins (480 matches). Damage, flooding, hearing and obstacle count were unchanged in this development pass. Bots do not exercise equipment hand-offs, so transfer-specific balance still needs human playtesting. Seven/eight-player full-crew escapes remain 0% in this standard sample; the earlier release gate still applies.

## Changes

Continuous EVA grab damage uses a six-metre close-contact radius and a three-second warning window. Breaking contact decays exposure. Strike damage/range and grab damage rate remain unchanged. Warning state and damage are server-owned, with a personal HUD warning and captioned suit cue. Hearing gain decreases gently above four crew to account for simultaneous crew noise. The flooding/pump/helmet-air redesign is retained.

The scripted crew avoids duplicate rescue assignments and invalid inside-only rescue requests on outside casualties, uses actual finite lures, attempts airlock retreat under nearby danger or low suit air, and lets Medical treat injured teammates before they are downed when other priorities permit. This changes the simulator as well as gameplay: before/after rates cannot isolate one tuning change's effect. Travel is approximated by elapsed walking time. Optional expeditions and many human decisions are not represented.

## Final samples

| Starting crew | Standard 60 seeds: mission wins | Separate 30 seeds: mission wins | Separate sample: average escaped | Separate sample: full crew escaped |
| --- | --- | --- | --- | --- |
| 1 | 100% | 100% | 1.0/1 | 100% |
| 2 | 100% | 100% | 2.0/2 | 97% |
| 3 | 100% | 100% | 2.6/3 | 60% |
| 4 | 98% | 100% | 3.1/4 | 20% |
| 5 | 90% | 100% | 3.1/5 | 10% |
| 6 | 97% | 90% | 3.5/6 | 7% |
| 7 | 90% | 97% | 3.7/7 | 0% |
| 8 | 100% | 100% | 4.6/8 | 0% |

Mission wins mean at least one person escapes. The improved win rate does not establish that individual survival is well balanced: no seven/eight-person crew escaped in full in these samples. Real coordinated EVA and medical play should be tested before additional global damage or oxygen changes. These are diagnostic samples, not a claimed statistical guarantee or a commercial-release sign-off.

The original 60-seed audit, before these changes, won 78%/73% for seven/eight crew. Down contexts were concentrated in EVA contact, not suit depletion. Down contexts in the report are inferred observations, not exact cause-of-death records.

A slow/noisy eight-player stress diagnostic (REACTION=30, RUN=0.4, twelve seeds before the final preventative-healing simulator improvement) won 0/12, losing mostly to flooding. It is an intentionally adverse diagnostic, not a passing normal-crew requirement.

## Verification and reproduction

Gameplay validation: focused exposure/grace/decay tests; real-network client-forged timer refusal; full npm test chain including 106 original network checks; 178 client checks; production build; four warning/helmet-air browser captures. The final simulation-only reporting/healing changes were exercised over 60 standard plus 30 separate seeds per crew size.

Run npm run balance -- 0 60 for the standard sample. In PowerShell, set $env:START_SEED='9000' and run npm run balance -- 0 30 for the separate sample, then Remove-Item Env:START_SEED. BALANCE_REPORT=1 prints reasons, observed down contexts and example failure seeds. To replay one failure, set START_SEED to the printed seed and run the chosen crew size with one seed.

No gameplay rule accepts client-supplied contact exposure, health or breath results. Human playtests should measure noticed warning time, successful retreats, repair interruptions, individual survival and whether a real survivor choice still happens.

## Immersion Update evacuation audit

### Movement sensitivity follow-up

The paired comparison ran 60 seeds per size in each of three modes (1,440 matches). All routes used valid swept collision and no route was reported blocked. Mission wins for crews 1–8 were:

| Mode | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Original delayed arrival | 100% | 100% | 100% | 98% | 90% | 97% | 90% | 100% |
| Continuous emergency retreat | 100% | 100% | 100% | 98% | 95% | 93% | 88% | 100% |
| Continuous exterior travel | 100% | 100% | 100% | 100% | 95% | 95% | 97% | 98% |

Seven/eight-player full-crew escape was 0/0%, 2/2%, and 2/0% respectively. Continuous travel does not remove the individual-survival concern. Matching seeds are a sensitivity comparison: changed arrival times alter later encounters and decisions, so these are not isolated causal measurements or human win rates. Every crew size still has winning sensible crews in every mode. The original mode remains the default for historical comparison; no difficulty buff is justified by these results alone. Next: observe real diver retreats and rescue expectations with human crews before adjusting contact danger.

The default twelve-seed `npm run balance` check reports five-player wins of 9/12 (75%), below its 80% exit threshold, and exits unsuccessfully. This is an unresolved balance signal, not a passing gate. The larger sixty-seed sample reaches 54/60 (90%) for that size; both results must be considered during human testing.

Read-only diagnostics now distinguish pre-finale losses, boarding, pod losses, interior survivors and exterior casualties. Transition-tick losses use the phase before the tick. An intact entrant cohort means no starting player is lost or downed; it does not require full HP.

| Crew | Reached finale / 60 | Mean already lost at entry | Mean downed at entry | Intact crews reaching finale | Full extraction among intact crews |
| --- | --- | --- | --- | --- | --- |
| 1 | 60 | 0 | 0 | 60 | 60/60 |
| 2 | 60 | 0.08 | 0.02 | 54 | 54/54 |
| 3 | 60 | 0.18 | 0.17 | 39 | 39/39 |
| 4 | 59 | 0.75 | 0.25 | 12 | 12/12 |
| 5 | 55 | 1.55 | 0.31 | 3 | 3/3 |
| 6 | 58 | 2.5 | 0.16 | 3 | 3/3 |
| 7 | 56 | 3.09 | 0.29 | 0 | not observed |
| 8 | 60 | 3.62 | 0.13 | 0 | not observed |

Entry means are conditional on reaching the finale. Whole-match wins remain 100/100/100/98/90/97/90/100 percent. No seven/eight-player sample entered the finale with everybody alive and conscious. Eight-player entry already had 3.62 lost crew on average; the later exterior casualty category must not be interpreted as a failed capsule attempt.

A separate controlled audit ran 20 seeds per crew size for initial beacon durations of 0, 12 and 24 seconds. All 480 runs fully escaped. These start dry, with repaired systems and full health/air, and use scripted movement. They demonstrate rule feasibility, not human difficulty or a new survival guarantee. Default game tuning and the existing twelve-second simulator policy were not changed.

The main harness still models travel as delayed arrival: a retreating diver remains at the old coordinates until arrival. This can overstate exposure during a planned retreat. Compare collision-aware continuous retreat or real-network movement with paired seeds before changing creature damage, pump flow, pod seats or capsule resources. Inferred down contexts are not exact damage-cause telemetry.

Use BALANCE_AUDIT=1 with npm run balance -- 0 60 for the cohort/phase JSON, npm run audit:evacuation -- 20 for controlled policies, and npm run test:survival-audit for measurement checks. Generated raw reports/screenshots stay under ignored test/artifacts.
