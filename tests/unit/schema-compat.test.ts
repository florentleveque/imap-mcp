import { describe, expect, it } from 'vitest';

import { schemaWeakenings } from './schema-compat.js';

const reference = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The id' },
    count: { type: 'number', description: 'How many', minimum: 1, maximum: 100 },
    kind: { type: 'string', description: 'Which kind', enum: ['a', 'b'] },
    day: {
      type: 'string',
      description: 'A day',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    uid: { type: 'integer', description: 'A UID', exclusiveMinimum: 0, exclusiveMaximum: 100 },
    items: {
      type: 'array',
      description: 'Things',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        properties: { x: { type: 'number', description: 'X' } },
        required: ['x'],
        additionalProperties: true,
      },
    },
  },
  required: ['id'],
  additionalProperties: false,
};

function variant(change: (schema: typeof reference) => void) {
  const schema = structuredClone(reference);
  change(schema);
  return schema;
}

describe('schemaWeakenings', () => {
  it('accepts an identical schema', () => {
    expect(schemaWeakenings(reference, structuredClone(reference))).toEqual([]);
  });

  it('accepts additions and narrowings', () => {
    const candidate = variant((schema) => {
      Object.assign(schema, { $schema: 'https://json-schema.org/draft/2020-12/schema' });
      Object.assign(schema.properties.id, { minLength: 1 });
      Object.assign(schema.properties.count, { type: 'integer', minimum: 2, maximum: 50 });
      Object.assign(schema.properties.uid, { exclusiveMinimum: 1, exclusiveMaximum: 99 });
      schema.properties.kind.enum = ['a'];
      Object.assign(schema.properties, { extra: { type: 'boolean', default: false } });
      schema.required = ['id', 'count'];
      Object.assign(schema.properties.items.items, { additionalProperties: {} });
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([]);
  });

  it('reports a dropped property, description, items or enum', () => {
    const candidate = variant((schema) => {
      const { id: _id, ...rest } = schema.properties;
      Object.assign(schema, { properties: rest });
      Object.assign(schema.properties.count, { description: '' });
      Object.assign(schema.properties.items, { items: undefined });
      Object.assign(schema.properties.kind, { enum: undefined });
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([
      '$.id: property dropped',
      '$.count: description dropped',
      '$.kind: enum dropped',
      '$.items: items dropped',
    ]);
  });

  it('reports a loosened type, enum, bound or required list', () => {
    const candidate = variant((schema) => {
      Object.assign(schema.properties.id, { type: 'number' });
      Object.assign(schema.properties.count, { type: 'string', minimum: 0, maximum: 101 });
      schema.properties.kind.enum = ['a', 'b', 'c'];
      Object.assign(schema.properties.items, { minItems: undefined, maxItems: 11 });
      schema.required = [];
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([
      '$: id no longer required',
      '$.id: type string became number',
      '$.count: type number became string',
      '$.count: minimum 1 loosened',
      '$.count: maximum 100 loosened',
      '$.kind: enum widened with c',
      '$.items: minItems 1 loosened',
      '$.items: maxItems 10 loosened',
    ]);
  });

  it('reports a pattern or a format dropped or changed, which it cannot judge', () => {
    const candidate = variant((schema) => {
      Object.assign(schema.properties.day, { format: undefined, pattern: '^.*$' });
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([
      '$.day: pattern ^\\d{4}-\\d{2}-\\d{2}$ dropped or changed',
      '$.day: format date dropped or changed',
    ]);
  });

  it('reports an exclusive bound loosened or dropped', () => {
    const candidate = variant((schema) => {
      Object.assign(schema.properties.uid, { exclusiveMinimum: undefined, exclusiveMaximum: 101 });
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([
      '$.uid: exclusiveMinimum 0 loosened',
      '$.uid: exclusiveMaximum 100 loosened',
    ]);
  });

  it('reports a string length bound loosened', () => {
    const bounded = { type: 'string', minLength: 2, maxLength: 5 };

    expect(schemaWeakenings(bounded, { type: 'string', minLength: 2, maxLength: 5 })).toEqual([]);
    expect(schemaWeakenings(bounded, { type: 'string', minLength: 1, maxLength: 6 })).toEqual([
      '$: minLength 2 loosened',
      '$: maxLength 5 loosened',
    ]);
  });

  it('reports an object opened or closed, down to array items', () => {
    const candidate = variant((schema) => {
      Object.assign(schema, { additionalProperties: {} });
      Object.assign(schema.properties.items.items, { additionalProperties: false });
      Object.assign(schema.properties.items.items.properties.x, { type: 'string' });
    });

    expect(schemaWeakenings(reference, candidate)).toEqual([
      '$: additionalProperties opened',
      '$.items[]: additionalProperties closed',
      '$.items[].x: type number became string',
    ]);
  });

  it('treats an absent additionalProperties as open', () => {
    const open = { type: 'object', properties: {} };

    expect(schemaWeakenings(open, { type: 'object', properties: {} })).toEqual([]);
    expect(schemaWeakenings(open, { ...open, additionalProperties: false })).toEqual([
      '$: additionalProperties closed',
    ]);
  });
});
