import mongoose from 'mongoose';
import crypto from 'crypto';
import { ReasoningSession, IReasoningSession, IReasoningStep, StepStatus } from '../../models/ReasoningSession';

export interface StartSessionInput {
  operation: string;
  companyId?: mongoose.Types.ObjectId | string | null;
  leadId?: mongoose.Types.ObjectId | string | null;
  docKind?: string;
  plannedSteps: Array<{ label: string; detail?: string; evidence?: string[] }>;
}

/**
 * Creates a new reasoning session with all planned steps in "pending" state.
 * As the real work progresses, services call updateStep() to move them through
 * active → done with timing + output. Frontend polls and renders a live trail.
 */
export async function startSession(input: StartSessionInput): Promise<IReasoningSession> {
  const steps: IReasoningStep[] = input.plannedSteps.map((s) => ({
    id: crypto.randomBytes(6).toString('hex'),
    label: s.label,
    detail: s.detail || '',
    evidence: s.evidence || [],
    status: 'pending' as StepStatus,
    startedAt: null,
    completedAt: null,
    output: '',
    durationMs: 0,
  }));

  const session = await ReasoningSession.create({
    operation: input.operation,
    companyId: input.companyId ? new mongoose.Types.ObjectId(input.companyId.toString()) : null,
    leadId: input.leadId ? new mongoose.Types.ObjectId(input.leadId.toString()) : null,
    docKind: input.docKind || '',
    status: 'active',
    steps,
    result: {},
  });

  return session;
}

/**
 * Convenience: run a single step. Marks it active, runs the work, records output
 * + duration, and marks it done (or error). Also marks prior pending steps as
 * active → done if they haven't been explicitly tracked yet (simple "advance"
 * behaviour).
 */
export async function runStep<T>(
  sessionId: mongoose.Types.ObjectId | string,
  stepLabel: string,
  work: () => Promise<{ output?: string; result?: T } | T>
): Promise<T> {
  const started = Date.now();
  await ReasoningSession.updateOne(
    { _id: sessionId, 'steps.label': stepLabel },
    { $set: { 'steps.$.status': 'active', 'steps.$.startedAt': new Date() } }
  );

  try {
    const raw = await work();
    const hasOutputField = typeof raw === 'object' && raw !== null && 'output' in raw;
    const output = hasOutputField ? (raw as any).output : undefined;
    const result = (hasOutputField && 'result' in (raw as any) ? (raw as any).result : raw) as T;

    await ReasoningSession.updateOne(
      { _id: sessionId, 'steps.label': stepLabel },
      {
        $set: {
          'steps.$.status': 'done',
          'steps.$.completedAt': new Date(),
          'steps.$.output': output || '',
          'steps.$.durationMs': Date.now() - started,
        },
      }
    );

    return result;
  } catch (err: any) {
    await ReasoningSession.updateOne(
      { _id: sessionId, 'steps.label': stepLabel },
      {
        $set: {
          'steps.$.status': 'error',
          'steps.$.completedAt': new Date(),
          'steps.$.output': err?.message || 'unknown error',
          'steps.$.durationMs': Date.now() - started,
        },
      }
    );
    throw err;
  }
}

export async function updateStep(
  sessionId: mongoose.Types.ObjectId | string,
  stepLabel: string,
  patch: Partial<{ status: StepStatus; output: string; detail: string; evidence: string[] }>
): Promise<void> {
  const update: any = {};
  if (patch.status !== undefined) update['steps.$.status'] = patch.status;
  if (patch.output !== undefined) update['steps.$.output'] = patch.output;
  if (patch.detail !== undefined) update['steps.$.detail'] = patch.detail;
  if (patch.evidence !== undefined) update['steps.$.evidence'] = patch.evidence;

  if (patch.status === 'active') update['steps.$.startedAt'] = new Date();
  if (patch.status === 'done' || patch.status === 'error' || patch.status === 'skipped') {
    update['steps.$.completedAt'] = new Date();
  }

  await ReasoningSession.updateOne(
    { _id: sessionId, 'steps.label': stepLabel },
    { $set: update }
  );
}

export async function completeSession(
  sessionId: mongoose.Types.ObjectId | string,
  result: Record<string, any> = {}
): Promise<void> {
  await ReasoningSession.updateOne(
    { _id: sessionId },
    { $set: { status: 'done', completedAt: new Date(), result } }
  );
}

/**
 * Translates raw error text (Mongoose VersionError, Claude API errors, etc.)
 * into founder-facing copy. The original message is still logged server-side
 * for debugging — but the UI only sees the human version.
 */
export function humaniseError(raw: string): string {
  const text = (raw || '').toLowerCase();

  if (text.includes('no matching document found') || text.includes('versionerror')) {
    return 'We hit a timing glitch — two things tried to update your profile at the same time. Retry usually works.';
  }
  // Timeout FIRST — our own timeout error text includes the word "Claude",
  // which would otherwise fall into the generic AI-unavailable branch below.
  if (text.includes('timed out') || text.includes('timeout') || text.includes('etimedout')) {
    return 'The AI took too long to respond — this sometimes happens during peak hours. Retry usually works.';
  }
  if (text.includes('rate limit') || text.includes('429')) {
    return 'We hit an AI rate limit. Wait 30 seconds and retry.';
  }
  if (text.includes('anthropic') || text.includes('api key')) {
    return 'The AI service is unavailable right now. Give it a minute and retry, or contact support if it keeps happening.';
  }
  if (text.includes('cast to objectid') || text.includes('invalid id')) {
    return 'Something went wrong loading your data. Refresh the page.';
  }
  if (text.includes('no parsable leads') || text.includes('empty lead array')) {
    return 'The AI returned an unexpected format. Retry — the output varies each time.';
  }
  if (text.includes('mongoose') || text.includes('mongo') || text.includes('econnrefused')) {
    return 'Could not reach our database. Our systems team has been pinged.';
  }

  // Short raw messages are OK; long stack-trace-y ones get a generic.
  if (raw && raw.length < 200 && !raw.includes('{') && !raw.includes('at ')) {
    return raw;
  }
  return 'Something unexpected stopped the reasoning. Retry usually works.';
}

export async function errorSession(
  sessionId: mongoose.Types.ObjectId | string,
  errorMessage: string
): Promise<void> {
  const friendly = humaniseError(errorMessage);
  if (friendly !== errorMessage) {
    console.error('[reasoning] raw error:', errorMessage);
  }
  await ReasoningSession.updateOne(
    { _id: sessionId },
    { $set: { status: 'error', completedAt: new Date(), errorMessage: friendly } }
  );

  // Mark any step that was mid-flight when the session died as errored too,
  // so its running timer stops on the UI. Uses the arrayFilters form since
  // multiple steps could in theory be active (e.g. parallel phases).
  await ReasoningSession.updateOne(
    { _id: sessionId },
    {
      $set: {
        'steps.$[active].status': 'error',
        'steps.$[active].completedAt': new Date(),
        'steps.$[active].output': friendly,
      },
    },
    { arrayFilters: [{ 'active.status': 'active' }] }
  );
}

export async function getSession(
  sessionId: mongoose.Types.ObjectId | string
): Promise<IReasoningSession | null> {
  return ReasoningSession.findById(sessionId);
}
