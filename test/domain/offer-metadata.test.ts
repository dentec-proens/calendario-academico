import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { configureOfferMetadata } from '../../src/domain/calendar/commands/organization.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';

test('altera apenas metadados da oferta selecionada, preservando identidade, configuração e registros', () => {
  const state = calendarOffersFixture();
  const before = structuredClone(state);
  const next = configureOfferMetadata(state, 'graduacao-2', {
    label: '  Engenharia Eletrônica  ',
    delivery: 'ead',
  });
  expect(next.offers[2]).toEqual({
    ...state.offers[2],
    label: 'Engenharia Eletrônica',
    delivery: 'ead',
  });
  expect(next.offers.filter((offer) => offer.id !== 'graduacao-2')).toEqual(
    state.offers.filter((offer) => offer.id !== 'graduacao-2'),
  );
  expect(next.periods).toBe(state.periods);
  expect(next.events).toBe(state.events);
  expect(state).toEqual(before);
});

test('nomes são obrigatórios para tipos repetidos e únicos no calendário', () => {
  const state = calendarOffersFixture();
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
  const state = calendarOffersFixture();
  state.offers[0].label = 'Técnico em Informática';
  state.events[0].start = civilDate('2027-01-01');
  const next = configureOfferMetadata(state, 'integrado', {
    label: '  ',
    delivery: 'a-conferir',
  });
  expect(next.offers[0]).not.toHaveProperty('label');
  expect(next.events[0].start).toBe('2027-01-01');
  expect(() => configureOfferMetadata(state, 'inexistente', { delivery: 'ead' })).toThrow(
    'não pertence',
  );
  expect(() =>
    configureOfferMetadata(state, 'integrado', { delivery: 'invalid' as never }),
  ).toThrow('modo');
});
