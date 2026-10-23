# NarraView: Developer Friction Log

This document records authentic friction logs encountered during the development of NarraView for the **Build, Ship, Shape: Amazon Developer Hackathon**.

Entries adhere strictly to the hackathon feedback criteria to aid SDK and platform engineering teams.

---

### Entry 1: Vega CLI Environment Activation Discovery

* **Task Attempted:** Launch Vega development environment and build the application package via command line.
* **Steps Taken:**
  1. Installed Vega SDK prerequisites.
  2. Opened a new terminal window in the project workspace.
  3. Ran `vega virtual-device start` or `npm run build:debug`.
* **Expected Result:** The Vega CLI executes and starts the virtual device emulator or builds the package.
* **Actual Result:** `zsh: command not found: vega`.
* **Severity:** Medium (Early Onboarding Blocker).
* **Workaround:** Sourced the environment manually via `source ~/vega/env` in every new shell or added it to `~/.zshrc`.
* **Suggested Improvement:** The Vega installer should offer to automatically append the environment sourcing script to the user's active shell configuration profile (`~/.zshrc`, `~/.bashrc`), or provide a self-contained wrapper binary in `/usr/local/bin`.

---

### Entry 2: W3C Media Player Lifecycle & URL Streaming Resilience

* **Task Attempted:** Stream remote video files inside the Vega React Native client using `@amazon-devices/react-native-w3cmedia`.
* **Steps Taken:**
  1. Configured `<VideoPlayer />` component with a remote S3 media URL.
  2. Passed event listeners for `onTimeUpdate`, `onError`, and `onEnded`.
  3. Attempted playback of raw video assets in the Vega Virtual Device.
* **Expected Result:** Video streams smoothly, and player fires regular timestamp callbacks to synchronize NarraView's temporal snapshot.
* **Actual Result:** Occasional black screen and silent stalls when loading certain URL schemes or unbuffered streams, with generic error events lacking error codes or HTTP status details.
* **Severity:** High (Core Playback Functionality).
* **Workaround:** Switched to direct HTTPS S3 URLs with verified CORS and MIME headers (`video/mp4`), and implemented defensive state polling and player mounting lifecycles to ensure media descriptors bind before playback commences.
* **Suggested Improvement:** Provide verbose media player telemetry events in development mode (e.g., exposing network error codes, audio/video decoder state, buffer health, and demuxer status) to make media troubleshooting straightforward.

---

### Entry 3: Amazon Bedrock Model Availability & Account Entitlement Diagnostics

* **Task Attempted:** Utilize experimental Amazon Nova foundation models for multimodal visual scene analysis within the backend pipeline.
* **Steps Taken:**
  1. Configured Lambda microservice to invoke Nova model ID in `eu-north-1`.
  2. Executed test inference call via AWS SDK BedrockRuntime client.
* **Expected Result:** Model processes input prompt and returns inference response.
* **Actual Result:** `ValidationException: Operation not allowed to perform on this model`.
* **Severity:** High (Feature Architectural Blocker).
* **Workaround:** Rather than shipping unverified or fragile multimodal behavior, we strictly removed the experimental multimodal pipeline from the final submission scope, focusing exclusively on our rock-solid, production-verified speech and knowledge temporal RAG pipeline.
* **Suggested Improvement:** Enhance Bedrock error messages to clearly distinguish between: (a) model access not enabled in console, (b) model unavailable in current region, and (c) model requiring separate commercial entitlement. A CLI command such as `aws bedrock check-access --model-id <id>` would accelerate verification.

---

### Entry 4: Television D-pad Focus Hierarchy & Action Trap

* **Task Attempted:** Navigate smoothly between in-player controls ("Previously On", "Explain Simply", "Learn Mode", "Explanation Preferences", "Close") using TV remote directional keys.
* **Steps Taken:**
  1. Placed multiple `Pressable` buttons inside the in-player modal overlay.
  2. Tested directional D-pad navigation in the Vega Virtual Device.
* **Expected Result:** Pressing DOWN or RIGHT on the remote moves focus sequentially through the action buttons.
* **Actual Result:** Focus became trapped on the first action button ("Previously On") or skipped secondary action rows because the default React Native TV focus engine could not determine spatial proximity in nested absolute-positioned overlays.
* **Severity:** Medium (TV-First Usability).
* **Workaround:** Wrapped interactive sections in `TVFocusGuideView` containers with explicit `destinations` arrays, and managed `hasTVPreferredFocus` programmatically based on active modal state.
* **Suggested Improvement:** Document best practices and reference architectures for TV modal focus trapping specifically for Vega OS, and include a visual focus debugging mode in the Vega Virtual Device.

---

### Entry 5: Studio API Proxy 502 Bad Gateway During Pipeline Inspection

* **Task Attempted:** Inspect raw and corrected speech transcripts in NarraView Studio for newly ingested titles.
* **Steps Taken:**
  1. Opened `http://localhost:3000/content/ml-systems-tutorial/transcript`.
  2. Requested raw and corrected transcript views.
* **Expected Result:** Studio displays formatted transcript lines with timestamps.
* **Actual Result:** Browser console logged `502 Bad Gateway` from `/api/admin/content/ml-systems-tutorial/transcript`.
* **Severity:** Medium (Operator Dashboard Inspection).
* **Workaround:** Identified that the Next.js API catch-all route was attempting to pass an empty or malformed admin token header to the backend API Gateway; resolved by ensuring the backend gracefully handles unauthenticated admin reads for inspection and configuring sanitized server-side token forwarding in Next.js route handlers.
* **Suggested Improvement:** Include standardized error response bodies with API Gateway proxy errors to distinguish between network unreachable, upstream timeout, and header validation failures.