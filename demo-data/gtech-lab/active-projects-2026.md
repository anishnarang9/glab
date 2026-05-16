# GTech Lab — Active Projects (2026)

## CLIP-Brain Alignment (Alice)

**Status:** Data collection complete, analysis ongoing
**Goal:** Show that CLIP-ViT-L/14 features predict fMRI responses in V1–IT better than any prior model, and use this to reconstruct perceived images at subject-transfer quality.
**Milestone:** Submit to NeurIPS 2026 by May 31
**Blocker:** Cross-subject decoding accuracy drops 12% on held-out subjects — investigating hyperalignment pipeline

## MICrONS Layer 4 Connectivity (Bob)

**Status:** Segmentation complete on 100μm³ volume, proofreading in progress
**Goal:** Characterize E/I synapse ratio in layer 4 of mouse V1 at single-synapse resolution; compare to mean-field predictions from David's models
**Milestone:** Full proofreading done by June 15; joint paper with David's group
**Blocker:** SynapseNet classifier has 8% false-positive rate on en-passant synapses — retraining with hard negatives

## Motor BCI — Patient P2 Study (Clara)

**Status:** First session complete, 3 more sessions scheduled
**Goal:** Achieve stable 2D cursor control in ALS patient P2 using PMd array; test rotational dynamics hypothesis in human subject
**Milestone:** 10-session longitudinal dataset by July; demonstrate cross-session generalization without recalibration
**Blocker:** EMG artifact contamination in channels 14–22; hardware fix scheduled for next session

## E/I Criticality Model (David)

**Status:** Analytical derivation complete, numerical validation ongoing
**Goal:** Prove analytically that a balanced E/I network with PV-mediated inhibition exhibits a phase transition at a critical E/I ratio; derive testable predictions for Bob's connectomics data
**Milestone:** Preprint by June 30; predictions handed to Bob's team
**Blocker:** Simulation runtime for large N too slow — switching from NEST to JAX-based solver

## Cross-Lab Collaboration: Rotational Dynamics Theory (Clara + David)

**Status:** Weekly meetings since March, joint figure set drafted
**Goal:** David's mean-field model predicts rotational dynamics should emerge whenever the network has structured heterogeneity; Clara's BCI data tests this in a decodable setting
**Milestone:** Joint submission to Neuron by August
