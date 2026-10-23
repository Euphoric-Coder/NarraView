# NarraView — Judge Testing Guide

**Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon  
**Primary Track:** Fire TV  
**Mini Challenge:** AWS Builder  

---

## ⚡ Fastest Evaluation Path

To evaluate NarraView in under 3 minutes, **watch the official demo video**:  
👉 **[Watch NarraView Demo Video](<YOUTUBE_DEMO_URL>)**

The video demonstrates the complete end-to-end flow running directly inside the **Amazon Vega Virtual Device** on macOS, illustrating remote control navigation, playback synchronization, SpoilerShield refusal, seek dynamics, and accessibility settings.

---

## 🛠 Local Setup & Running Instructions

If you wish to run and evaluate NarraView on your own machine, follow the instructions below.

### Prerequisites
1. **macOS** with Apple Silicon (M1/M2/M3/M4) or Intel
2. **Node.js 20+** and **npm**
3. **Amazon Vega SDK & Vega CLI** installed (`~/vega`)

---

### Step 1: Environment Activation & Build

Open your terminal in the root of the NarraView repository:

```bash
# 1. Activate Vega environment
source ~/vega/env

# 2. Install dependencies
npm install
npm --prefix studio install

# 3. Build the Vega application package (Debug)
npm run build:debug
```

The build will complete with exit code `0` and create packages in `build/private/kepler/@amazon-devices/narraview/undefined/vega/`.

---

### Step 2: Start Virtual Device & Launch App

```bash
# 1. Start the Amazon Vega Virtual Device emulator
vega virtual-device start

# 2. Launch the NarraView application package
# For Apple Silicon Mac:
vega run-app build/private/kepler/@amazon-devices/narraview/undefined/vega/aarch64/Debug/@amazon-devices/narraview_aarch64.vpkg

# For Intel Mac:
# vega run-app build/private/kepler/@amazon-devices/narraview/undefined/vega/x86_64/Debug/@amazon-devices/narraview_x86_64.vpkg
```

NarraView will launch on the virtual Fire TV screen.

---

### Step 3: Optional Demo State Reset

To ensure your local session begins with the exact demonstration state:

```bash
npm run demo:reset
```

This resets the test viewer profile (`narraview-demo-viewer`) with:
* Progress on *CityCare Demo* set to **02:14**
* Pre-recorded watched intervals from **00:00 to 02:14**
* Standard explanation preferences restored

---

## 🎯 Golden Test Flow (Step-by-Step)

Follow this golden path to verify all core intelligence invariants:

### 1. Home Screen Navigation
* Use the Virtual Device remote (arrow keys) to navigate the catalog.
* Notice the categorized cloud rows: **Demos**, **Tutorials**, **Stories**.
* Highlight **CityCare Demo** and press **SELECT** (Enter).

### 2. Details Screen & "Previously On"
* On the Details screen, notice the action buttons: **Resume from 02:14**, **Watch from Beginning**, and **Previously On**.
* Focus and select **Previously On**.
* **Observe:** NarraView displays a personalized recap of the exact events that occurred up to 02:14 (the initial civic complaint, the dispatch center introduction, and the Haversine formula calculation).
* Press **Back** to return to Details.

### 3. Resume Playback & Safe Answer Verification
* Select **Resume from 02:14**. The video starts playing at 02:14.
* Press **SELECT** or the designated AI key to open the in-player **Ask NarraView** overlay.
* Ask (or select): *"What is Haversine distance?"*
* **Expected Result:** ✅ **Answered.** NarraView explains that Haversine distance calculates the great-circle distance between two geographical points on a sphere, citing the segment revealed at 01:30.

### 4. SpoilerShield Refusal Verification (Future Boundary)
* While still at timestamp **02:14**, ask: *"What mobile app do field officers use?"*
* **Expected Result:** 🛡 **SpoilerShield Refusal.** NarraView intercepts the query and refuses to answer:
  > *"SpoilerShield: Information about field officer mobile applications has not yet been revealed at your current playback position (02:14). Keep watching to unlock this information!"*
* Future knowledge is deterministically blocked.

### 5. Seek Forward & Knowledge Unlock
* Close the overlay and fast-forward the video past **03:00** (e.g., to **03:15**).
* Re-open **Ask NarraView**.
* Ask the exact same question: *"What mobile app do field officers use?"*
* **Expected Result:** ✅ **Answered.** NarraView now answers that field officers use **CityCare Mobile** for real-time field dispatch and GPS tracking, because the concept was revealed at timestamp 03:00.

### 6. Seek Backward (Contraction Invariant)
* Rewind the video back to **02:00**.
* Ask again: *"What mobile app do field officers use?"*
* **Expected Result:** 🛡 **SpoilerShield Refusal.** The knowledge boundary has strictly contracted again.

### 7. Explanation Preferences (Accessibility)
* Open **⚙ Explanation Preferences** from the in-player menu or Home screen.
* Change **Explanation Style** to **Very Simple**.
* Re-ask *"What is Haversine distance?"*.
* **Expected Result:** ✅ NarraView provides a simplified, low-cognitive-load explanation (e.g., *"It is a way to find the shortest distance between two points on the curved surface of the Earth"*) while preserving exact mathematical consistency.

---

## 🧪 Running Automated Unit & Integration Tests

To run the complete automated test suite:

```bash
npm test
```

**Expected Result:** **39 tests passing** across 4 suites:
* `test/App.spec.tsx` (TV rendering & focus navigation)
* `test/v0.18-personalized-recap.test.ts` (Watched-interval recap & seek contraction)
* `test/v0.19-accessibility.test.ts` (Accessibility profiles & evidence invariance)
* `test/v1.0.1-content-management.test.ts` (Content categorization & deletion safety)

---

## 🌐 Optional: NarraView Studio (Operator Control Plane)

To inspect the cloud ingestion and pipeline backend:

```bash
npm --prefix studio run dev
```
Visit `http://localhost:3000` in your browser to inspect raw transcripts, LLM-corrected transcripts, extracted scene segments, and versioned intelligence packages.
