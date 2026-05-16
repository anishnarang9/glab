---
type: paper_ref
tier: shared
owner: bob-okafor
title: "Paper notes: MICrONS mm3 dataset (Turner et al. 2022)"
---

# Paper Notes: MICrONS — Functional Connectomics of a Cubic Millimeter of Mouse Visual Cortex

**Citation:** MICrONS Consortium, Turner et al., Nature Methods 2022

## What it is
The largest publicly available connectome to date: 1mm³ of mouse V1, ~200k neurons, ~500M synapses, co-registered with 2P calcium imaging.

## Key results
- Excitatory connectivity is sparse but highly structured by layer and cell type
- Inhibitory connectivity is denser and less structured
- Functional similarity (tuning correlation) weakly predicts connectivity probability, but only at close distances (<50µm)

## Relevance to our work
Our volume is 1/1000th the size but at higher resolution and with denser proofreading. The MICrONS team prioritized breadth; we're prioritizing depth.

Their E/I ratio numbers for L4: spiny stellate E/I ~4.5, which is close to our 4.2. But their PV+ E/I is ~3.1 vs. our 1.9 — this discrepancy is the thing worth digging into.

## Questions their data raises
- Is the weak structure-function correlation a ceiling effect (their functional data is noisier)?
- Do connection probabilities change with brain state? (they didn't control for this)

## Useful resources
- Data portal: microns-explorer.org
- Their proofreading pipeline is open-source — worth comparing to our approach
