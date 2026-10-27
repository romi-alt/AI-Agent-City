# Audit execution and limits
Audited the supplied archive in a separate extracted directory. Manifest records original file SHA-256 values; source was not edited. No repository history or real persisted state was supplied.

Environment: Node 24.22.1. Attempted `npm ci --offline --ignore-scripts --no-audit --no-fund` in the audit copy; it failed with ENOTCACHED for zod 4.6.7. Consequently full dependency installation, TypeScript compilation, Vite/server build and browser end-to-end tests were not completed. No claims about a successful production build or deployed system are made.

To reproduce core/auth checks with Node 24:

```bash
node planning/agentcity-migration/scripts/prepare-audit.mjs /absolute/path/to/original-sales-city /absolute/path/to/isolated-audit-runtime
node planning/agentcity-migration/scripts/verify-original.mjs /absolute/path/to/isolated-audit-runtime
```

Keep output outside the original source directory. Preparation strips TypeScript syntax and rewrites relative module import extensions for Node; this is not type checking. The test harness uses isolated fake delivery hooks and temporary auth storage, with no network or live messages. The scripts target the original uploaded source shape. Archive these as characterization evidence when the production layout changes.

All 16 checks passed in the sense that the legacy behavior was reproduced. They cover inventory, simulated money on real contacts, post-approval mutation, in-flight draft mutation, lost reservations, duplicate draft eligibility, trimming pending messages, manual direct dispatch, cross-floor rental contact selection, failed-send accounting, fake publication, stale recipient targeting, uncollected rental revenue, accelerated time and password-reset device retention. See characterization-results.txt for the exact TAP output.

Static-only findings include unsafe label HTML interpolation, global HTTP/SSE access paths and data leakage, resource cleanup and unauthenticated pulse payloads. These were traced in source, not exploited in a browser. Live provider capability/model support and deployment status were not tested.
