import { expect, test } from 'vitest';
import { configureOfferMetadata } from '../../src/domain/calendar/commands/organization.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';

test('altera apenas metadados da oferta selecionada, preservando identidade, configuração e registros', () => {
  const state = calendarOffersV4Fixture();
  const before = structuredClone(state);
  const next = configureOfferMetadata(state, 'graduacao-2', {
    label: '  Engenharia Eletrônica  ',
    delivery: 'ead',
    organizationBasis: '  PPC aprovado em resolução institucional  ',
  });
  expect(next.offers[2]).toEqual({
    ...state.offers[2],
    label: 'Engenharia Eletrônica',
    delivery: 'ead',
    organizationBasis: 'PPC aprovado em resolução institucional',
  });
  expect(next.offers.filter((offer) => offer.id !== 'graduacao-2')).toEqual(
    state.offers.filter((offer) => offer.id !== 'graduacao-2'),
  );
  expect(next.periods).toBe(state.periods);
  expect(next.events).toBe(state.events);
  expect(state).toEqual(before);
});

test('nomes são obrigatórios para tipos repetidos e únicos no calendário', () => {
  const state = calendarOffersV4Fixture();
  expect(() =>
    configureOfferMetadata(state, 'graduacao-2', { label: '', delivery: 'presencial' }),
  ).toThrow('Dê um nome');
  expect(() =>
    configureOfferMetadata(state, 'graduacao-2', {
      label: ' licenciatura em química ',
      delivery: 'presencial',
    }),
  ).toThrow('únicos');
  expect(() =>
    configureOfferMetadata(state, 'graduacao-2', {
      label: 'a'.repeat(241),
      delivery: 'presencial',
    }),
  ).toThrow('texto muito longo');
});

test('remove metadados opcionais vazios sem exigir reclassificação de datas migradas', () => {
  const state = calendarOffersV4Fixture();
  state.offers[0].label = 'Técnico em Informática';
  state.offers[0].organizationBasis = 'Fonte antiga';
  state.events[0].start = '2027-01-01';
  const next = configureOfferMetadata(state, 'integrado', {
    label: '  ',
    organizationBasis: '',
    delivery: 'a-conferir',
  });
  expect(next.offers[0]).not.toHaveProperty('label');
  expect(next.offers[0]).not.toHaveProperty('organizationBasis');
  expect(next.events[0].start).toBe('2027-01-01');
  expect(() => configureOfferMetadata(state, 'inexistente', { delivery: 'ead' })).toThrow(
    'não pertence',
  );
  expect(() =>
    configureOfferMetadata(state, 'integrado', { delivery: 'invalid' as never }),
  ).toThrow('modo');
});
