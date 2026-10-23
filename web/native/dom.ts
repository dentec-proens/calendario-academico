/** Fail early when a page template and its controller no longer agree. */
export function element<T extends HTMLElement>(id: string, kind: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error('Elemento obrigatório ausente: ' + id);
  return node;
}
