# Installation

```bash
# Clone the repository
git clone https://github.com/Euphoric-Coder/NarraView.git

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