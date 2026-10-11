---
layout: ../layouts/NotebookLayout.astro
title: "PUF-Keyed Authenticated Encryption for Delta-Sigma Wireless Sensors"
---

<a href="https://colab.research.google.com/github/chennakeshavadasa/puf-keyed-dsm-encryption/blob/main/PUF_Keyed_DSM_Encryption.ipynb" target="_parent"><img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open In Colab"/></a>

---
# **ISSCC 2027 Code-a-Chip Competition**
---

# **PUF-Keyed Authenticated Encryption for Delta-Sigma Wireless Sensors**

### An Open SKY130 Attack-and-Defence Study

---

## Team Overview

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Affiliation</th>
      <th align="center">IEEE</th>
      <th align="center">SSCS</th>
      <th>Contact</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Nithin Purushothama</strong></td>
      <td>Visvesvaraya Technological University (VTU)</td>
      <td align="center">Yes</td>
      <td align="center">Yes</td>
      <td><a href="mailto:nithinpurushothama@gmail.com">nithinpurushothama@gmail.com</a></td>
    </tr>
    <tr>
      <td><strong>Runpeng Gao</strong></td>
      <td>PhD, Oregon State University</td>
      <td align="center">Yes</td>
      <td align="center">Yes</td>
      <td><a href="mailto:rppgao@gmail.com">rppgao@gmail.com</a></td>
    </tr>
  </tbody>
</table>

---

## Abstract

Floating multimodal electrochemical sensors report glucose concentration and cell density inside bioreactors to the process control loop — readings that an adversary may seek to intercept or forge. The secure delta-sigma modulator (S-DSM) of Yasar *et al.* protects such readings inside the analog-to-digital converter: each 1-bit modulator output is XORed with the keystream of a 16-bit linear-feedback shift register (LFSR), for a reported 1.8 % power overhead and up to 2.67× lower wireless energy than a decimate-then-encrypt design.

We propose deriving the key from a **physically unclonable function (PUF)**, so that no key is held in on-chip non-volatile memory (NVM): a 128-bit key is regenerated at every power-up from the start-up state of 600 SRAM cells, corrected by a fuzzy extractor with a BCH code and hashed, and is held only in volatile registers while the chip is powered. The key drives the **Grain-128a stream cipher**, which also authenticates every frame with a 32-bit MAC — a tag that only the key holder can produce, so the receiver rejects an altered or forged frame except with probability 2⁻³² per attempt.

*Index Terms* — Delta-sigma modulator, physical-layer security, physically unclonable function (PUF), SRAM PUF, fuzzy extractor, BCH code, Grain-128a, message authentication, stream cipher, SKY130, mixed-level simulation, open-source EDA.

---

## Open in Colab

The notebook opens from the GitHub repository — always the latest version:

**[→ Open in Google Colab](https://colab.research.google.com/github/chennakeshavadasa/puf-keyed-dsm-encryption/blob/main/PUF_Keyed_DSM_Encryption.ipynb)** &nbsp;·&nbsp; **[→ Source on GitHub](https://github.com/chennakeshavadasa/puf-keyed-dsm-encryption/blob/main/PUF_Keyed_DSM_Encryption.ipynb)**

The complete notebook — bit-exact model, transistor-level simulations (SKY130), attack suite, place-and-route, and interactive explorer — runs entirely in a free Colab runtime (~13 min, CPU only). No GPU, account keys, or uploads required. All outputs are saved in the notebook and can be read without execution.
