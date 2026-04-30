import mongoose from 'mongoose';
import { FunnelEvent, FunnelStep } from '../../models/FunnelEvent';

export async function trackFunnelEvent(
  step: FunnelStep,
  companyId: mongoose.Types.ObjectId | string | null,
  metadata: Record<string, any> = {},
  repInviteId: mongoose.Types.ObjectId | string | null = null
): Promise<void> {
  try {
    await FunnelEvent.create({
      companyId: companyId ? new mongoose.Types.ObjectId(companyId.toString()) : null,
      repInviteId: repInviteId ? new mongoose.Types.ObjectId(repInviteId.toString()) : null,
      step,
      metadata,
    });
  } catch (err) {
    console.error('[funnelTracker] Failed to log event', step, err);
  }
}
