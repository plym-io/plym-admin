import { describe, it, expect } from 'vitest';
import {
  groupByTag,
  listOperations,
  matchesQuery,
  refName,
  resolveRef,
  schemaFields,
  typeLabel,
  type OpenApiDocument,
} from './openapi';

const DOC: OpenApiDocument = {
  openapi: '3.1.0',
  paths: {
    '/api/posts': {
      parameters: [{ name: 'trace', in: 'header', schema: { type: 'string' } }],
      get: {
        tags: ['Posts'],
        summary: 'List Posts',
        parameters: [
          { name: 'page', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Successful Response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PostPage' } } },
          },
          '422': { description: 'Validation Error' },
        },
      },
      post: {
        tags: ['Posts'],
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/health': {
      get: { responses: { '200': { description: 'ok' } } },
      // Not an HTTP method — must not become an operation.
      summary: 'health probe',
    },
  },
  components: {
    schemas: {
      Post: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Title' },
          excerpt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
        },
      },
      Tag: { type: 'object', properties: { name: { type: 'string' } } },
      PostPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
          total: { type: 'integer' },
        },
      },
      // Points at itself — the depth guard is the only thing stopping this.
      Node: {
        type: 'object',
        properties: { child: { $ref: '#/components/schemas/Node' } },
      },
    },
  },
};

describe('resolveRef', () => {
  it('follows a local ref', () => {
    expect(resolveRef(DOC, { $ref: '#/components/schemas/Tag' })).toEqual(
      DOC.components!.schemas!.Tag,
    );
  });

  it('leaves a node that is not a ref alone', () => {
    expect(resolveRef(DOC, { type: 'string' })).toEqual({ type: 'string' });
  });

  it('returns the ref node itself when it cannot be resolved', () => {
    const missing = { $ref: '#/components/schemas/Nope' };
    expect(resolveRef(DOC, missing)).toBe(missing);
    const remote = { $ref: 'https://example.com/x.json#/A' };
    expect(resolveRef(DOC, remote)).toBe(remote);
  });
});

describe('refName', () => {
  it('takes the last segment', () => {
    expect(refName({ $ref: '#/components/schemas/PostPage' })).toBe('PostPage');
    expect(refName({ type: 'string' })).toBeNull();
  });
});

describe('listOperations', () => {
  const ops = listOperations(DOC);

  it('flattens every method on every path', () => {
    expect(ops.map((o) => o.id)).toEqual([
      'get:/api/posts',
      'post:/api/posts',
      'get:/health',
    ]);
  });

  it('ignores keys on a path item that are not methods', () => {
    expect(ops.some((o) => o.method === ('summary' as never))).toBe(false);
  });

  it('merges path-level parameters into every operation on that path', () => {
    const get = ops.find((o) => o.id === 'get:/api/posts')!;
    expect(get.parameters.map((p) => p.name)).toEqual(['trace', 'page']);
    expect(get.parameters.find((p) => p.name === 'page')!.required).toBe(true);
  });

  it('files an untagged operation under General', () => {
    expect(ops.find((o) => o.path === '/health')!.tag).toBe('General');
  });

  it('reads an empty security array as public and a missing one as secured', () => {
    expect(ops.find((o) => o.id === 'post:/api/posts')!.secured).toBe(false);
    expect(ops.find((o) => o.id === 'get:/api/posts')!.secured).toBe(true);
  });

  it('picks the JSON media type for bodies and responses', () => {
    const post = ops.find((o) => o.id === 'post:/api/posts')!;
    expect(post.requestBody).toMatchObject({
      required: true,
      mediaType: 'application/json',
    });
  });

  it('sorts responses by status and keeps the ones with no schema', () => {
    const get = ops.find((o) => o.id === 'get:/api/posts')!;
    expect(get.responses.map((r) => r.status)).toEqual(['200', '422']);
    expect(get.responses[1].schema).toBeUndefined();
  });

  it('survives a document with no paths at all', () => {
    expect(listOperations({ openapi: '3.1.0' })).toEqual([]);
  });
});

describe('groupByTag', () => {
  it('groups in first-seen order', () => {
    expect(groupByTag(listOperations(DOC)).map((g) => g.tag)).toEqual([
      'Posts',
      'General',
    ]);
  });
});

describe('matchesQuery', () => {
  const op = listOperations(DOC)[0];

  it('matches an empty query', () => {
    expect(matchesQuery(op, '   ')).toBe(true);
  });

  it('matches on path, method, tag and summary', () => {
    expect(matchesQuery(op, 'posts')).toBe(true);
    expect(matchesQuery(op, 'GET')).toBe(true);
    expect(matchesQuery(op, 'list')).toBe(true);
    expect(matchesQuery(op, 'zzz')).toBe(false);
  });
});

describe('typeLabel', () => {
  it('keeps a named ref as its name', () => {
    expect(typeLabel(DOC, { $ref: '#/components/schemas/Post' })).toBe('Post');
  });

  it('collapses FastAPI optionals to "· nullable"', () => {
    expect(typeLabel(DOC, { anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe(
      'string · nullable',
    );
  });

  it('renders arrays and enums', () => {
    expect(typeLabel(DOC, { type: 'array', items: { $ref: '#/components/schemas/Tag' } })).toBe(
      'Tag[]',
    );
    expect(typeLabel(DOC, { enum: ['draft', 'published'] })).toBe('"draft" | "published"');
  });

  it('includes the format when there is one', () => {
    expect(typeLabel(DOC, { type: 'string', format: 'date-time' })).toBe(
      'string (date-time)',
    );
  });
});

describe('schemaFields', () => {
  it('lists properties with required flags and descriptions', () => {
    const fields = schemaFields(DOC, { $ref: '#/components/schemas/Post' });
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['title', 'string', true],
      ['excerpt', 'string · nullable', false],
      ['tags', 'Tag[]', false],
    ]);
    expect(fields[0].description).toBe('Title');
  });

  it('recurses into arrays of objects', () => {
    const fields = schemaFields(DOC, { $ref: '#/components/schemas/Post' });
    expect(fields.find((f) => f.name === 'tags')!.children!.map((c) => c.name)).toEqual([
      'name',
    ]);
  });

  it('unwraps an array schema to the shape it holds', () => {
    const fields = schemaFields(DOC, {
      type: 'array',
      items: { $ref: '#/components/schemas/Tag' },
    });
    expect(fields.map((f) => f.name)).toEqual(['name']);
  });

  it('stops rather than looping on a self-referential schema', () => {
    const fields = schemaFields(DOC, { $ref: '#/components/schemas/Node' });
    expect(fields[0].name).toBe('child');
    // The point is that it bottoms out at all: Node.child is a Node, so
    // without the depth guard this recurses until the stack gives out.
    let depth = 0;
    for (let node = fields[0]; node.children; node = node.children[0]) {
      expect(++depth).toBeLessThan(10);
    }
    expect(depth).toBeGreaterThan(0);
  });

  it('returns nothing for a scalar', () => {
    expect(schemaFields(DOC, { type: 'string' })).toEqual([]);
  });
});
