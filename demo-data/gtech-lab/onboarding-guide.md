# GTech Lab — New Researcher Onboarding Guide

Welcome to GTech Neuroscience Lab. This doc covers everything you need to get up and running in your first two weeks.

## Week 1 Checklist

- [ ] Get badge access: email facilities@gtech.edu with your GTID, CC james.osei@gtech.edu
- [ ] Join lab Slack: invite sent by lab manager (workspace: gtech-neurolab.slack.com)
- [ ] GitHub: request access to gtech-neurolab org from Bob or Alice
- [ ] NAS access: lab manager sets up your mount credentials
- [ ] PACE-Phoenix HPC: register at pace.gatech.edu, request project allocation `gtech-neuro`
- [ ] Read the three core papers below
- [ ] Schedule your first 1:1 with Prof. Osei (use Calendly link in email signature)
- [ ] Attend lab meeting Monday (bring questions, no slides needed your first week)

## Must-Read Papers Before Your First Lab Meeting

1. **Yamins & DiCarlo (2016)** — "Using goal-driven deep learning models to understand sensory cortex" — *Nature Neuroscience*. Foundation for how we think about visual cortex modeling.
2. **Churchland et al. (2012)** — "Neural population dynamics during reaching" — *Nature*. The rotational dynamics paper; central to Clara and David's work.
3. **Shapson-Coe et al. (2024)** — "A petavoxel fragment of human cerebral cortex reconstructed at nanoscale resolution" — *Science*. State of the art in connectomics; directly relevant to Bob's project.

## Key Tools We Use

| Tool | Purpose | Who to ask |
|------|---------|------------|
| FreeSurfer / FSL | fMRI preprocessing | Alice |
| CAVE / CloudVolume | Connectome annotation | Bob |
| Kilosort 4 | Spike sorting | Clara |
| Brian2 / JAX | Neural simulation | David |
| Python + NumPy/SciPy | Everything | Everyone |
| MATLAB | Legacy analysis (avoid for new code) | — |

## Who Does What

**Alice Chen** — fMRI, visual cortex, encoding models, CLIP alignment. Ask Alice about: MRI scanner scheduling, fMRI preprocessing, RSA analysis, Python ML stack.

**Bob Okafor** — electron microscopy, connectomics, synapse detection. Ask Bob about: EM data, CAVE annotation, SynapseNet, NAS storage, HPC jobs.

**Clara Mendez** — motor BCI, Utah array recording, population dynamics. Ask Clara about: ephys recording, spike sorting, BCI decoder training, patient scheduling.

**David Kim** — computational theory, mean-field models, oscillations. Ask David about: mathematical modeling, Brian2/NEST simulation, analytical derivations, theory-experiment bridge.

## Lab Culture

- **Over-communicate.** Post updates in Slack even when things are going wrong, especially when things are going wrong.
- **Share your work early.** Post drafts, preliminary figures, and half-baked ideas in `#analysis-sharing`. The lab improves work that's visible.
- **No question is too basic.** Especially in your first 6 months. Ask in `#questions`, not just in DMs — others probably have the same question.
- **Authorship conversations happen early.** If you contribute substantially to a project, raise authorship expectations with the PI at the 3-month mark, not when the paper is being submitted.
- **Work-life balance is taken seriously.** Prof. Osei does not expect responses to Slack on weekends. Take vacations. Tell the lab manager if you need anything.

## Your First Research Project

In your first 1:1, you and Prof. Osei will identify a starter project — usually a well-scoped analysis task within an ongoing project. Starter projects are designed to:
1. Get you familiar with lab data and tools
2. Produce a real result that contributes to a paper
3. Identify which of the four research areas you want to go deep in

Expect 3–4 months on a starter project before transitioning to a first-author project of your own.
