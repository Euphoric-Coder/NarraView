# NarraView

> Understand what you watch — without ruining what comes next.

**Playback-Aware Intelligence for Amazon Fire TV**

NarraView is an AI-enhanced viewing companion built for Amazon Fire TV on Vega OS. It allows viewers to ask questions about what they are watching while ensuring the AI only uses information revealed up to the viewer's exact playback timestamp.

---

## The Problem

Traditional AI assistants and large language models understand the complete transcript, script, or plot of a piece of media. That creates a fundamental dilemma for viewers:

Asking for clarification on a complex concept, a character relationship, or an earlier plot point can accidentally reveal future events, twist endings, or unrevealed explanations. Viewers are forced to choose between:

* **Remaining confused** during dense documentaries, complex dramas, or technical tutorials, or
* **Risking spoilers** by searching the web or prompting generic AI assistants.

---

## The Solution

NarraView introduces **Playback-Aware Intelligence**.

The core architectural invariant is simple: **NarraView knows exactly as much as the viewer does — no more, no less.**

```
Viewer Playback Timestamp (T)
            ↓
  Safe Temporal Snapshot(T)
            ↓
   Temporal RAG Retrieval
            ↓
    Premise Validation
            ↓
   Grounded AI Response
```

Future knowledge never enters the model context. Knowledge boundaries expand when you play forward and strictly contract when you seek backward.

---

## Core Features

### 🛡 SpoilerShield
Deterministically intercepts and blocks questions whose answers depend on unrevealed future knowledge. If a question inquires about an entity, event, or revelation that occurs later in the timeline, SpoilerShield refuses to answer and protects the viewing experience.

### ✨ Ask NarraView
An in-player AI viewing companion optimized for 10-foot television remote interaction. Viewers can pause at any second and ask about terminology, characters, scene context, or narrative motivations grounded strictly in already-revealed scenes.

### ⏪ Previously On
Generates personalized, spoiler-safe recaps based on the viewer's actual watched intervals. If you resume a title after days away, NarraView summarizes what you personally saw, without revealing skipped content or future developments.

### 🧠 Viewer Memory
Maintains persistent viewer state across playback sessions: exact playback position, watched intervals, return context, and learned entities. When you resume, the system understands your familiarity with key concepts.

### 💡 Explain Simply
Simplifies complex concepts and terminology without altering or hallucinating the safe underlying factual evidence.

### 🎓 Learn Mode
Tailors intelligence for educational, scientific, and technical content, highlighting key definitions, foundational principles, and structured breakdowns.

### ♿ Adaptive Explanation Preferences
Accessible television viewing for diverse cognitive styles and needs:
* **Explanation Style:** Standard, Simple, Very Simple
* **Verbosity:** Brief, Normal, Detailed
* **Assistance Toggles:** Jargon Help, Entity Reminders, Concept Reminders, Step-by-Step Guidance, Reduced Cognitive Load

### ▶ Continue Watching
Persistent viewing progress synchronized across Amazon DynamoDB, allowing instant resumption from your exact timestamp.

### ☁ NarraView Cloud
Cloud-backed content catalog dynamically categorized into:
* **Documentaries**
* **Tutorials**
* **Demos**
* **Stories**
* **Educational**
* **More to Explore**

### 🛠 NarraView Studio
A full-featured Next.js web control plane for content operators:
* Media ingestion and pipeline tracking
* Speech-to-text transcript inspection
* LLM-driven transcript correction
* Temporal scene segmentation
* Knowledge extraction (entities, facts, events, concepts)
* Versioned intelligence compilation
* Content category and presentation metadata editing
* Safe title deletion with protected core demo safeguards

---

## How It Works

```
                        NarraView Studio
                              │
                              ▼
                         Amazon S3
                              │
                              ▼
                      Amazon Transcribe
                              │
                              ▼
                 Transcript Correction
                              │
                              ▼
                  Temporal Segmentation
                              │
                              ▼
                   Knowledge Extraction
                              │
                              ▼
              Versioned Temporal Intelligence
                              │
                              ▼
                  Playback-Aware RAG
                              │
             ┌────────────────┴────────────────┐
             │                                 │
      Safe Snapshot                      Viewer State
             │                                 │
             ▼                                 ▼
        Amazon Bedrock                   DynamoDB
             │                                 │
             └───────────────┬─────────────────┘
                             ▼
                      Amazon Fire TV
                         Vega OS
```

### Architecture Layers

1. **Ingestion & Media Storage (Amazon S3):** Videos uploaded via NarraView Studio are stored in S3 with secure presigned upload and streaming URLs.
2. **Speech Recognition (Amazon Transcribe):** Automatically transcribes spoken audio into timestamped word sequences.
3. **Transcript Correction (AWS Lambda + Bedrock):** Corrects domain jargon, misheard terminology, and punctuation while preserving word-level timing offsets.
4. **Temporal Segmentation (AWS Lambda + Bedrock):** Divides media into semantic narrative chapters and scenes with distinct start and end boundaries.
5. **Knowledge Extraction (AWS Lambda + Bedrock):** Extracts structured entities, facts, events, and concepts, timestamping each element to its exact first-reveal moment (`firstKnownAt` / `revealTime`).
6. **Versioned Intelligence Compilation (Amazon S3):** Packages structured intelligence into immutable versioned packages (`v1`, `v2`, etc.) ensuring consistent runtime evaluation.
7. **Playback-Aware RAG (AWS Lambda):** Dynamically filters the intelligence package against the current viewer playback timestamp.
8. **Premise Validation & Grounding (Amazon Bedrock):** Detects future-dependent assumptions before generation and validates factual grounding before returning answers.
9. **Fire TV Runtime (React Native on Vega OS):** Renders high-performance TV navigation with 10-foot remote focus management, D-pad controls, and W3C media playback.

---

## AWS Services (AWS Builder Integration)

NarraView leverages a multi-service serverless architecture orchestrated by AWS CDK:

* **Amazon S3:** Media repository for raw video files, transcripts, corrected transcripts, scene segments, extracted knowledge, and versioned intelligence JSON packages.
* **Amazon Transcribe:** Automated speech recognition converting video audio into time-synchronized word transcripts.
* **AWS Lambda:** Serverless microservices powering content ingestion, pipeline lifecycle execution, temporal RAG evaluation, viewer progress, and accessibility state.
* **Amazon DynamoDB:** Low-latency persistent storage for content metadata, viewer playback positions, watched intervals, return states, and accessibility preferences.
* **Amazon API Gateway:** RESTful API Gateway exposing authenticated endpoints for Fire TV devices and NarraView Studio.
* **Amazon Bedrock / Bedrock Mantle:** Advanced generative AI reasoning for transcript correction, entity/concept extraction, premise validation, and grounded temporal responses.
* **AWS CDK (Cloud Development Kit):** Type-safe Infrastructure as Code defining repeatable, multi-resource cloud infrastructure.

---

## Technical Differentiation

| Capability | Conventional AI Assistant | NarraView Playback-Aware AI |
|---|---|---|
| **Knowledge Boundary** | Entire document / full transcript | Viewer playback timestamp ($T$) |
| **Spoiler Prevention** | Prompt-based instructions ("don't spoil") | Architectural temporal data isolation |
| **Recap Generation** | Generic whole-summary | Personalized to actual watched intervals |
| **Viewer State** | Stateless / ephemeral session | Persistent progress, memory & accessibility |
| **Explanation Style** | Fixed one-size-fits-all output | Adaptive (Standard, Simple, Very Simple) |
| **TV Interaction** | Generic desktop/mobile web UI | Native Vega OS D-pad & focus-tree UX |

---

## Temporal Safety & Seek Dynamics

The core mathematical foundation of NarraView is the **Safe Temporal Snapshot**:

$$\text{SafeSnapshot}(T) = \{ k \in \text{IntelligencePackage} \mid k.\text{revealTime} \le T \}$$

Where $T$ is the viewer's exact playback timestamp in seconds.

### Seek Behavior Invariant
* **Seek Forward ($T_1 \to T_2$ where $T_2 > T_1$):** The knowledge boundary expands. New concepts, characters, and plot points introduced between $T_1$ and $T_2$ become safely unlocked for Q&A.
* **Seek Backward ($T_2 \to T_1$ where $T_1 < T_2$):** The knowledge boundary **strictly contracts**. Any evidence revealed after $T_1$ is evicted from the retrieval snapshot. Asking a question whose answer depends on scenes between $T_1$ and $T_2$ immediately triggers a SpoilerShield refusal.

---

## Project Structure

```
NarraView/
│
├── src/                          # Amazon Fire TV / Vega OS Application
│   ├── components/               # TV UI Components (Overlay, Cards, Modals)
│   ├── screens/                  # HomeScreen, DetailsScreen, PlayerScreen
│   ├── services/                 # API Clients (Content, Viewer Progress, RAG)
│   └── types/                    # Shared TypeScript interfaces
│
├── backend/                      # AWS Lambda Microservices
│   └── lambdas/
│       ├── ask-scene/            # Playback-Aware Temporal RAG Engine
│       │   └── temporal-rag/     # Snapshot, Retrieval, Premise, Grounding
│       ├── content/              # Content catalog and pipeline management
│       ├── viewer/               # Viewer progress, sessions, accessibility
│       └── pipeline/             # Transcribe and AI ingestion steps
│
├── infrastructure/               # Infrastructure as Code
│   └── cdk/                      # AWS CDK TypeScript Stack
│
├── studio/                       # NarraView Studio (Next.js 16 Web Dashboard)
│   └── src/app/                  # Studio Pages & Management Console
│
├── scripts/                      # Operational Scripts (Demo Reset, Seeding)
├── test/                         # Comprehensive Jest Test Suites (39 tests)
├── assets/                       # Static media, icons, and diagrams
├── submission/                   # Hackathon Submission Package
├── .env.example                  # Sanitized environment variable template
├── LICENSE                       # MIT License
└── package.json                  # Root npm workspace configuration
```

---

## Prerequisites

* **Node.js 20+** and **npm**
* **AWS CLI** (configured with appropriate development credentials)
* **AWS CDK CLI** (`npm install -g aws-cdk`)
* **Amazon Vega SDK & Vega CLI** (`source ~/vega/env`)

---

## Installation

```bash
# Clone the repository
git clone <REPOSITORY_URL>
cd NarraView

# Install root dependencies (React Native / Vega / Backend)
npm install

# Install NarraView Studio dependencies
npm --prefix studio install
```

---

## Vega Setup (Fire TV / Vega OS)

```bash
# 1. Activate your Vega SDK environment
source ~/vega/env

# 2. Build the Vega application package
npm run build:debug

# 3. Start the Vega Virtual Device
vega virtual-device start

# 4. Launch NarraView in the Virtual Device (using repo-relative package)
# For Apple Silicon Mac:
vega run-app build/private/kepler/@amazon-devices/narraview/undefined/vega/aarch64/Debug/@amazon-devices/narraview_aarch64.vpkg

# For Intel Mac:
# vega run-app build/private/kepler/@amazon-devices/narraview/undefined/vega/x86_64/Debug/@amazon-devices/narraview_x86_64.vpkg
```

---

## NarraView Studio Setup

```bash
# Start NarraView Studio locally
npm --prefix studio run dev

# Open http://localhost:3000 in your browser
```

Configure your `studio/.env.local` based on `studio/.env.example` with your deployed API Gateway endpoint.

---

## AWS Backend Deployment

```bash
# 1. Configure AWS credentials
aws configure

# 2. Synthesize CloudFormation template
npx --prefix infrastructure/cdk cdk synth --app "npx tsx infrastructure/cdk/bin/cdk.ts"

# 3. Deploy CDK stack to your AWS account
npx --prefix infrastructure/cdk cdk deploy --app "npx tsx infrastructure/cdk/bin/cdk.ts"
```

---

## Demo State Reset

To restore the preconfigured demonstration viewer session for judging:

```bash
npm run demo:reset
```

This script restores viewer `narraview-demo-viewer` to a known return state on *CityCare Demo* at timestamp **02:14** with pre-seeded watched intervals and standard accessibility preferences.

---

## Running Tests

```bash
npm test
```

Current expected baseline: **39 tests passing** across 4 test suites covering:
* Core application rendering and TV navigation
* Playback-aware temporal snapshot isolation
* Personalized recap watched-interval scoring
* Accessibility intelligence and explanation styles
* Content categorization and deletion safeguards

---

## Golden Demo Flow

To experience NarraView's core value in under 3 minutes:

1. **Launch NarraView:** Open the app on the Vega Virtual Device.
2. **Select "CityCare Demo":** Navigate to *CityCare Demo* on the Home Screen.
3. **Previously On:** Select **Previously On** to view a personalized recap of what was watched up to 02:14.
4. **Resume Playback:** Select **Resume from 02:14**.
5. **Ask NarraView:** Pause and ask *"What is Haversine distance?"*
6. **Safe Answer:** NarraView provides an accurate explanation based on the definition revealed at 01:30.
7. **Ask Future Question:** Ask *"What mobile app do field officers use?"*
8. **SpoilerShield Refusal:** SpoilerShield intercepts the question and refuses to answer because the mobile app is not introduced until 03:00.
9. **Seek Forward:** Fast-forward playback past 03:00 to 03:15.
10. **Ask Again:** Ask the exact same question (*"What mobile app do field officers use?"*).
11. **Unlocked Answer:** NarraView now answers fully, referencing CityCare Mobile.
12. **Adaptive Explanation:** Open **Explanation Preferences**, switch style to **Very Simple**, and re-query to see simplified language preserving exact facts.
13. **Catalog Proof:** Return to Home and inspect *ML Systems Tutorial* to observe generic educational ingestion.

---

## Hackathon Tracks

### Primary Track: Fire TV
NarraView is a native React Native application built on Amazon Vega OS, specifically tailored for Amazon Fire TV. It features:
* 10-foot television user experience
* D-pad spatial focus navigation (`TVFocusGuideView`)
* W3C Media Player integration
* In-player contextual overlays designed for remote control interaction

### Mini Challenge: AWS Builder
NarraView demonstrates a comprehensive multi-service cloud architecture on AWS:
* **Amazon S3** for media, transcript, and intelligence storage
* **Amazon Transcribe** for automated speech-to-text
* **AWS Lambda** for serverless processing and temporal intelligence RAG
* **Amazon DynamoDB** for viewer progress, watched intervals, and accessibility settings
* **Amazon API Gateway** for client-server communication
* **Amazon Bedrock** for grounded generative AI reasoning
* **AWS CDK** for automated, reproducible infrastructure deployment

---

## Built During the Hackathon

The following major systems were engineered and expanded during the hackathon window:
* **Amazon Vega OS / Fire TV Application:** Native React Native application, D-pad navigation system, TV focus management, and W3C media player integration.
* **Playback-Aware Temporal RAG:** Deterministic snapshot slicing, timestamp-bounded evidence retrieval, and knowledge boundary contraction on seek-back.
* **SpoilerShield:** Future-premise detection and deterministic spoiler interception engine.
* **Personalized "Previously On":** Watched-interval coverage analysis and return-state recap generation.
* **Accessibility Intelligence:** Adaptive explanation preferences (Standard, Simple, Very Simple) preserving identical underlying evidence.
* **Generic Content Pipeline:** Ingestion pipeline orchestrating S3, Transcribe, transcript correction, temporal segmentation, and knowledge extraction.
* **Versioned Intelligence Compiler:** Immutable versioned JSON schema architecture for media intelligence.
* **NarraView Studio:** Next.js operator dashboard for content lifecycle management, transcript inspection, and safe metadata editing.
* **AWS Backend Infrastructure:** Complete AWS CDK deployment of API Gateway, DynamoDB tables, Lambda functions, and S3 storage.

---

## Known Limitations

* **Target Platform:** Tested primarily on the Amazon Vega Virtual Device (macOS x86_64 / aarch64) representing the Fire TV / Vega OS target.
* **Catalog Size:** The demonstration environment includes a focused set of curated video assets (*CityCare Demo*, *ML Systems Tutorial*, *Signal Lost*) to allow rapid judging evaluation.
* **AI Latency:** Response latency for in-player Q&A depends on live AWS Lambda execution and model inference times.

---

## License

This project is licensed under the [MIT License](LICENSE).
