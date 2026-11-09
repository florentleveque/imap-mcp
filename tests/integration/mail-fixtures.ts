import { readFileSync } from 'node:fs';

/** The synthetic .eml files under fixtures/mail, one per MIME shape the tools must handle. */
export const FIXTURES = [
  'plain',
  'html-only',
  'alternative',
  'attachment',
  'inline-named',
  'no-disposition',
  'related',
  'forwarded',
  'encoded-names',
  'latin1',
  'inline-text',
  'named-body',
];

export const rawFixture = (name: string): string =>
  readFileSync(new URL(`fixtures/mail/${name}.eml`, import.meta.url), 'utf8');
