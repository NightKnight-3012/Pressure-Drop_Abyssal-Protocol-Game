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
