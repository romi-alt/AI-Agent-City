import { createHash } from 'node:crypto';
import { deterministicId } from '@agentcity/domain';
import {
  type ImportMapping,
  type LegacyAuth,
  LegacyApproval,
  LegacyBuilding,
  LegacyContent,
  LegacyLead,
  LegacyMessage,
  type LegacyState,
} from './schema.js';

/** The physical catalog, read from the database (catalog.*) so the import matches the seeded map exactly. */
export interface CatalogView {
  /** `${legacyBuildingId}|${level}` → floor */
  floors: Map<string, { id: string; rentable: boolean }>;
  buildings: Map<string, { kind: string; levels: number[] }>;
  /** legacy desk id (e.g. honda-L12-0) → desk */
  desks: Map<
    string,
    { id: string; kind: 'ai' | 'human'; floorKey: string; slot: number; name: string; templateVersionId: string | null }
  >;
  /** `${taskSet}|${role}|${categories.join('|')}` → template version id */
  templates: Map<string, string>;
}

export type Row = Record<string, unknown>;
export const TABLES = [
  'app.agency',
  'app.tenant',
  'app.workspace',
  'app.workspace_placement',
  'app.invitation',
  'app.agent_installation',
  'app.contact',
  'app.opportunity',
  'app.opportunity_stage_event',
  'app.note',
  'app.message_evidence',
  'app.draft_revision',
  'app.approval',
  'app.content_item',
  'app.schedule',
] as const;
export type Table = (typeof TABLES)[number];

export interface RecordMapEntry {
  legacyKind: string;
  legacyId: string;
  targetTable: Table;
  tenantId: string;
  targetId: string;
  recordSha256: string;
}
export interface QuarantineEntry {
  legacyKind: string;
  legacyId: string;
  reason: string;
  record: unknown;
  recordSha256: string;
}
export interface Counts {
  input: number;
  imported: number;
  quarantined: number;
  skipped: number;
}
export interface Plan {
  rows: Record<Table, Row[]>;
  recordMap: RecordMapEntry[];
  quarantine: QuarantineEntry[];
  report: {
    asOf: string;
    counts: Record<string, Counts>;
    quarantineReasons: Record<string, number>;
    skippedReasons: Record<string, number>;
    duplicates: { kind: string; detail: string }[];
    dangling: { kind: string; id: string; refers: string }[];
    rentalOccupants: { building: string; level: number; mappedTo: string | null }[];
    notImportedByDesign: Record<string, number>;
    safety: {
      approvalsExpired: number;
      schedulesDisabled: number;
      schedulesEnabled: number;
      dispatchFacts: 0;
      moneyFacts: 0;
      consentFacts: 0;
    };
    plannedRows: Record<string, number>;
  };
}

export class MappingError extends Error {
  constructor(readonly problems: string[]) {
    super(`The import mapping is not usable:\n- ${problems.join('\n- ')}`);
  }
}

/** Key-order-independent JSON, so the same record always hashes the same. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .filter(k => (v as Record<string, unknown>)[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const recordSha = (r: unknown) => sha256(stableJson(r));

/** Legacy times are minutes since 00:00 UTC on the state's startDate (the simulator clock). */
export const legacyTime = (startDate: string, minutes: number) =>
  new Date(Date.parse(`${startDate}T00:00:00Z`) + Math.round(minutes * 60_000)).toISOString();

/** Credentials and session material are never imported; quarantined user records keep only these fields. */
const safeUser = (u: LegacyAuth['users'][number]) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  clientId: u.clientId,
});

export function buildPlan(state: LegacyState, auth: LegacyAuth, mapping: ImportMapping, catalog: CatalogView): Plan {
  const asOf = legacyTime(state.startDate, state.now);
  const at = (t: number) => legacyTime(state.startDate, t);
  const rows = Object.fromEntries(TABLES.map(t => [t, [] as Row[]])) as Record<Table, Row[]>;
  const recordMap: RecordMapEntry[] = [];
  const quarantine: QuarantineEntry[] = [];
  const counts: Record<string, Counts> = {};
  const quarantineReasons: Record<string, number> = {};
  const skippedReasons: Record<string, number> = {};
  const report: Plan['report'] = {
    asOf,
    counts,
    quarantineReasons,
    skippedReasons,
    duplicates: [],
    dangling: [],
    rentalOccupants: [],
    notImportedByDesign: {},
    safety: {
      approvalsExpired: 0,
      schedulesDisabled: 0,
      schedulesEnabled: 0,
      dispatchFacts: 0,
      moneyFacts: 0,
      consentFacts: 0,
    },
    plannedRows: {},
  };
  const count = (kind: string) => (counts[kind] ??= { input: 0, imported: 0, quarantined: 0, skipped: 0 });
  const quarantined = (kind: string, id: string, reason: string, record: unknown) => {
    quarantine.push({ legacyKind: kind, legacyId: id, reason, record, recordSha256: recordSha(record) });
    quarantineReasons[`${kind}: ${reason}`] = (quarantineReasons[`${kind}: ${reason}`] ?? 0) + 1;
    count(kind).quarantined++;
  };
  const skipped = (kind: string, reason: string, n = 1) => {
    skippedReasons[`${kind}: ${reason}`] = (skippedReasons[`${kind}: ${reason}`] ?? 0) + n;
    count(kind).skipped += n;
  };
  const add = (table: Table, row: Row, map?: { kind: string; id: string; record: unknown }) => {
    rows[table].push(row);
    if (map) {
      recordMap.push({
        legacyKind: map.kind,
        legacyId: map.id,
        targetTable: table,
        tenantId: (row.tenant_id ?? row.id) as string,
        targetId: row.id as string,
        recordSha256: recordSha(map.record),
      });
    }
  };

  // ── 1. Mapping: tenants, workspaces, placements ────────────────────────────────────────
  const problems: string[] = [];
  const agencyId = deterministicId('agency', mapping.agency.key);
  const tenantIds = new Map<string, string>();
  const tenantKind = new Map<string, string>();
  const wsIds = new Map<string, string>(); // `${tenant}/${ws}` → id
  const placedFloor = new Map<string, { tenant: string; ws: string }>(); // floorKey → owner
  const demoKey = mapping.demoTenant.key;
  const demoTenant = deterministicId('tenant', demoKey);
  const demoWs = deterministicId('workspace', demoKey, 'demo');
  add(
    'app.agency',
    { id: agencyId, name: mapping.agency.name, created_at: asOf },
    { kind: 'mapping', id: `agency:${mapping.agency.key}`, record: mapping.agency },
  );
  add(
    'app.tenant',
    { id: demoTenant, agency_id: agencyId, name: mapping.demoTenant.name, kind: 'demo', created_at: asOf },
    { kind: 'mapping', id: `tenant:${demoKey}`, record: mapping.demoTenant },
  );
  add(
    'app.workspace',
    { tenant_id: demoTenant, id: demoWs, name: 'Legacy simulated city', kind: 'demo', created_at: asOf },
    { kind: 'mapping', id: `workspace:${demoKey}/demo`, record: mapping.demoTenant },
  );

  const clientOwner = new Map<string, string>();
  for (const t of mapping.tenants) {
    if (t.key === demoKey || tenantIds.has(t.key)) problems.push(`tenant key "${t.key}" is used twice`);
    const tid = deterministicId('tenant', t.key);
    tenantIds.set(t.key, tid);
    tenantKind.set(t.key, t.kind);
    add(
      'app.tenant',
      { id: tid, agency_id: agencyId, name: t.name, kind: t.kind, created_at: asOf },
      { kind: 'mapping', id: `tenant:${t.key}`, record: { ...t, workspaces: undefined } },
    );
    for (const c of t.legacyClientIds) {
      if (clientOwner.has(c)) problems.push(`legacy client "${c}" is mapped to two tenants`);
      clientOwner.set(c, t.key);
    }
    for (const w of t.workspaces) {
      const wk = `${t.key}/${w.key}`;
      if (wsIds.has(wk)) problems.push(`workspace "${wk}" is defined twice`);
      const wid = deterministicId('workspace', t.key, w.key);
      wsIds.set(wk, wid);
      const floorKeys: string[] = [];
      for (const b of w.buildings) {
        const bv = catalog.buildings.get(b);
        if (!bv) problems.push(`workspace "${wk}": unknown building "${b}"`);
        else floorKeys.push(...bv.levels.map(l => `${b}|${l}`));
      }
      for (const fl of w.floors) {
        const fk = `${fl.building}|${fl.level}`;
        if (!catalog.floors.has(fk)) problems.push(`workspace "${wk}": unknown floor ${fl.building} L${fl.level}`);
        else floorKeys.push(fk);
      }
      if (!floorKeys.length) problems.push(`workspace "${wk}" is not placed on any floor`);
      const allRental = floorKeys.length > 0 && floorKeys.every(fk => catalog.floors.get(fk)?.rentable);
      add(
        'app.workspace',
        {
          tenant_id: tid,
          id: wid,
          name: w.name,
          kind: allRental ? 'rental-floor' : w.buildings.length ? 'building' : 'team',
          created_at: asOf,
        },
        { kind: 'mapping', id: `workspace:${wk}`, record: w },
      );
      for (const fk of floorKeys) {
        const prev = placedFloor.get(fk);
        if (prev) {
          problems.push(`floor ${fk.replace('|', ' L')} is placed for both "${prev.tenant}/${prev.ws}" and "${wk}"`);
          continue;
        }
        placedFloor.set(fk, { tenant: t.key, ws: w.key });
        const [b, lvl] = fk.split('|') as [string, string];
        const legacyFloor = findFloor(state, b, Number(lvl));
        const since = legacyFloor?.tenant?.since;
        add('app.workspace_placement', {
          tenant_id: tid,
          workspace_id: wid,
          id: deterministicId('placement', fk),
          floor_id: catalog.floors.get(fk)!.id,
          started_at: since !== undefined ? at(since) : asOf,
        });
      }
    }
  }

  const ws = (tenant: string, w: string) => wsIds.get(`${tenant}/${w}`);
  const owners = new Map<string, { tenant: string; ws: string }>(); // lead id → owner
  const buildingOwners = new Map<string, { tenant: string; ws: string }>();
  for (const r of mapping.contactOwnership) {
    if (!tenantIds.has(r.tenant) || !ws(r.tenant, r.workspace)) {
      problems.push(`contact rule for "${r.tenant}/${r.workspace}": no such tenant/workspace`);
      continue;
    }
    if (!!r.legacyLeadIds === !!r.legacyBuilding) {
      problems.push(`contact rule for "${r.tenant}/${r.workspace}" must name either legacyLeadIds or legacyBuilding`);
      continue;
    }
    for (const id of r.legacyLeadIds ?? []) {
      if (owners.has(id)) problems.push(`lead "${id}" is assigned twice`);
      owners.set(id, { tenant: r.tenant, ws: r.workspace });
    }
    if (r.legacyBuilding) {
      const b = catalog.buildings.get(r.legacyBuilding);
      if (!b) {
        problems.push(`contact rule: unknown building "${r.legacyBuilding}"`);
        continue;
      }
      // A building-wide rule is only acceptable when that tenant is the building's only occupant. Shared
      // buildings (e.g. rental floors held by different clients) need lead-by-lead mapping.
      const occupants = new Set(
        b.levels
          .map(l => placedFloor.get(`${r.legacyBuilding}|${l}`))
          .filter(Boolean)
          .map(o => `${o!.tenant}`),
      );
      if (occupants.size !== 1 || !occupants.has(r.tenant)) {
        problems.push(
          `contact rule for building "${r.legacyBuilding}": a building-wide rule needs "${r.tenant}" to be its only occupant (occupants: ${[...occupants].join(', ') || 'none'}); map these leads by id`,
        );
        continue;
      }
      if (buildingOwners.has(r.legacyBuilding)) problems.push(`building "${r.legacyBuilding}" has two contact rules`);
      buildingOwners.set(r.legacyBuilding, { tenant: r.tenant, ws: r.workspace });
    }
  }
  const userRules = new Map<string, ImportMapping['users'][number]>();
  for (const u of mapping.users) {
    if (userRules.has(u.legacyUserId)) problems.push(`legacy user "${u.legacyUserId}" is mapped twice`);
    if (!tenantIds.has(u.tenant)) problems.push(`user "${u.legacyUserId}": unknown tenant "${u.tenant}"`);
    if (u.workspace && !ws(u.tenant, u.workspace))
      problems.push(`user "${u.legacyUserId}": unknown workspace "${u.tenant}/${u.workspace}"`);
    if (u.role.startsWith('agency-') && tenantKind.get(u.tenant) !== 'agency')
      problems.push(`user "${u.legacyUserId}": agency roles belong to the agency's own tenant`);
    userRules.set(u.legacyUserId, u);
  }
  if (problems.length) throw new MappingError(problems);

  // ── 2. Buildings, rental occupants and installed agents ───────────────────────────────
  const legacyBuildings = new Map<string, LegacyBuilding>();
  for (const [i, raw] of state.buildings.entries()) {
    count('building').input++;
    const p = LegacyBuilding.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? `#${i}`;
    if (!p.success) {
      quarantined('building', id, `invalid record: ${p.error.issues[0]?.message}`, raw);
      continue;
    }
    if (!catalog.buildings.has(p.data.id)) {
      quarantined('building', id, 'building is not in the catalog', raw);
      continue;
    }
    legacyBuildings.set(p.data.id, p.data);
    skipped('building', 'the physical map comes from the catalog seed');
    for (const f of p.data.floors) {
      if (!f.tenant) continue;
      count('rental-occupant').input++;
      const owner = placedFloor.get(`${p.data.id}|${f.level}`);
      report.rentalOccupants.push({ building: p.data.id, level: f.level, mappedTo: owner?.tenant ?? null });
      // Rental contact fields are not a tenancy: they are only kept for review.
      if (owner) skipped('rental-occupant', 'floor is placed by the mapping; occupant contact fields are not imported');
      else quarantined('rental-occupant', `${p.data.id}|${f.level}`, 'rented floor without a mapped tenant', f.tenant);
    }
  }
  for (const t of mapping.tenants) {
    for (const w of t.workspaces) {
      if (!w.installAgents) continue;
      const tid = tenantIds.get(t.key)!;
      const wid = ws(t.key, w.key)!;
      for (const [fk, owner] of placedFloor) {
        if (owner.tenant !== t.key || owner.ws !== w.key) continue;
        const [b, lvl] = fk.split('|') as [string, string];
        const floor = catalog.floors.get(fk)!;
        const legacyFloor = legacyBuildings.get(b)?.floors.find(x => x.level === Number(lvl));
        for (const a of legacyFloor?.agents ?? []) {
          count('agent').input++;
          if (a.kind === 'human') {
            skipped('agent', 'human desk: people are never installed as agents');
            continue;
          }
          const desk = catalog.desks.get(a.id);
          const template =
            desk?.templateVersionId ?? catalog.templates.get(`${a.taskSet}|${a.role}|${a.categories.join('|')}`);
          if (!template) {
            quarantined('agent', a.id, 'no matching agent template in the catalog', a);
            continue;
          }
          add(
            'app.agent_installation',
            {
              tenant_id: tid,
              workspace_id: wid,
              id: deterministicId('installation', t.key, a.id),
              template_version_id: template,
              floor_id: floor.id,
              slot: desk?.slot ?? legacyFloor!.agents.indexOf(a),
              desk_id: desk?.id ?? null,
              display_name: a.name,
              installed_at: asOf,
              provenance: { source: 'legacy-v2', legacyId: a.id },
            },
            { kind: 'agent', id: a.id, record: a },
          );
          count('agent').imported++;
        }
      }
    }
  }

  // ── 3. Contacts (leads) ───────────────────────────────────────────────────────────────
  type Placed = { tenantKey: string; tenantId: string; wsId: string; contactId: string; real: boolean };
  const leadTarget = new Map<string, Placed | 'quarantined'>();
  const seenLead = new Set<string>();
  const emailsByTenant = new Map<string, Map<string, string>>();
  for (const [i, raw] of state.leads.entries()) {
    count('lead').input++;
    const p = LegacyLead.safeParse(raw);
    const rid = (raw as { id?: string })?.id ?? `#${i}`;
    if (!p.success) {
      quarantined(
        'lead',
        rid,
        `invalid record: ${p.error.issues[0]?.path.join('.')} ${p.error.issues[0]?.message}`,
        raw,
      );
      continue;
    }
    const l = p.data;
    if (seenLead.has(l.id)) {
      report.duplicates.push({ kind: 'lead', detail: `id ${l.id} appears more than once` });
      quarantined('lead', `${l.id}#dup${i}`, 'duplicate legacy id', raw);
      continue;
    }
    seenLead.add(l.id);
    if (!catalog.buildings.has(l.buildingId)) {
      report.dangling.push({ kind: 'lead', id: l.id, refers: `building ${l.buildingId}` });
      quarantined('lead', l.id, 'unknown building', raw);
      leadTarget.set(l.id, 'quarantined');
      continue;
    }
    let target: Placed;
    if (!l.real) {
      target = { tenantKey: demoKey, tenantId: demoTenant, wsId: demoWs, contactId: '', real: false };
    } else {
      const owner = owners.get(l.id) ?? buildingOwners.get(l.buildingId);
      if (!owner) {
        const shared = catalog.buildings.get(l.buildingId)!.kind === 'rental';
        quarantined(
          'lead',
          l.id,
          shared
            ? 'real contact on a shared rental building: ownership must be mapped lead by lead'
            : 'real contact without a verified ownership mapping',
          raw,
        );
        leadTarget.set(l.id, 'quarantined');
        continue;
      }
      target = {
        tenantKey: owner.tenant,
        tenantId: tenantIds.get(owner.tenant)!,
        wsId: ws(owner.tenant, owner.ws)!,
        contactId: '',
        real: true,
      };
    }
    target.contactId = deterministicId('contact', target.tenantKey, l.id);
    leadTarget.set(l.id, target);
    const email = l.email?.trim().toLowerCase();
    if (email) {
      const seen = (emailsByTenant.get(target.tenantId) ??
        emailsByTenant.set(target.tenantId, new Map()).get(target.tenantId))!;
      if (seen.has(email))
        report.duplicates.push({
          kind: 'contact-email',
          detail: `${seen.get(email)} and ${l.id} share an email in tenant ${target.tenantKey} (both kept for review)`,
        });
      else seen.set(email, l.id);
    }
    const prov = {
      source: 'legacy-v2',
      legacyId: l.id,
      legacyBuilding: l.buildingId,
      legacyFloor: l.floor ?? null,
      legacyReal: l.real,
    };
    add(
      'app.contact',
      {
        tenant_id: target.tenantId,
        workspace_id: target.wsId,
        id: target.contactId,
        display_name: l.name,
        email: l.email ?? null,
        phone: l.phone ?? null,
        kind: l.kind,
        source: l.source,
        interest: l.interest,
        created_at: at(l.createdAt),
        provenance: prov,
      },
      { kind: 'lead', id: l.id, record: raw },
    );
    const oppId = deterministicId('opportunity', target.tenantKey, l.id);
    // Stage only: no value is carried over, because legacy revenue was simulated (audit C02/C03).
    add('app.opportunity', {
      tenant_id: target.tenantId,
      workspace_id: target.wsId,
      id: oppId,
      contact_id: target.contactId,
      stage: l.stage,
      value_cents: null,
      value_source: null,
      created_at: at(l.createdAt),
      updated_at: at(l.stageAt),
      provenance: prov,
    });
    l.history.forEach((h, n) => {
      const hid = `${l.id}#${n}`;
      if (h.channel === 'stage') {
        add('app.opportunity_stage_event', {
          tenant_id: target.tenantId,
          workspace_id: target.wsId,
          id: deterministicId('stage-event', target.tenantKey, hid),
          opportunity_id: oppId,
          stage: h.text.match(/^Stage → (.+)$/)?.[1] ?? h.text,
          actor: h.agent ?? 'legacy',
          occurred_at: at(h.t),
          provenance: { source: 'legacy-v2', legacyId: hid, text: h.text },
        });
      } else if (h.channel === 'note' || h.channel === undefined) {
        add('app.note', {
          tenant_id: target.tenantId,
          workspace_id: target.wsId,
          id: deterministicId('note', target.tenantKey, hid),
          contact_id: target.contactId,
          body: h.text,
          created_by: h.agent ?? 'legacy',
          created_at: at(h.t),
          provenance: { source: 'legacy-v2', legacyId: hid },
        });
      }
      // Message events (email/phone/text/social) are covered by the messages list.
    });
    count('lead').imported++;
  }

  // ── 4. Messages: history evidence only, never dispatch facts ─────────────────────────
  const messageTarget = new Map<string, { placed: Placed; contactId: string | null } | 'quarantined'>();
  const seenMsg = new Set<string>();
  for (const [i, raw] of state.messages.entries()) {
    count('message').input++;
    const p = LegacyMessage.safeParse(raw);
    const rid = (raw as { id?: string })?.id ?? `#${i}`;
    if (!p.success) {
      quarantined('message', rid, `invalid record: ${p.error.issues[0]?.message}`, raw);
      continue;
    }
    const m = p.data;
    if (seenMsg.has(m.id)) {
      report.duplicates.push({ kind: 'message', detail: `id ${m.id} appears more than once` });
      quarantined('message', `${m.id}#dup${i}`, 'duplicate legacy id', raw);
      continue;
    }
    seenMsg.add(m.id);
    const lt = m.leadId ? leadTarget.get(m.leadId) : undefined;
    if (m.leadId && lt === undefined) report.dangling.push({ kind: 'message', id: m.id, refers: `lead ${m.leadId}` });
    let placed: Placed;
    let contactId: string | null = null;
    if (lt === 'quarantined') {
      quarantined('message', m.id, 'its contact is quarantined', raw);
      messageTarget.set(m.id, 'quarantined');
      continue;
    } else if (lt) {
      if (lt.real !== m.real) {
        quarantined(
          'message',
          m.id,
          m.real ? 'real message to a simulated contact' : 'simulator activity on a real contact',
          raw,
        );
        messageTarget.set(m.id, 'quarantined');
        continue;
      }
      placed = lt;
      contactId = lt.contactId;
    } else if (!m.real) {
      placed = { tenantKey: demoKey, tenantId: demoTenant, wsId: demoWs, contactId: '', real: false };
    } else {
      quarantined(
        'message',
        m.id,
        m.leadId ? 'real message whose contact is missing' : 'real message without a contact',
        raw,
      );
      messageTarget.set(m.id, 'quarantined');
      continue;
    }
    add(
      'app.message_evidence',
      {
        tenant_id: placed.tenantId,
        workspace_id: placed.wsId,
        id: deterministicId('message', placed.tenantKey, m.id),
        contact_id: contactId,
        channel: m.channel,
        recipient: m.to,
        subject: m.subject ?? null,
        body: m.body,
        legacy_status: m.status,
        verification: placed.real ? 'legacy-unverified' : 'simulated',
        occurred_at: at(m.t),
        provenance: { source: 'legacy-v2', legacyId: m.id, by: m.by, agentName: m.agentName },
      },
      { kind: 'message', id: m.id, record: raw },
    );
    messageTarget.set(m.id, { placed, contactId });
    count('message').imported++;
  }

  // ── 5. Approvals: all expire; nothing pending survives the migration ─────────────────
  const contentIds = new Set((state.content as { id?: string }[]).map(c => c?.id));
  for (const [i, raw] of state.approvals.entries()) {
    count('approval').input++;
    const p = LegacyApproval.safeParse(raw);
    const rid = (raw as { id?: string })?.id ?? `#${i}`;
    if (!p.success) {
      quarantined('approval', rid, `invalid record: ${p.error.issues[0]?.message}`, raw);
      continue;
    }
    const a = p.data;
    if (a.kind === 'task') {
      skipped('approval', 'agent task approval: expired, nothing to keep');
      report.safety.approvalsExpired++;
      continue;
    }
    let placed: Placed | undefined;
    let contactId: string | null = null;
    let channel: string;
    let recipient: string | null = null;
    let subject: string | null = null;
    let body = [a.text, a.detail].filter(Boolean).join('\n\n');
    if (a.kind === 'message' || a.kind === 'call') {
      // Both point at the drafted message (legacy Sim: phone → 'call', other channels → 'message').
      const mt = a.refId ? messageTarget.get(a.refId) : undefined;
      const msg = (state.messages as { id?: string }[]).find(m => m?.id === a.refId) as LegacyMessage | undefined;
      if (!mt || mt === 'quarantined' || !msg) {
        if (!mt) report.dangling.push({ kind: 'approval', id: a.id, refers: `message ${a.refId}` });
        quarantined(
          'approval',
          a.id,
          mt === 'quarantined' ? 'its message is quarantined' : 'its message is missing',
          raw,
        );
        continue;
      }
      placed = mt.placed;
      contactId = mt.contactId;
      channel = msg.channel;
      recipient = msg.to;
      subject = msg.subject ?? null;
      body = msg.body;
    } else {
      // Posts, replies and ads came from the simulated social desk.
      if (a.kind === 'post' && a.refId && !contentIds.has(a.refId))
        report.dangling.push({ kind: 'approval', id: a.id, refers: `content ${a.refId}` });
      placed = { tenantKey: demoKey, tenantId: demoTenant, wsId: demoWs, contactId: '', real: false };
      channel = 'social';
    }
    const draftId = deterministicId('draft', placed.tenantKey, a.id);
    add('app.draft_revision', {
      tenant_id: placed.tenantId,
      workspace_id: placed.wsId,
      id: draftId,
      contact_id: contactId,
      channel,
      recipient,
      subject,
      body,
      body_sha256: '',
      created_by: 'legacy-import',
      created_at: at(a.t),
      provenance: { source: 'legacy-v2', legacyId: a.id, kind: a.kind, agentId: a.agentId },
    });
    add(
      'app.approval',
      {
        tenant_id: placed.tenantId,
        workspace_id: placed.wsId,
        id: deterministicId('approval', placed.tenantKey, a.id),
        draft_revision_id: draftId,
        status: 'expired',
        requested_at: at(a.t),
        expires_at: asOf,
        decided_by: 'legacy-import',
        decided_at: asOf,
        reason: 'Pending legacy approval expired during migration. Create a fresh draft and review it.',
        provenance: { source: 'legacy-v2', legacyId: a.id },
      },
      { kind: 'approval', id: a.id, record: raw },
    );
    report.safety.approvalsExpired++;
    count('approval').imported++;
  }

  // ── 6. Content: simulated, so demo only; schedules stay off ──────────────────────────
  const CONTENT_STATUS: Record<LegacyContent['status'], string> = {
    idea: 'idea',
    draft: 'draft',
    'asset-ready': 'draft',
    'needs-approval': 'draft', // its approval expired
    scheduled: 'draft',
    published: 'legacy-simulated', // no provider identity (audit C12)
    rejected: 'rejected',
  };
  for (const [i, raw] of state.content.entries()) {
    count('content').input++;
    const p = LegacyContent.safeParse(raw);
    const rid = (raw as { id?: string })?.id ?? `#${i}`;
    if (!p.success) {
      quarantined('content', rid, `invalid record: ${p.error.issues[0]?.message}`, raw);
      continue;
    }
    const c = p.data;
    const cid = deterministicId('content', demoKey, c.id);
    add(
      'app.content_item',
      {
        tenant_id: demoTenant,
        workspace_id: demoWs,
        id: cid,
        platform: c.platform,
        format: c.format,
        topic: c.topic,
        caption: c.caption ?? null,
        status: CONTENT_STATUS[c.status],
        created_at: asOf,
        provenance: {
          source: 'legacy-v2',
          legacyId: c.id,
          legacyStatus: c.status,
          legacyBuilding: c.buildingId,
          metricsDropped: true,
        },
      },
      { kind: 'content', id: c.id, record: raw },
    );
    if (c.status === 'scheduled') {
      add('app.schedule', {
        tenant_id: demoTenant,
        workspace_id: demoWs,
        id: deterministicId('schedule', demoKey, c.id),
        target_kind: 'content',
        target_id: cid,
        run_at: legacyTime(state.startDate, c.day * 1440 + timeOfDay(c.time)),
        recurrence: null,
        enabled: false,
        disabled_reason: 'Legacy schedule: off until reviewed after migration.',
        created_at: asOf,
        provenance: { source: 'legacy-v2', legacyId: c.id },
      });
      report.safety.schedulesDisabled++;
    }
    count('content').imported++;
  }

  // ── 7. Simulated or derived collections ──────────────────────────────────────────────
  count('revenue');
  for (const [i, r] of state.revenue.entries()) {
    count('revenue').input++;
    quarantined('revenue', `#${i}`, 'simulated revenue is not a payment or invoice fact', r);
  }
  const skipAll = (kind: string, list: unknown[], reason: string) => {
    count(kind).input += list.length;
    if (list.length) skipped(kind, reason, list.length);
  };
  skipAll('inbox', state.inbox, 'simulated social inbox: no provider identity');
  skipAll('insight', state.insights, 'simulated strategy notes');
  skipAll('report', state.reports, 'generated summaries of simulated activity');
  skipAll('feed', state.feed, 'activity ticker, rebuilt from real events');
  skipAll('stage-log', state.stageLog, 'derived from lead history (imported per lead)');

  // ── 8. People: invitations only; no credentials, sessions or devices ─────────────────
  const credentialFields = ['passHash', 'salt', 'totpSecret', 'pendingSecret', 'recovery', 'enrollHash'] as const;
  for (const f of credentialFields) {
    report.notImportedByDesign[f] = auth.users.filter(u => {
      const v = (u as Record<string, unknown>)[f];
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '';
    }).length;
  }
  report.notImportedByDesign.sessions = auth.sessions.length;
  report.notImportedByDesign.rememberedDevices = auth.devices.length;
  report.notImportedByDesign.signInLog = auth.signins.length;
  for (const u of auth.users) {
    count('user').input++;
    const rule = userRules.get(u.id);
    if (!rule) {
      quarantined('user', u.id, 'no verified email: legacy users have none, and nothing is guessed', safeUser(u));
      continue;
    }
    const isClient = u.role === 'client-admin' || u.role === 'client-viewer';
    if (isClient && (!u.clientId || clientOwner.get(u.clientId) !== rule.tenant)) {
      quarantined('user', u.id, "mapped tenant does not match the user's legacy client", safeUser(u));
      continue;
    }
    if (isClient !== rule.role.startsWith('client-')) {
      quarantined('user', u.id, 'mapped role changes the user between agency and client', safeUser(u));
      continue;
    }
    const tid = tenantIds.get(rule.tenant)!;
    add(
      'app.invitation',
      {
        tenant_id: tid,
        id: deterministicId('invitation', rule.tenant, u.id),
        email: rule.email.toLowerCase(),
        role: rule.role,
        workspace_id: rule.workspace ? ws(rule.tenant, rule.workspace)! : null,
        status: 'pending',
        created_at: asOf,
        provenance: { source: 'legacy-v2', legacyUserId: u.id, evidence: rule.evidence },
      },
      { kind: 'user', id: u.id, record: safeUser(u) },
    );
    count('user').imported++;
  }
  for (const c of auth.clients) {
    count('client').input++;
    if (clientOwner.has(c.id)) skipped('client', 'mapped to a tenant');
    else quarantined('client', c.id, 'legacy client is not mapped to a tenant', c);
  }

  for (const [kind, c] of Object.entries(counts)) {
    if (c.input !== c.imported + c.quarantined + c.skipped)
      throw new Error(`reconciliation failed for ${kind}: ${JSON.stringify(c)}`);
  }
  for (const t of TABLES) report.plannedRows[t] = rows[t].length;
  return { rows, recordMap, quarantine, report };
}

function findFloor(state: LegacyState, building: string, level: number) {
  const b = (state.buildings as LegacyBuilding[]).find(x => x?.id === building);
  return b?.floors?.find(f => f.level === level);
}

function timeOfDay(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
