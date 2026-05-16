# GTech Lab — Research Areas

## 1. Visual Cortex and Neural Decoding

**Lead:** Alice Chen

We use high-field fMRI (7T) and multi-unit electrophysiology to study how the visual system represents objects, scenes, and semantic categories. Current focus is on cross-subject alignment using hyperalignment and on decoding mental imagery from cortical representations.

Key questions:
- How do deep neural networks (CLIP, DINO) align with ventral stream representations?
- Can we reconstruct perceived images from V1–IT activity with sufficient fidelity for BCI applications?
- What is the computational role of feedback projections from prefrontal cortex to early visual areas?

Methods: 7T fMRI, ECoG, representational similarity analysis (RSA), encoding models, linear decoding, contrastive learning.

## 2. Connectomics and Circuit Architecture

**Lead:** Bob Okafor

We reconstruct nanoscale synaptic connectivity in mouse and human cortex using serial electron microscopy (EM) and automated segmentation pipelines. Our goal is to map the wiring diagram of layer 4 and layer 2/3 circuits in primary visual cortex and compare them across species and disease states.

Key questions:
- What is the precise E/I ratio at the level of individual synapses in cortical columns?
- How does synaptic weight distribution predict functional connectivity measured by calcium imaging?
- Are there structural motifs that predict layer-specific computational roles?

Methods: FIB-SEM, ATUM-SEM, flood-fill networks, CAVE connectome annotation, synapse segmentation.

## 3. Motor BCI and Population Dynamics

**Lead:** Clara Mendez

We develop next-generation brain-computer interfaces that decode intended movement from Utah array recordings in motor cortex (M1 and PMd). A parallel theory effort asks why motor cortex uses rotational population dynamics during movement preparation and execution.

Key questions:
- Can we achieve stable, high-DOF cursor and robotic arm control across months without recalibration?
- What is the geometric structure of the neural manifold during BCI learning?
- Does the brain exploit rotational dynamics because they are robust to noise, or for another reason?

Methods: Utah array recording, Kalman filter and RNN decoders, GPFA, jPCA, offline and closed-loop BCI experiments.

## 4. Computational Theory — Mean-Field and Network Models

**Lead:** David Kim

We build analytically tractable models of cortical circuits — balanced networks, spiking neural networks, and mean-field reductions — and connect them to experimental measurements. Current focus is on criticality, oscillations, and the role of PV interneurons in generating gamma rhythms.

Key questions:
- Under what conditions does a balanced excitatory-inhibitory network operate near a critical point?
- How do PV interneurons shape the frequency and power of gamma oscillations?
- Can mean-field theory predict population-level dynamics observed in multi-area recordings?

Methods: analytical mean-field theory, numerical simulation (NEST, Brian2), power spectrum analysis, dimensionality reduction.
