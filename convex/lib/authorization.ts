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

export function assertCampus(user: Member, campusId: Id<'campuses'>) {
  if (user.role === 'CAMPUS' && user.campusId !== campusId) fail('Registro não encontrado.', 404);
}
