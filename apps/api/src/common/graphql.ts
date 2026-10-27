// GraphQL guards that need no extra package: a validation rule limiting depth and total field selections
// (aliases count, so `a1: contacts … a500: contacts` is refused), and an error formatter that keeps the same
// structured codes as REST and drops stack traces and internal messages.
import {
  type ASTVisitor,
  type FragmentDefinitionNode,
  GraphQLError,
  type GraphQLFormattedError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';
import { isApiErrorCode } from './errors.js';

export const DEFAULT_MAX_DEPTH = 8;
export const DEFAULT_MAX_FIELDS = 250;

/**
 * Validation rule: refuse operations nested deeper than `maxDepth` or selecting more than `maxFields` fields in
 * total (fragments expanded each time they are spread). Runs before any resolver, so nothing is executed.
 * Register via the GraphQL module's `validationRules: [queryLimitsRule()]`.
 */
export function queryLimitsRule(opts: { maxDepth?: number; maxFields?: number } = {}) {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFields = opts.maxFields ?? DEFAULT_MAX_FIELDS;
  return (context: ValidationContext): ASTVisitor => ({
    OperationDefinition(node) {
      let fields = 0;
      let deepest = 0;
      let stop = false;
      const walk = (set: SelectionSetNode, depth: number, path: ReadonlySet<string>) => {
        for (const sel of set.selections) {
          if (stop) return;
          if (sel.kind === Kind.FIELD) {
            fields++;
            deepest = Math.max(deepest, depth);
            if (fields > maxFields || depth > maxDepth) {
              stop = true;
              return;
            }
            if (sel.selectionSet) walk(sel.selectionSet, depth + 1, path);
          } else if (sel.kind === Kind.INLINE_FRAGMENT) {
            walk(sel.selectionSet, depth, path);
          } else {
            const name = sel.name.value;
            if (path.has(name)) continue; // a fragment cycle: graphql's own NoFragmentCycles rule reports it
            const frag: FragmentDefinitionNode | null | undefined = context.getFragment(name);
            if (frag) walk(frag.selectionSet, depth, new Set([...path, name]));
          }
        }
      };
      walk(node.selectionSet, 1, new Set());
      if (deepest > maxDepth)
        context.reportError(
          new GraphQLError(`This query is nested too deeply (limit ${maxDepth}).`, {
            nodes: [node],
            extensions: { code: 'validation_failed', details: { limit: 'depth', max: maxDepth } },
          }),
        );
      else if (fields > maxFields)
        context.reportError(
          new GraphQLError(`This query selects too many fields (limit ${maxFields}).`, {
            nodes: [node],
            extensions: { code: 'validation_failed', details: { limit: 'fields', max: maxFields } },
          }),
        );
    },
  });
}

/** Apollo's own codes for request problems: the message is about the query text, so it is safe to show. */
const APOLLO_REQUEST_CODES: Record<string, string> = {
  GRAPHQL_PARSE_FAILED: 'bad_request',
  GRAPHQL_VALIDATION_FAILED: 'validation_failed',
  BAD_USER_INPUT: 'validation_failed',
  PERSISTED_QUERY_NOT_SUPPORTED: 'bad_request',
  OPERATION_RESOLUTION_FAILURE: 'bad_request',
  BAD_REQUEST: 'bad_request',
};

/**
 * Apollo `formatError`: keep errors that already carry one of our codes (they came through StructuredErrorFilter
 * or a validation rule), translate Apollo's request errors, and replace anything else with internal_error, so no
 * stack trace or internal message reaches a client in any environment.
 */
export function formatGraphqlError(formatted: GraphQLFormattedError): GraphQLFormattedError {
  const ext = formatted.extensions ?? {};
  const code = ext.code;
  const keep = (c: string, message: string) => ({
    message,
    ...(formatted.locations ? { locations: formatted.locations } : {}),
    ...(formatted.path ? { path: formatted.path } : {}),
    extensions: {
      code: c,
      ...(typeof ext.requestId === 'string' ? { requestId: ext.requestId } : {}),
      ...(typeof ext.status === 'number' ? { status: ext.status } : {}),
      ...(ext.details && typeof ext.details === 'object' ? { details: ext.details } : {}),
      ...(typeof ext.reason === 'string' ? { reason: ext.reason } : {}),
    },
  });
  if (isApiErrorCode(code)) {
    if (code === 'internal_error')
      return keep(code, 'Something went wrong on our side. If you report it, quote the request id.');
    return keep(code, formatted.message);
  }
  if (typeof code === 'string' && APOLLO_REQUEST_CODES[code])
    return keep(APOLLO_REQUEST_CODES[code]!, formatted.message);
  return keep('internal_error', 'Something went wrong on our side. If you report it, quote the request id.');
}
