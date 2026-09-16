interface AskRequest {
  contentId: string;
  timestamp: number;
  question: string;
  scene?: {
    startTime: number;
    endTime: number;
    label: string;
  };
}

interface AskResponse {
  answer: string;
  contentId: string;
  sceneId?: string;
  sceneLabel?: string;
  timestamp: number;
  spoilerSafe: boolean;
  confidence: number;
  source: string;
}

export const handler = async (event: any): Promise<any> => {
  try {
    // Basic CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
    }

    const body: AskRequest = JSON.parse(event.body);

    // Validate required fields
    if (!body.contentId || body.timestamp === undefined || !body.question) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: contentId, timestamp, or question' })
      };
    }

    // Structured Logging
    console.log(`[NarraView API] request:\\ncontent=${body.contentId}\\ntime=${body.timestamp}\\nquestion=${body.question}`);
    if (body.scene) {
      console.log(`scene=${body.scene.label}`);
    }

    let answer = "NarraView couldn't analyze this scene.";

    // Deterministic mock answers based on timestamp for Signal Lost
    if (body.contentId === 'signal-lost') {
      if (body.timestamp >= 0 && body.timestamp < 6) {
        answer = "An unexplained transmission interrupts communications at Orbital Research Station Eos.";
      } else if (body.timestamp >= 6 && body.timestamp < 12) {
        answer = "Dr. Maya Chen has received a corrupted emergency signal from an inactive relay.";
      } else if (body.timestamp >= 12 && body.timestamp < 18) {
        answer = "Alex has discovered that several telemetry records were altered shortly before the blackout.";
      } else if (body.timestamp >= 18) {
        answer = "The team has traced the anomaly to Station Seven and is preparing to investigate.";
      }
    } else {
      answer = `Mock response for ${body.contentId} at ${body.timestamp}s`;
    }

    const response: AskResponse = {
      answer,
      contentId: body.contentId,
      sceneLabel: body.scene?.label,
      timestamp: body.timestamp,
      spoilerSafe: true,
      confidence: 1.0,
      source: 'mock'
    };

    console.log(`[NarraView API] response:\\nsource=mock\\nscene=${response.sceneLabel || 'unknown'}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
