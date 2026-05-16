---
type: note
tier: shared
owner: david-kim
title: "Debugging network simulation — runaway excitation in high E/I regime"
---

# Simulation Debugging Session

Network was going unstable in the high E/I regime (E/I > 7). Getting runaway excitation — firing rates hit the ceiling and stay there.

Spent 3h with agent tracking this down.

**What we tried:**
1. Reduced recurrent excitatory weights → still unstable above E/I = 6.2
2. Added adaptation current → delayed the instability but didn't fix it
3. Increased simulation timestep precision (dt = 0.01ms → 0.005ms) → no effect
4. Checked for bugs in conductance calculation → found one

**The actual bug:**
Conductance reversal potential for AMPA was hardcoded at 0mV but the reference potential in the voltage normalization was -65mV. This created a phantom excitatory drive at rest that compounded at high E/I.

One-line fix: `E_AMPA = 0 - V_rest` → `E_AMPA = 0`

After fix: network is stable up to E/I = 9.1 (matches analytical prediction within 4%).

**Lesson:** always check physical units and reference potentials when a simulation goes unstable. Agent helped me bisect the parameter space to isolate the regime — would have taken much longer manually.

**New parameter sweep:** re-running all 400 configurations with the fixed simulator. Results should be cleaner.
