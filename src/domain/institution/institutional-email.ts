/** Only institutional accounts sign in; the server applies the same rule to the normalized value. */
export const institutionalEmailMessage = 'Use um e-mail @ifpr.edu.br.';

const institutionalEmailPattern = /^[^\s@]+@ifpr\.edu\.br$/;
const maximumLength = 240;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Whether a normalized address is an acceptable institutional e-mail. */
export function isInstitutionalEmail(email: string) {
  return email.length <= maximumLength && institutionalEmailPattern.test(email);
}
