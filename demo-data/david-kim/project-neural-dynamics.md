---
type: project
tier: shared
owner: david-kim
title: "Mean-field theory of cortical dynamics near the edge of criticality"
---

# Mean-Field Theory of Cortical Dynamics

## Goal
Derive a tractable mean-field model of recurrent cortical networks that predicts: (1) the transition between asynchronous irregular and synchronous oscillatory regimes, (2) the conditions under which networks operate near a critical point, and (3) how E/I balance affects information capacity.

## Why this matters
There's a lot of empirical data (Bob's connectome, Clara's BCI recordings, Alice's fMRI) that needs a theoretical framework. Right now everyone is describing phenomena without a unifying model.

## Approach
Starting from spiking network simulations (AdEx neurons, conductance-based synapses), fitting a Wilson-Cowan mean-field reduction, then analyzing the bifurcation structure analytically.

## Current status
- spiking network simulation running for L4 E/I parameters (using Bob's measured ratios)
- Wilson-Cowan reduction: good fit in the asynchronous regime, poor fit near the oscillatory transition
- Working on a second-order moment closure to capture the transition better

## Key prediction
Networks operating near the critical point maximize their dynamic range (ability to discriminate different input strengths). This should be testable against Alice's decoding accuracy and Bob's functional connectivity data.
