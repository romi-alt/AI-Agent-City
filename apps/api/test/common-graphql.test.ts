import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSchema, parse, specifiedRules, validate } from 'graphql';
import { formatGraphqlError, queryLimitsRule } from '../src/common/graphql.ts';

const schema = buildSchema(`
  type Contact { id: ID!, name: String, owner: Contact, notes: [Note!]! }
  type Note { id: ID!, body: String, contact: Contact }
  type Query { contacts: [Contact!]!, contact(id: ID!): Contact }
`);

const check = (query: string, limits: { maxDepth?: number; maxFields?: number }) =>
  validate(schema, parse(query), [...specifiedRules, queryLimitsRule(limits)]).map(e => e.message);

describe('queryLimitsRule', () => {
  it('allows queries within the limits', () => {
    assert.deepEqual(check('{ contacts { id name notes { id body } } }', { maxDepth: 3, maxFields: 10 }), []);
  });

  it('refuses queries nested too deeply, including through fragments', () => {
    assert.match(check('{ contacts { owner { owner { owner { id } } } } }', { maxDepth: 3 })[0]!, /nested too deeply/);
    const viaFragments = `
      query { contacts { ...A } }
      fragment A on Contact { owner { ...B } }
      fragment B on Contact { owner { owner { id } } }`;
    assert.match(check(viaFragments, { maxDepth: 3 })[0]!, /nested too deeply/);
  });

  it('counts aliases and repeated fragment spreads toward the field limit', () => {
    const aliases = Array.from({ length: 30 }, (_, i) => `a${i}: contacts { id }`).join(' ');
    assert.match(check(`{ ${aliases} }`, { maxFields: 50 })[0]!, /too many fields/);
    const spreads = Array.from({ length: 10 }, () => '...F').join(' ');
    assert.match(
      check(`{ contacts { ${spreads} } } fragment F on Contact { id name notes { id body } }`, { maxFields: 20 })[0]!,
      /too many fields/,
    );
  });

  it('does not loop on fragment cycles (graphql reports them itself)', () => {
    const errors = check('{ contacts { ...A } } fragment A on Contact { owner { ...A } }', { maxDepth: 5 });
    assert.ok(errors.some(m => /Cannot spread fragment "A" within itself/.test(m)));
  });
});

describe('formatGraphqlError', () => {
  it('keeps our codes, request id and details', () => {
    const out = formatGraphqlError({
      message: 'Changed.',
      path: ['updateContact'],
      extensions: {
        code: 'stale_revision',
        requestId: 'r1',
        status: 409,
        details: { currentVersion: '4' },
        stacktrace: ['x'],
      },
    });
    assert.deepEqual(out, {
      message: 'Changed.',
      path: ['updateContact'],
      extensions: { code: 'stale_revision', requestId: 'r1', status: 409, details: { currentVersion: '4' } },
    });
  });

  it('translates Apollo request errors and hides everything else', () => {
    assert.equal(
      formatGraphqlError({ message: 'Syntax Error', extensions: { code: 'GRAPHQL_PARSE_FAILED' } }).extensions?.code,
      'bad_request',
    );
    const hidden = formatGraphqlError({
      message: 'relation "app.contact" does not exist',
      extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['at db.ts'] },
    });
    assert.equal(hidden.extensions?.code, 'internal_error');
    assert.ok(!JSON.stringify(hidden).includes('app.contact'));
    assert.ok(!JSON.stringify(hidden).includes('stacktrace'));
  });
});
