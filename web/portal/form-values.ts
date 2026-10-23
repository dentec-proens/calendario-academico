/** FormData also permits files; API text fields must receive strings only. */
export function formText(form: FormData, field: string): string {
  const value = form.get(field);
  if (value === null) return '';
  if (typeof value !== 'string') throw Error('Campo de texto inválido: ' + field);
  return value;
}
