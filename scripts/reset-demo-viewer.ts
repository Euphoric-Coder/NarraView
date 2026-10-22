/**
 * NarraView Hackathon Demo State Reset Script
 * Restores narraview-demo-viewer progress and preferences to the golden path baseline.
 *
 * Usage:
 *   npx tsx scripts/reset-demo-viewer.ts
 *   or: npm run demo:reset
 */

const API_BASE_URL = process.env.API_BASE_URL || "https://vif7g6ez24.execute-api.eu-north-1.amazonaws.com/prod";
const DEMO_VIEWER_ID = process.env.VIEWER_ID || "narraview-demo-viewer";

async function postJson(url: string, data?: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${url} failed [${res.status}]: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

async function putJson(url: string, data: any) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT ${url} failed [${res.status}]: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${url} failed [${res.status}]: ${txt}`);
  }
  return res.json();
}

async function main() {
  console.log("==================================================");
  console.log("NARRAVIEW DEMO STATE RESET");
  console.log("==================================================");
  console.log(`Target Viewer: ${DEMO_VIEWER_ID}`);
  console.log(`API Base:      ${API_BASE_URL}`);
  console.log("");

  // 1. Reset any existing progress
  console.log("1. Resetting demo viewer history and progress...");
  try {
    await postJson(`${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/progress/city-care-demo/reset`).catch(() => {});
    await postJson(`${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/progress/ml-systems-tutorial/reset`).catch(() => {});
    await postJson(`${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/progress/signal-lost/reset`).catch(() => {});
    console.log("   ✓ Progress reset complete.");
  } catch (err: any) {
    console.warn("   (Notice: reset endpoint warning: " + err.message + ")");
  }

  // 2. Seed CityCare Demo partial progress (02:14 / 134.8s)
  console.log("2. Seeding CityCare Demo progress (02:14 / 134.8s)...");
  const cityCareProgress = await putJson(
    `${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/progress/city-care-demo`,
    {
      positionSeconds: 134.8,
      durationSeconds: 315,
      isEnded: false,
      watchedIntervals: [
        { start: 0, end: 134.8 }
      ]
    }
  );
  console.log(`   ✓ CityCare progress saved at ${cityCareProgress.positionSeconds}s (${cityCareProgress.progressPercent?.toFixed(1)}%).`);

  // 3. Reset Accessibility Profile to Standard baseline
  console.log("3. Restoring Accessibility Profile (Standard baseline)...");
  const profile = await putJson(
    `${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/accessibility`,
    {
      explanationStyle: "standard",
      verbosity: "normal",
      jargonSupport: true,
      entityReminders: true,
      conceptReminders: true,
      stepByStep: false,
      reducedCognitiveLoad: false,
      autoExplainComplexTerms: false
    }
  );
  console.log(`   ✓ Accessibility profile restored: style=${profile.explanationStyle}, verbosity=${profile.verbosity}.`);

  // 4. Verify Continue Watching
  console.log("4. Verifying Continue Watching row...");
  const continueWatching = await getJson(`${API_BASE_URL}/viewer/${DEMO_VIEWER_ID}/continue-watching`);
  console.log(`   ✓ Continue Watching contains ${continueWatching.length} item(s):`);
  continueWatching.forEach((item: any, i: number) => {
    console.log(`     [${i + 1}] ${item.title} (${item.contentId}) — ${item.positionSeconds}s / ${item.durationSeconds}s (${item.progressPercent}%)`);
  });

  console.log("");
  console.log("==================================================");
  console.log("DEMO RESET COMPLETE: READY FOR HACKATHON PRESENTATION");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Demo reset failed:", err);
  process.exit(1);
});
