#!/usr/bin/env node
// Builds the first-party Keycloak providers and copies the jars to infra/keycloak/providers/, which the compose
// Keycloak mounts at /opt/keycloak/providers (restart Keycloak afterwards to load a new jar).
//
// Today that is one provider: infra/keycloak/email-code-authenticator (passwordless email sign-in codes).
// Runs `mvn clean verify` (compile + JUnit + jar) with Maven from the host when available, otherwise in the pinned
// Maven Docker image. Any build or test failure exits non-zero and leaves the providers folder untouched.
//
// Usage: pnpm keycloak:providers [--docker]   (--docker forces the container build)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PROVIDERS = join(ROOT, 'infra/keycloak/providers');
// Maven 3.9 on JDK 21, pinned by tag and digest (Docker Hub image through Google's mirror, like infra/compose.yaml).
const MAVEN_IMAGE =
  'mirror.gcr.io/library/maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320';
const PROJECTS = [{ dir: 'infra/keycloak/email-code-authenticator', jar: 'agentcity-email-code-authenticator.jar' }];

function fail(message) {
  console.error(`keycloak:providers: ${message}`);
  process.exit(1);
}

function findHostMaven() {
  const candidates = [process.env.MAVEN_BIN, ...(process.env.PATH ?? '').split(delimiter).map(d => join(d, 'mvn'))];
  candidates.push('/opt/maven/bin/mvn', '/usr/bin/mvn', '/usr/local/bin/mvn');
  return candidates.find(c => c && existsSync(c));
}

function run(command, args, options) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) fail(`could not run ${command}: ${result.error.message}`);
  return result.status === 0;
}

// Maven inside the container cannot use a proxy on the host's loopback unless it shares the host network, and it
// must trust the same CA as the host when TLS is re-terminated by that proxy. Both are passed through explicitly;
// TLS verification stays on.
function dockerBuild(projectDir) {
  const args = ['run', '--rm', '-v', `${projectDir}:/src`, '-w', '/src'];
  args.push('-v', `${join(homedir(), '.m2')}:/root/.m2`);
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const javaOpts = [];
  let setup = '';
  if (proxy) {
    const url = new URL(proxy);
    args.push('--network', 'host');
    javaOpts.push(`-Dhttps.proxyHost=${url.hostname}`, `-Dhttps.proxyPort=${url.port || 80}`);
  }
  const ca = [process.env.MAVEN_EXTRA_CA_CERT, process.env.SSL_CERT_FILE, process.env.NODE_EXTRA_CA_CERTS].find(
    f => f && existsSync(f),
  );
  if (ca) {
    args.push('-v', `${ca}:/tmp/extra-ca.crt:ro`);
    // Import every certificate in the bundle into the image's JDK trust store (throwaway container).
    setup =
      'csplit -s -z -f /tmp/ca- /tmp/extra-ca.crt "/-----BEGIN CERTIFICATE-----/" "{*}" && ' +
      'for f in /tmp/ca-*; do keytool -importcert -noprompt -cacerts -storepass changeit ' +
      '-alias "extra-$(basename $f)" -file "$f" >/dev/null 2>&1 || true; done && ';
  }
  if (javaOpts.length) args.push('-e', `MAVEN_OPTS=${javaOpts.join(' ')}`);
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  const build = `${setup}mvn -B -ntp clean verify; s=$?; chown -R ${uid}:${gid} /src/target 2>/dev/null; exit $s`;
  args.push(MAVEN_IMAGE, 'sh', '-c', build);
  return run('docker', args, {});
}

const forceDocker = process.argv.includes('--docker');
const mvn = forceDocker ? undefined : findHostMaven();
if (!mvn && spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  fail('neither Maven (mvn) nor Docker is available. Install Maven 3.9+ with JDK 21, or Docker.');
}

mkdirSync(PROVIDERS, { recursive: true });
for (const project of PROJECTS) {
  const projectDir = join(ROOT, project.dir);
  const pom = readFileSync(join(projectDir, 'pom.xml'), 'utf8');
  const version = /<keycloak\.version>([^<]+)<\/keycloak\.version>/.exec(pom)?.[1];
  console.log(`Building ${project.dir} for Keycloak ${version} with ${mvn ? `host Maven (${mvn})` : 'Docker'}`);
  const ok = mvn ? run(mvn, ['-B', '-ntp', 'clean', 'verify'], { cwd: projectDir }) : dockerBuild(projectDir);
  if (!ok) fail(`build or tests failed in ${project.dir}; nothing was copied.`);
  const jar = join(projectDir, 'target', project.jar);
  if (!existsSync(jar)) fail(`build succeeded but ${jar} is missing.`);
  // Copy then rename, so a running Keycloak never sees a half-written jar.
  const target = join(PROVIDERS, project.jar);
  copyFileSync(jar, `${target}.tmp`);
  renameSync(`${target}.tmp`, target);
  console.log(`Copied ${project.jar} to infra/keycloak/providers/ (restart Keycloak to load it).`);
}
