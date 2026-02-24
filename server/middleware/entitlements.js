// server/middleware/entitlements.js — Entitlement checks middleware

export function requireEntitlement(feature) {
  return async (request, reply) => {
    // Must be authenticated first
    if (!request.user?.id) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const entitlement = await request.server.entitlementService.check(request.user.id);

    if (!entitlement?.hasAccess) {
      return reply.status(402).send({
        error: 'Subscription required',
        code: 'PAYMENT_REQUIRED',
        message: 'Please subscribe to access this feature'
      });
    }

    // Feature-specific checks
    if (feature === 'items') {
      const itemCount = await request.server.entitlementService.getItemCount(request.user.id);
      if (itemCount >= entitlement.items_limit) {
        return reply.status(403).send({
          error: 'Item limit reached',
          code: 'LIMIT_REACHED',
          limit: entitlement.items_limit,
          upgrade_url: '/billing'
        });
      }
    }

    if (feature === 'outfits') {
      const todayCount = await request.server.entitlementService.getTodayOutfitCount(request.user.id);
      if (entitlement.outfits_per_day !== Infinity && todayCount >= entitlement.outfits_per_day) {
        return reply.status(403).send({
          error: 'Daily outfit limit reached',
          code: 'LIMIT_REACHED',
          limit: entitlement.outfits_per_day,
          resets_at: getNextReset(),
          upgrade_url: '/billing'
        });
      }
    }

    // Attach entitlement to request for handlers to use
    request.entitlement = entitlement;
  };
}

// Get ISO timestamp for next midnight (local time)
function getNextReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}
