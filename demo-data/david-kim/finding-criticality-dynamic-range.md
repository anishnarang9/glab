---
type: finding
tier: shared
owner: david-kim
title: "Simulated networks at criticality show 3x dynamic range advantage"
---

# Finding: Criticality Triples Dynamic Range in Simulated Networks

Ran parameter sweeps across 400 network configurations varying E/I ratio and recurrent connection strength. Measured dynamic range (max/min discriminable input) at each operating point.

**Result:**
- Networks at subcritical E/I: dynamic range = 8.2 dB (average)
- Networks near critical point: dynamic range = 24.7 dB (average)
- Networks at supercritical (oscillatory): dynamic range = 11.3 dB

The 3x advantage at criticality is robust across noise levels and network sizes (tested N=500, 2000, 8000).

**Relevance to Alice's data:**
If cortex is near criticality, we'd expect decoding accuracy to be maximized — which is consistent with her 71% decoding in LOC. If we could push the network toward criticality (e.g., pharmacologically), theory predicts decoding should improve. Probably can't test this in humans but potentially in mice.

**Relevance to Bob's finding:**
The PV+ E/I ratio of 1.9 (vs. expected 3.1) places Bob's L4 networks closer to the oscillatory regime than expected. My model predicts increased gamma oscillations — worth checking in his calcium imaging data.

**Next:** derive analytical expression for the critical point as a function of E/I ratio. Bob's corrected ratio (with recall correction) is the key input.
