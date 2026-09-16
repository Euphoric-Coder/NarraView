import { handler } from './index';

async function runTests() {
  console.log('--- Running Lambda Tests ---\\n');

  // Test 1: Missing body
  console.log('Test 1: Missing body');
  const res1 = await handler({});
  console.log(res1.statusCode === 400 ? '✅ Passed' : '❌ Failed', res1.body);

  // Test 2: Valid Request at 2 seconds
  console.log('\\nTest 2: Valid request at 2s (Intro Scene)');
  const res2 = await handler({
    body: JSON.stringify({
      contentId: 'signal-lost',
      timestamp: 2.5,
      question: 'What just happened?'
    })
  });
  console.log(res2.statusCode === 200 ? '✅ Passed' : '❌ Failed');
  console.log('Answer:', JSON.parse(res2.body).answer);

  // Test 3: Valid Request at 14 seconds
  console.log('\\nTest 3: Valid request at 14s (Telemetry Scene)');
  const res3 = await handler({
    body: JSON.stringify({
      contentId: 'signal-lost',
      timestamp: 14.1,
      question: 'Explain this scene',
      scene: { label: 'SCENE 02 — Telemetry Failure' }
    })
  });
  console.log(res3.statusCode === 200 ? '✅ Passed' : '❌ Failed');
  console.log('Answer:', JSON.parse(res3.body).answer);
}

runTests();
