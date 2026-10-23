// Only the existing authenticated Node backend knows this secret. The React
// bundle never receives it. Domain authorization stays in the existing routes.
export function requireBridge(secret: string) {
  const expected = process.env.DENTEC_CONVEX_BRIDGE_SECRET;
  if (!expected || expected.length < 32 || secret.length !== expected.length)
    throw new Error('Acesso ao armazenamento não autorizado.');
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ secret.charCodeAt(i);
  if (difference) throw new Error('Acesso ao armazenamento não autorizado.');
}
