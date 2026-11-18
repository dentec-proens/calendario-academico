import type { Id } from '../_generated/dataModel';
import type { Member } from '../access/contracts';
import { fail } from './shared';

export function admin(user: Member) {
  if (user.role !== 'ADMIN') fail('Acesso exclusivo da administração.', 403);
}

export function reviewer(user: Member) {
  if (user.role !== 'ADMIN' && user.role !== 'PARECERISTA')
    fail('Acesso exclusivo da administração e dos pareceristas.', 403);
}

export function calendarEditor(user: Member) {
  if (user.role === 'PARECERISTA') fail('Pareceristas não podem alterar calendários.', 403);
}

/**
 * Whether the person works on the calendars of this campus: the administration and the reviewers
 * on every campus, a campus account only on its own. A campus reads the live calendars of the
 * others, but not their people, history, submissions or reviews.
 */
export function ownsCampus(user: Member, campusId: Id<'campuses'>) {
  return user.role !== 'CAMPUS' || user.campusId === campusId;
}

export function assertCampus(user: Member, campusId: Id<'campuses'>) {
  if (!ownsCampus(user, campusId)) fail('Registro não encontrado.', 404);
}
