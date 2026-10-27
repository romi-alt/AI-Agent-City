import { migrate } from './index.js';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error(
    'DATABASE_ADMIN_URL is not set. For local development run `pnpm infra:up` first; the scripts read infra/local-dev.env.',
  );
  process.exit(2);
}
const ran = await migrate(url, direction);
console.log(ran.length ? `${direction}: ${ran.join(', ')}` : `${direction}: nothing to do`);
