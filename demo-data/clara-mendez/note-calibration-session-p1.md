---
type: note
tier: shared
owner: clara-mendez
title: "P1 calibration session — decoder drift and recovery"
---

# P1 Calibration Session — Decoder Drift

Bad session today. P1's decoder performance dropped from 82% to 61% overnight. Ran diagnostics with agent.

**Root cause:** electrode impedance on 14 channels spiked overnight (possibly due to micromotion during sleep). These channels were feeding heavily into the GRU decoder's input.

**Channels affected:** 7, 12, 23, 31, 44, 52, 67 (plus 7 others with partial degradation)

**Fix applied:** 
1. Excluded bad channels from decoder input
2. Retrained GRU from scratch on today's calibration data (5 min, 48 trials)
3. Post-fix performance: 79% (close to baseline, acceptable)

**Longer-term fix:** need channel-quality-aware weighting so the decoder automatically downweights bad channels without full retraining. Agent helped sketch a Kalman filter approach — impedance measurement at session start → prior on channel reliability → weighted input to GRU.

**P1's response:** frustrated but understanding. They said "this better be worth it" — fair.

**Note for IRB report:** document this drift event and the recovery procedure. We need this in the next protocol amendment anyway.
