import pg from 'pg';

/**
 * Proves the database really ranks with BM25 and searches vectors, in a throwaway schema inside a transaction
 * that is rolled back. Prints a JSON report and exits non-zero if any expectation fails.
 *
 * BM25 properties checked (things a plain match or ts_rank renamed "BM25" would not do):
 *  - more occurrences of the term rank higher,
 *  - a long document is penalised for its length,
 *  - documents without the term are excluded.
 */
const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL is not set');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report: Record<string, unknown> = {};
const failures: string[] = [];
try {
  const ext = await client.query<{ extname: string; extversion: string }>(
    "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_search', 'vector') ORDER BY extname",
  );
  report.extensions = Object.fromEntries(ext.rows.map(r => [r.extname, r.extversion]));
  if (ext.rows.length !== 2) failures.push('pg_search and vector must both be installed (run migrations first)');

  await client.query('BEGIN');
  await client.query('CREATE SCHEMA verify_search');
  await client.query(
    'CREATE TABLE verify_search.docs (id int PRIMARY KEY, body text NOT NULL, embedding vector(3) NOT NULL)',
  );
  await client.query(`INSERT INTO verify_search.docs VALUES
    (1, 'payment plan options for a new car', '[1,0,0]'),
    (2, 'payment payment payment reminder', '[0.9,0.1,0]'),
    (3, 'service appointment for an oil change', '[0,1,0]'),
    (4, 'a very long note about many things including one payment and lots of unrelated words to dilute it', '[0,0,1]')`);
  await client.query('CREATE INDEX docs_bm25 ON verify_search.docs USING bm25 (id, body)');

  const bm25 = await client.query<{ id: number; score: number }>(
    "SELECT id, paradedb.score(id) AS score FROM verify_search.docs WHERE body @@@ 'payment' ORDER BY score DESC",
  );
  report.bm25 = bm25.rows;
  const order = bm25.rows.map(r => r.id);
  if (order.join() !== '2,1,4') failures.push(`BM25 order for "payment" should be 2,1,4, got ${order.join()}`);
  if (order.includes(3)) failures.push('a document without the term was returned');
  // The plan must actually use the BM25 index, not a sequential scan with a filter.
  const plan = await client.query("EXPLAIN SELECT id FROM verify_search.docs WHERE body @@@ 'payment'");
  const planText = plan.rows.map(r => Object.values(r)[0]).join('\n');
  report.bm25Plan = planText;
  if (!/Custom Scan|ParadeDB|bm25/i.test(planText)) failures.push('the query plan does not use the BM25 index');

  const knn = await client.query<{ id: number; distance: number }>(
    "SELECT id, (embedding <-> '[1,0,0]') AS distance FROM verify_search.docs ORDER BY embedding <-> '[1,0,0]' LIMIT 2",
  );
  report.vectorNearest = knn.rows;
  if (knn.rows.map(r => r.id).join() !== '1,2') failures.push('nearest vectors to [1,0,0] should be 1 then 2');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
report.result = failures.length ? 'FAILED' : 'PASSED';
report.failures = failures;
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
