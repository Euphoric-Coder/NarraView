import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ViewerProgress, PlaybackSessionResponse, ProgressUpdateRequest, ContinueWatchingItem, ViewerHistoryItem, ViewerAccessibilityProfile, DEFAULT_ACCESSIBILITY_PROFILE, ALLOWED_EXPLANATION_STYLES, ALLOWED_VERBOSITIES } from './types';
import { mergeIntervals, mergeMultipleIntervals } from './intervals';
import { validatePosition, calculateProgressPercent, evaluateCompletion, isEligibleForContinueWatching } from './progress';
import { buildViewerReturnContext } from './returnIntelligence';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLE_NAME = process.env.TABLE_NAME || '';
const CONTENT_TABLE_NAME = process.env.CONTENT_TABLE_NAME || '';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Admin-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE'
};

function formatRuntimeString(seconds?: number): string {
  if (!seconds || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const handler = async (event: any): Promise<any> => {
  const method = event.httpMethod || 'GET';
  const path = event.path || '';
  const pathParameters = event.pathParameters || {};

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'OK' }) };
  }

  try {
    const viewerId = pathParameters.viewerId;
    if (!viewerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required viewerId parameter' })
      };
    }


    // 0a. GET /viewer/{viewerId}/accessibility
    if (method === 'GET' && path.includes('/accessibility')) {
      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId: '__accessibility__' }
      }));

      const profile: ViewerAccessibilityProfile = existingRes.Item ? {
        viewerId,
        explanationStyle: existingRes.Item.explanationStyle || DEFAULT_ACCESSIBILITY_PROFILE.explanationStyle,
        verbosity: existingRes.Item.verbosity || DEFAULT_ACCESSIBILITY_PROFILE.verbosity,
        jargonSupport: typeof existingRes.Item.jargonSupport === 'boolean' ? existingRes.Item.jargonSupport : DEFAULT_ACCESSIBILITY_PROFILE.jargonSupport,
        entityReminders: typeof existingRes.Item.entityReminders === 'boolean' ? existingRes.Item.entityReminders : DEFAULT_ACCESSIBILITY_PROFILE.entityReminders,
        conceptReminders: typeof existingRes.Item.conceptReminders === 'boolean' ? existingRes.Item.conceptReminders : DEFAULT_ACCESSIBILITY_PROFILE.conceptReminders,
        stepByStep: typeof existingRes.Item.stepByStep === 'boolean' ? existingRes.Item.stepByStep : DEFAULT_ACCESSIBILITY_PROFILE.stepByStep,
        reducedCognitiveLoad: typeof existingRes.Item.reducedCognitiveLoad === 'boolean' ? existingRes.Item.reducedCognitiveLoad : DEFAULT_ACCESSIBILITY_PROFILE.reducedCognitiveLoad,
        autoExplainComplexTerms: typeof existingRes.Item.autoExplainComplexTerms === 'boolean' ? existingRes.Item.autoExplainComplexTerms : DEFAULT_ACCESSIBILITY_PROFILE.autoExplainComplexTerms,
        updatedAt: existingRes.Item.updatedAt || new Date().toISOString()
      } : {
        viewerId,
        ...DEFAULT_ACCESSIBILITY_PROFILE,
        updatedAt: new Date().toISOString()
      };

      console.log('[VIEWER_TELEMETRY] ACCESSIBILITY_PROFILE_LOADED', {
        viewerId,
        explanationStyle: profile.explanationStyle,
        verbosity: profile.verbosity,
        reducedCognitiveLoad: profile.reducedCognitiveLoad,
        isDefault: !existingRes.Item
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(profile)
      };
    }

    // 0b. PUT /viewer/{viewerId}/accessibility
    if (method === 'PUT' && path.includes('/accessibility')) {
      let body: any = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch (e) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid JSON body' })
        };
      }

      // Validation
      if (body.explanationStyle !== undefined && !ALLOWED_EXPLANATION_STYLES.includes(body.explanationStyle)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Invalid explanationStyle: ${body.explanationStyle}. Allowed values: ${ALLOWED_EXPLANATION_STYLES.join(' , ')}`
          })
        };
      }

      if (body.verbosity !== undefined && !ALLOWED_VERBOSITIES.includes(body.verbosity)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Invalid verbosity: ${body.verbosity}. Allowed values: ${ALLOWED_VERBOSITIES.join(' , ')}`
          })
        };
      }

      const booleanFields = [
        'jargonSupport',
        'entityReminders',
        'conceptReminders',
        'stepByStep',
        'reducedCognitiveLoad',
        'autoExplainComplexTerms'
      ] as const;

      for (const field of booleanFields) {
        if (body[field] !== undefined && typeof body[field] !== 'boolean') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: `Invalid value for boolean field ${field}: must be true or false`
            })
          };
        }
      }

      // Fetch existing
      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId: '__accessibility__' }
      }));

      const existing = existingRes.Item || {};
      const now = new Date().toISOString();

      const updatedProfile: ViewerAccessibilityProfile = {
        viewerId,
        explanationStyle: body.explanationStyle !== undefined 
          ? body.explanationStyle 
          : (existing.explanationStyle || DEFAULT_ACCESSIBILITY_PROFILE.explanationStyle),
        verbosity: body.verbosity !== undefined 
          ? body.verbosity 
          : (existing.verbosity || DEFAULT_ACCESSIBILITY_PROFILE.verbosity),
        jargonSupport: body.jargonSupport !== undefined 
          ? body.jargonSupport 
          : (typeof existing.jargonSupport === 'boolean' ? existing.jargonSupport : DEFAULT_ACCESSIBILITY_PROFILE.jargonSupport),
        entityReminders: body.entityReminders !== undefined 
          ? body.entityReminders 
          : (typeof existing.entityReminders === 'boolean' ? existing.entityReminders : DEFAULT_ACCESSIBILITY_PROFILE.entityReminders),
        conceptReminders: body.conceptReminders !== undefined 
          ? body.conceptReminders 
          : (typeof existing.conceptReminders === 'boolean' ? existing.conceptReminders : DEFAULT_ACCESSIBILITY_PROFILE.conceptReminders),
        stepByStep: body.stepByStep !== undefined 
          ? body.stepByStep 
          : (typeof existing.stepByStep === 'boolean' ? existing.stepByStep : DEFAULT_ACCESSIBILITY_PROFILE.stepByStep),
        reducedCognitiveLoad: body.reducedCognitiveLoad !== undefined 
          ? body.reducedCognitiveLoad 
          : (typeof existing.reducedCognitiveLoad === 'boolean' ? existing.reducedCognitiveLoad : DEFAULT_ACCESSIBILITY_PROFILE.reducedCognitiveLoad),
        autoExplainComplexTerms: body.autoExplainComplexTerms !== undefined 
          ? body.autoExplainComplexTerms 
          : (typeof existing.autoExplainComplexTerms === 'boolean' ? existing.autoExplainComplexTerms : DEFAULT_ACCESSIBILITY_PROFILE.autoExplainComplexTerms),
        updatedAt: now
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...updatedProfile,
          contentId: '__accessibility__'
        }
      }));

      console.log('[VIEWER_TELEMETRY] ACCESSIBILITY_PROFILE_UPDATED', {
        viewerId,
        updatedFields: Object.keys(body),
        explanationStyle: updatedProfile.explanationStyle,
        verbosity: updatedProfile.verbosity,
        reducedCognitiveLoad: updatedProfile.reducedCognitiveLoad
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedProfile)
      };
    }

    // 1. POST /viewer/{viewerId}/sessions
    if (method === 'POST' && path.includes('/sessions')) {
      const body = event.body ? JSON.parse(event.body) : {};
      const contentId = body.contentId;
      if (!contentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing contentId in session request' })
        };
      }

      const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const now = new Date().toISOString();

      // Read existing progress
      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId }
      }));
      const existing = existingRes.Item as ViewerProgress | undefined;

      let resumePositionSeconds = 0;
      let isCompleted = false;

      if (existing) {
        isCompleted = existing.isCompleted === true;
        if (!isCompleted && existing.positionSeconds > 0) {
          // Contextual continuity: Resume at saved position
          resumePositionSeconds = existing.positionSeconds;
        }
      }

      console.log('[VIEWER_TELEMETRY] PLAYBACK_SESSION_STARTED', {
        viewerId,
        contentId,
        sessionId,
        resumePositionSeconds,
        isCompleted
      });

      const returnContext = buildViewerReturnContext(viewerId, contentId, existing, sessionId);

      const response: PlaybackSessionResponse = {
        sessionId,
        contentId,
        resumePositionSeconds,
        previousProgress: existing,
        isCompleted,
        createdAt: now,
        returnType: returnContext.returnType,
        timeAwaySeconds: returnContext.timeAwaySeconds,
        shouldOfferRecap: returnContext.shouldOfferRecap,
        returnContext
      };

      console.log('[VIEWER_TELEMETRY] RECAP_OFFER_EVALUATED', {
        viewerId,
        contentId,
        returnType: returnContext.returnType,
        timeAwaySeconds: returnContext.timeAwaySeconds,
        shouldOfferRecap: returnContext.shouldOfferRecap
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
      };
    }

    // 2. POST /viewer/{viewerId}/progress/{contentId}/reset
    if (method === 'POST' && path.includes('/reset')) {
      const contentId = pathParameters.contentId;
      if (!contentId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing contentId' }) };
      }

      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId }
      }));
      const existing = existingRes.Item as ViewerProgress | undefined;
      const now = new Date().toISOString();

      const resetItem: ViewerProgress = {
        viewerId,
        contentId,
        positionSeconds: 0,
        durationSeconds: existing?.durationSeconds || 0,
        progressPercent: 0,
        watchedIntervals: existing?.watchedIntervals || [],
        lastWatchedAt: now,
        startedAt: existing?.startedAt || now,
        completedAt: undefined,
        isCompleted: false,
        lastSessionId: existing?.lastSessionId,
        updatedAt: now,
        version: (existing?.version || 0) + 1
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: resetItem
      }));

      console.log('[VIEWER_TELEMETRY] PROGRESS_RESET', { viewerId, contentId });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(resetItem)
      };
    }

    // 3. PUT /viewer/{viewerId}/progress/{contentId}
    if (method === 'PUT' && pathParameters.contentId) {
      const contentId = pathParameters.contentId;
      const body: ProgressUpdateRequest = event.body ? JSON.parse(event.body) : {};

      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId }
      }));
      const existing = existingRes.Item as ViewerProgress | undefined;

      // Stale write protection: check client timestamp if provided
      if (body.clientUpdatedAt && existing?.updatedAt) {
        if (new Date(body.clientUpdatedAt) < new Date(existing.updatedAt)) {
          console.log('[VIEWER_TELEMETRY] PROGRESS_UPDATE_SKIPPED (stale client write)', {
            viewerId,
            contentId,
            clientUpdatedAt: body.clientUpdatedAt,
            existingUpdatedAt: existing.updatedAt
          });
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(existing)
          };
        }
      }

      // Authoritative duration
      let duration = typeof body.durationSeconds === 'number' && body.durationSeconds > 0
        ? body.durationSeconds
        : (existing?.durationSeconds || 0);

      if ((!duration || duration <= 0) && CONTENT_TABLE_NAME) {
        try {
          const contentRes = await docClient.send(new GetCommand({
            TableName: CONTENT_TABLE_NAME,
            Key: { contentId }
          }));
          if (contentRes.Item?.durationSeconds) {
            duration = contentRes.Item.durationSeconds;
          }
        } catch (e) {
          console.warn('[VIEWER_LAMBDA] Failed to fetch content duration:', e);
        }
      }

      const position = validatePosition(body.positionSeconds, duration);
      const isEnded = body.isEnded === true;
      const isCompleted = evaluateCompletion(position, duration, isEnded);
      const progressPercent = calculateProgressPercent(position, duration);

      // Watched interval processing
      let updatedIntervals = existing?.watchedIntervals || [];
      const newIntervals: any[] = [];
      if (body.watchedInterval) {
        newIntervals.push(body.watchedInterval);
      }
      if (Array.isArray(body.watchedIntervals)) {
        newIntervals.push(...body.watchedIntervals);
      }

      if (newIntervals.length > 0) {
        updatedIntervals = mergeMultipleIntervals(updatedIntervals, newIntervals);
        console.log('[VIEWER_TELEMETRY] WATCH_INTERVAL_MERGED', {
          viewerId,
          contentId,
          newIntervalsCount: newIntervals.length,
          mergedIntervalsCount: updatedIntervals.length
        });
      }

      const now = new Date().toISOString();
      const startedAt = existing?.startedAt || now;
      const completedAt = isCompleted ? (existing?.completedAt || now) : undefined;
      const version = (existing?.version || 0) + 1;

      const progressItem: ViewerProgress = {
        viewerId,
        contentId,
        positionSeconds: isEnded && duration > 0 ? duration : position,
        durationSeconds: duration,
        progressPercent: isEnded ? 100 : progressPercent,
        watchedIntervals: updatedIntervals,
        lastWatchedAt: now,
        startedAt,
        completedAt,
        isCompleted,
        lastSessionId: body.sessionId || existing?.lastSessionId,
        updatedAt: now,
        version
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: progressItem
      }));

      console.log('[VIEWER_TELEMETRY] PROGRESS_UPDATE_ACCEPTED', {
        viewerId,
        contentId,
        positionSeconds: progressItem.positionSeconds,
        progressPercent: progressItem.progressPercent,
        isCompleted: progressItem.isCompleted
      });

      if (isCompleted && !existing?.isCompleted) {
        console.log('[VIEWER_TELEMETRY] PLAYBACK_COMPLETED', {
          viewerId,
          contentId,
          durationSeconds: duration,
          completedAt
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(progressItem)
      };
    }

    // 4. GET /viewer/{viewerId}/progress/{contentId}
    if (method === 'GET' && pathParameters.contentId) {
      const contentId = pathParameters.contentId;
      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { viewerId, contentId }
      }));

      if (!existingRes.Item) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            viewerId,
            contentId,
            positionSeconds: 0,
            durationSeconds: 0,
            progressPercent: 0,
            watchedIntervals: [],
            isCompleted: false,
            notStarted: true,
            returnType: 'NEW_VIEWER',
            timeAwaySeconds: 0,
            shouldOfferRecap: false
          })
        };
      }

      const itemProg = existingRes.Item as ViewerProgress;
      const retCtx = buildViewerReturnContext(viewerId, contentId, itemProg);
      const enrichedProgress = {
        ...itemProg,
        returnType: retCtx.returnType,
        timeAwaySeconds: retCtx.timeAwaySeconds,
        shouldOfferRecap: retCtx.shouldOfferRecap,
        returnContext: retCtx
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(enrichedProgress)
      };

    }

    // 5. GET /viewer/{viewerId}/continue-watching
    if (method === 'GET' && path.includes('/continue-watching')) {
      // Query GSI by viewerId, ordered by lastWatchedAt desc
      const queryRes = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'ViewerProgressByLastWatched',
        KeyConditionExpression: 'viewerId = :vid',
        ExpressionAttributeValues: {
          ':vid': viewerId
        },
        ScanIndexForward: false
      }));

      const progressRecords = (queryRes.Items || []) as ViewerProgress[];

      // Fetch all content items to filter and enrich metadata
      let contentMap: Record<string, any> = {};
      if (CONTENT_TABLE_NAME) {
        try {
          const scanRes = await docClient.send(new ScanCommand({
            TableName: CONTENT_TABLE_NAME
          }));
          (scanRes.Items || []).forEach(item => {
            const cid = item.contentId || item.id;
            contentMap[cid] = item;
          });
        } catch (e) {
          console.warn('[VIEWER_LAMBDA] Failed to scan content for continue-watching:', e);
        }
      }

      const continueWatchingList: ContinueWatchingItem[] = [];

      for (const prog of progressRecords) {
        const contentItem = contentMap[prog.contentId];
        // Enforce eligibility:
        // position >= 5.0s, isCompleted === false, catalogVisible !== false, mediaPlayable !== false
        if (prog.contentId === '__accessibility__' || !isEligibleForContinueWatching(prog, contentItem)) {
          continue;
        }

        const duration = prog.durationSeconds || contentItem?.durationSeconds || 0;
        const runtime = contentItem?.runtime || formatRuntimeString(duration);
        const genre = contentItem?.contentType
          ? contentItem.contentType.charAt(0).toUpperCase() + contentItem.contentType.slice(1)
          : (contentItem?.genre || 'Feature');

        const itemRetCtx = buildViewerReturnContext(viewerId, prog.contentId, prog);
        continueWatchingList.push({
          id: prog.contentId,
          contentId: prog.contentId,
          title: contentItem?.title || prog.contentId,
          description: contentItem?.description || '',
          posterUrl: contentItem?.posterUrl,
          runtime,
          genre,
          contentType: contentItem?.contentType,
          positionSeconds: prog.positionSeconds,
          durationSeconds: duration,
          progressPercent: prog.progressPercent,
          lastWatchedAt: prog.lastWatchedAt,
          isCompleted: false,
          mediaPlayable: contentItem ? contentItem.mediaPlayable !== false : true,
          catalogVisible: contentItem ? contentItem.catalogVisible !== false : true,
          aiReady: contentItem?.aiReady === true,
          runtimeProvider: contentItem?.runtimeProvider,
          videoSource: contentItem?.videoUrl,
          returnType: itemRetCtx.returnType,
          timeAwaySeconds: itemRetCtx.timeAwaySeconds,
          shouldOfferRecap: itemRetCtx.shouldOfferRecap
        });
      }

      console.log('[VIEWER_TELEMETRY] CONTINUE_WATCHING_FETCHED', {
        viewerId,
        count: continueWatchingList.length
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(continueWatchingList)
      };
    }

    // 6. GET /viewer/{viewerId}/history
    if (method === 'GET' && path.includes('/history')) {
      const queryRes = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'ViewerProgressByLastWatched',
        KeyConditionExpression: 'viewerId = :vid',
        ExpressionAttributeValues: {
          ':vid': viewerId
        },
        ScanIndexForward: false
      }));

      const progressRecords = (queryRes.Items || []) as ViewerProgress[];

      let contentMap: Record<string, any> = {};
      if (CONTENT_TABLE_NAME) {
        try {
          const scanRes = await docClient.send(new ScanCommand({
            TableName: CONTENT_TABLE_NAME
          }));
          (scanRes.Items || []).forEach(item => {
            const cid = item.contentId || item.id;
            contentMap[cid] = item;
          });
        } catch (e) {
          console.warn('[VIEWER_LAMBDA] Failed to scan content for history:', e);
        }
      }

      const historyList: ViewerHistoryItem[] = progressRecords.filter(p => p.contentId !== '__accessibility__').map(prog => {
        const contentItem = contentMap[prog.contentId];
        const duration = prog.durationSeconds || contentItem?.durationSeconds || 0;
        const runtime = contentItem?.runtime || formatRuntimeString(duration);
        const genre = contentItem?.contentType
          ? contentItem.contentType.charAt(0).toUpperCase() + contentItem.contentType.slice(1)
          : (contentItem?.genre || 'Feature');

        return {
          id: prog.contentId,
          contentId: prog.contentId,
          title: contentItem?.title || prog.contentId,
          description: contentItem?.description || '',
          posterUrl: contentItem?.posterUrl,
          runtime,
          genre,
          contentType: contentItem?.contentType,
          positionSeconds: prog.positionSeconds,
          durationSeconds: duration,
          progressPercent: prog.progressPercent,
          lastWatchedAt: prog.lastWatchedAt,
          startedAt: prog.startedAt,
          completedAt: prog.completedAt,
          isCompleted: prog.isCompleted,
          watchedIntervals: prog.watchedIntervals || [],
          mediaPlayable: contentItem ? contentItem.mediaPlayable !== false : true,
          catalogVisible: contentItem ? contentItem.catalogVisible !== false : true,
          aiReady: contentItem?.aiReady === true,
          runtimeProvider: contentItem?.runtimeProvider,
          videoSource: contentItem?.videoUrl
        };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(historyList)
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: `Not found: ${method} ${path}` })
    };

  } catch (error: any) {
    console.error('[VIEWER_LAMBDA_ERROR]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};
