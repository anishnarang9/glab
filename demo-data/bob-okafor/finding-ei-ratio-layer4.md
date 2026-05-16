---
type: finding
tier: shared
owner: bob-okafor
title: "E/I synapse ratio is non-uniform across layer 4 cell types"
---

# Finding: E/I Ratio Varies Strongly by Cell Type in L4

Proofread 340 cells now. Enough to run the first E/I analysis.

**Result:**
- Spiny stellate cells: E/I = 4.2 ± 0.8 (n=112)
- Star pyramidal cells: E/I = 6.1 ± 1.2 (n=89)
- PV+ interneurons: E/I = 1.9 ± 0.4 (n=61) ← way more inhibitory input than expected
- SST+ interneurons: E/I = 2.8 ± 0.6 (n=43)

The PV+ number is surprising. Literature says ~3:1 but we're seeing closer to 2:1. Two possibilities:
1. Mouse-specific (most prior data is from cat or ferret)
2. Our SynapseNet misclassifies some excitatory shaft synapses as inhibitory

Ran a manual check on 20 PV+ synapses — classifier looks right. This might be a real biological finding.

**Next step:** ask David if his mean-field model can accommodate this E/I ratio and what it predicts for network stability.
