import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Invoke the installed CLI with Node: no global binary, shell shim or registry lookup.
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.resolve('@tanstack/intent')));
const run = (...args: string[]) =>
  execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const listing = JSON.parse(run('list', '--json')) as { skills: Array<{ use: string }> };
for (const identity of [
  '@tanstack/router-core#router-core',
  '@tanstack/react-router#react-router',
]) {
  assert(
    listing.skills.some((skill) => skill.use === identity),
    `Skill não descoberta: ${identity}`,
  );
  const guidance = run('load', identity);
  assert(guidance.includes('SKILL.md') || guidance.includes('name:'), `Skill vazia: ${identity}`);
}
console.log('Skills TanStack instaladas foram descobertas e carregadas.');
