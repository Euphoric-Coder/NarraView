# NarraView: Product Feedback & Developer Experience

Feedback prepared for the **Build, Ship, Shape: Amazon Developer Hackathon**.

---

## 1. Amazon Vega & Fire TV

### Tools & SDKs Used
* **Amazon Vega SDK & Vega CLI (`vega`)**
* **Vega Virtual Device (x86_64 / aarch64 emulator on macOS)**
* **React Native for Vega (`@amazon-devices/react-native-kepler`)**
* **Vega W3C Media Player (`@amazon-devices/react-native-w3cmedia`)**
* **Vega TV Focus Management (`TVFocusGuideView`, `hasTVPreferredFocus`)**
* **Vega Package Tool (`vpt`) & Build Tool (`vtbuild`)**

### What Worked Well
* **React Native Paradigm on TV:** The ability to leverage React Native components, hooks, and TypeScript for a television operating system drastically reduced initial development overhead.
* **Vega Virtual Device Stability:** The virtual device emulator ran reliably on macOS, providing rapid visual feedback for 10-foot television layouts, font scale rendering, and remote interaction.
* **Remote Control APIs & Focus System:** Vega's focus primitives (`TVFocusGuideView`) provided the necessary spatial control to build intuitive D-pad navigation flows across complex multi-column catalog screens and player overlays.
* **W3C Media Player Integration:** Once correctly configured with HTTPS streaming endpoints, the W3C media component provided smooth hardware-accelerated playback with accurate timestamp polling.
* **Build Tooling Performance:** `npm run build:debug` compiled multi-architecture packages (`armv7`, `x86_64`, `aarch64`) swiftly with clear manifest generation.

### What Needs Work
* **Environment Discovery & Activation:** Running `vega` requires sourcing `~/vega/env` in every shell session. If omitted, the CLI fails with a standard "command not found" rather than a guided prompt. Including automatic shell configuration during installation would reduce early onboarding friction.
* **W3C Media Error Telemetry:** When a media URL fails or an unsupported codec is encountered, the player emits generic error codes with minimal diagnostics in logcat/console. More granular media lifecycle events (e.g., specific HTTP error codes, TLS handshake failures, buffering starvation indicators) would significantly speed up playback debugging.
* **Focus Hierarchy Debugging Tools:** Visualizing focus traps and D-pad candidate navigation paths in the Virtual Device is challenging. A visual focus inspector overlay (showing bounding boxes and directional focus links) would be a game-changer for TV developers.
* **Jest Testing Resolver Conflicts:** The Kepler Jest preset overrides module resolution to prioritize `.native.js` across all imported libraries, which can cause unexpected ESM/CJS clashes when importing shared Node.js utility or AWS SDK modules into unit test suites. Clearer documentation on configuring module mappers for hybrid client-backend repositories would be beneficial.

### Developer Onboarding
* Moving from reading the Vega documentation to running the first "Hello World" app in the Virtual Device took approximately 45 minutes once SDK prerequisites were installed.
* Sourcing `~/vega/env` and launching `vega virtual-device start` was seamless once documented.
* Transitioning from a static layout to interactive W3C video playback required understanding Vega-specific manifest permissions and media descriptor bindings.

### Would You Build With It Again?
**YES.** Vega OS combines the velocity of React Native with the specialized constraints of television hardware. The platform provides a viable, modern foundation for building intelligent TV-native viewing applications.

---

## 2. Amazon Web Services (AWS)

### Services Used
* **Amazon Simple Storage Service (S3)**
* **Amazon Transcribe**
* **AWS Lambda (Node.js 20.x runtime)**
* **Amazon DynamoDB (Pay-Per-Request)**
* **Amazon API Gateway (REST API)**
* **Amazon Bedrock & Bedrock Mantle**
* **AWS Cloud Development Kit (AWS CDK v2 in TypeScript)**

### What Worked Well
* **Serverless Composition:** Composing S3, Lambda, DynamoDB, and API Gateway into an event-driven media intelligence pipeline was exceptionally smooth. S3 presigned URLs allowed large video uploads without routing media through API Gateway.
* **Word-Level Timestamping in Amazon Transcribe:** Transcribe delivered precise word-level start and end timestamps, which formed the indispensable foundation for our temporal segmentation and playback-aware snapshotting.
* **DynamoDB Millisecond Latency:** Storing viewer progress, watched intervals, and accessibility profiles in DynamoDB enabled sub-10ms state updates during active video playback.
* **AWS CDK Repeatability:** Defining the entire backend in TypeScript CDK (`CdkStack`) eliminated manual console configuration, made environment replication instant, and ensured permissions were principle-of-least-privilege.
* **Bedrock Converse API Flexibility:** The unified Converse API in Amazon Bedrock provided structured prompt engineering, predictable token usage, and rapid experimentation across foundational models.

### What Needs Work
* **Model Entitlement & Region Clarity:** Model access errors (e.g., `ValidationException: Operation not allowed to perform on this model`) do not always clearly distinguish between:
  1. The model not being enabled in the account Bedrock Model Access console,
  2. The model being unavailable in the specific target region (e.g., `eu-north-1` vs `us-east-1`), or
  3. The model requiring separate organizational entitlement.
  More descriptive error messages with direct remediation links would save hours of trial and error.
* **Transcribe Multi-Lingual Auto-Detection Latency:** Auto-detecting languages during batch transcription added noticeable latency compared to explicit language codes. We resolved this by providing language hints during ingestion.
* **Bedrock Streaming Integration with API Gateway REST APIs:** Streaming token-by-token responses to a TV client through traditional REST API Gateway requires WebSocket APIs or HTTP API streaming, which adds architectural complexity compared to standard REST Lambdas.

### Developer Onboarding
* Configuring AWS CLI credentials and running `cdk synth` / `cdk deploy` took less than 15 minutes.
* Deploying Lambda microservices and connecting them to API Gateway was fully automated through CDK constructs.
* Integrating the AWS SDK v3 into TypeScript microservices was straightforward with type-safe command structures.

### Would You Use It Again?
**YES.** AWS offers the most comprehensive, enterprise-ready cloud ecosystem for building media intelligence pipelines. The synergy between Amazon Transcribe for speech timing, Amazon Bedrock for semantic extraction, and AWS Lambda for serverless execution is unmatched for content AI workloads.

---

## 3. Kiro (Developer Tooling)

### Usage & Contribution
* **Role:** Kiro was utilized as an AI-powered developer assistant during repository architecture, MCP server integration, test suite design, and documentation planning.
* **What Worked Well:** Kiro provided context-aware understanding across the hybrid repository structure (bridging the React Native Vega client, the AWS CDK infrastructure, and the Next.js Studio).
* **Compliance Note:** Kiro functioned strictly as a development and pair-programming tool; no Kiro runtime services or non-qualifying dependencies exist in the production runtime architecture. Its use accelerated our AWS Builder integration and documentation clarity.
