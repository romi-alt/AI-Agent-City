# M06 — Migrate the actual city to R3F and drei

Read the existing repository instructions and planning/agentcity-migration/{README.md,AUDIT.md,TARGET-STACK.md,MIGRATION-MAP.md,CLAUDE-MIGRATION.md,PROPOSAL-TRACEABILITY.md,ACCEPTANCE.md}, plus MIGRATION-STATUS.md if present. Verify prerequisite stage evidence before dependent work. This is the existing AgentCity project; preserve unrelated work and useful behavior. Follow the original proposal and task documents. Implement the scoped stage, not just a plan. Keep production external effects disabled.

## Work

Port scene/city/building/office/avatar ownership to declarative R3F components with drei, preserving source layouts, palette, recognizable human/AI desks and map IDs. Extract reusable pure geometry helpers where valuable; do not wrap the existing imperative Engine in a useEffect and call migration complete.

Implement city→district→building→floor→desk navigation with permission-scoped entities, activity-driven windows, red intervention beacons per building, and lead/message/booking traffic driven by authorized domain events. The existing gold decorative beacon is not the required intervention signal. Animation reflects actual run status and stops or reduces under reduced-motion settings.

Use instancing and LOD for repeated geometry and test Draco/KTX2 loader pipeline with a small licensed fixture if current geometry is procedural. Dispose geometry/materials/textures and event subscriptions; bound caches. Provide quality tiers, optional city view, automatic degradation and independent 2D fallback. Avoid DOM HTML interpolation of agent/client names.

## Required evidence

Measure representative hundreds-of-buildings fixture performance with hardware, viewport, entity count and frame percentiles recorded; target 60fps laptop without claiming universality. Test mobile/low detail, repeated navigation memory, no-WebGL, context loss, reduced motion, authorized drilldown and beacon acknowledgment. Decorative activity must never be reported as real work.

Update MIGRATION-STATUS.md with changed files, commands actually run, outcomes, remaining blockers and the next safe stage. Do not mark unrun tests passed. End with a concise implementation summary and evidence links.
