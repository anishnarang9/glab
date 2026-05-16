---
type: note
tier: shared
owner: bob-okafor
title: "SynapseNet v2 calibration and false positive rate check"
---

# SynapseNet v2 Calibration

Ran a calibration check on SynapseNet v2 before trusting its outputs for the E/I analysis. Manually annotated 500 synapses in a held-out subvolume as ground truth.

**Results:**
- Precision: 0.91 (excitatory), 0.87 (inhibitory)
- Recall: 0.88 (excitatory), 0.83 (inhibitory)
- F1: 0.895 (exc), 0.850 (inh)

Inhibitory recall is a concern — we're missing ~17% of inhibitory synapses. This would bias E/I ratios *upward* (appearing more excitatory than reality).

**Implication for PV+ finding:** if we're missing inhibitory synapses at 17% rate, the true PV+ E/I ratio could be even lower than 1.9. Our surprising result is conservative, not inflated. That's good — it makes the finding more robust.

**Action:** apply a recall-correction factor of 1/0.83 = 1.20 to inhibitory synapse counts in all downstream analyses. Agent helped me propagate this correction through the analysis pipeline.

Shared this with David — he wants to know if this changes the network stability predictions from his model.
