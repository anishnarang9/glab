---
type: finding
tier: shared
owner: clara-mendez
title: "Cross-session decoder generalization with and without recalibration"
---

# Finding: Cross-Session Generalization Analysis

Ran a retrospective analysis on P1's data across 28 sessions (14 weeks).

**Without recalibration:** decoder trained on day N applied to day N+k
- Day N+1: 76% (vs 82% same-day baseline)
- Day N+3: 64%
- Day N+7: 51%
- Day N+14: 43% (barely above 37.5% chance for 8-way)

**With 5-min recalibration:**
- All time points: 79-83% (no significant decay)

**Key insight:** almost all the degradation happens in the first 3 days, then it plateaus. This suggests the drift is dominated by a fast-changing component (acute tissue response?) and a slower stable component.

**Implication for continual learning:** if we can stabilize the fast-changing component with a small daily update, we might not need full recalibration. The plateau at ~43% means there's a stable "core" signal that persists.

**Shared with Alice** — she's interested in whether the geometric structure (subspace) of population activity drifts even if individual channel responses do.
