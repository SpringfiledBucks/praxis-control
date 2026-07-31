import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { advisoryRequestSchema, type AdvisoryRequest } from './contracts.js';

const identifierSchema = z.uuid();
const shortTextSchema = z.string().trim().min(1).max(1000);
const longTextSchema = z.string().trim().min(1).max(4000);

const projectContextRecordSchema = z.object({
  type: z.literal('project'),
  id: identifierSchema,
  title: shortTextSchema,
  stageGoal: longTextSchema.optional(),
  mainContradiction: longTextSchema.optional(),
  bottleneck: longTextSchema.optional(),
  stopCondition: longTextSchema.optional(),
}).strict();

const checkinContextRecordSchema = z.object({
  type: z.literal('checkin'),
  id: identifierSchema,
  checkinDate: z.iso.date(),
  mainAction: longTextSchema,
  deliverable: longTextSchema,
  stopCondition: longTextSchema.optional(),
}).strict();

const weeklyReviewContextRecordSchema = z.object({
  type: z.literal('weekly_review'),
  id: identifierSchema,
  weekStart: z.iso.date(),
  summary: longTextSchema.optional(),
}).strict();

const evidenceContextRecordSchema = z.object({
  type: z.literal('evidence'),
  id: identifierSchema,
  title: shortTextSchema,
  summary: longTextSchema,
  sourceType: shortTextSchema.optional(),
  sourceUrl: z.url().max(2000).refine(isPublicHttpUrl, 'sourceUrl must be a public HTTP(S) URL').optional(),
}).strict();

const ruleContextRecordSchema = z.object({
  type: z.literal('rule'),
  id: identifierSchema,
  ruleVersion: shortTextSchema,
  inputSummary: longTextSchema,
  outputSummary: longTextSchema,
}).strict();

export const advisoryContextRecordSchema = z.discriminatedUnion('type', [
  projectContextRecordSchema,
  checkinContextRecordSchema,
  weeklyReviewContextRecordSchema,
  evidenceContextRecordSchema,
  ruleContextRecordSchema,
]);

export type AdvisoryContextRecord = z.infer<typeof advisoryContextRecordSchema>;

const allowedRecordTypes = {
  checkin_structure: new Set<AdvisoryContextRecord['type']>(['project']),
  weekly_review_draft: new Set<AdvisoryContextRecord['type']>(['checkin', 'weekly_review']),
  evidence_relations: new Set<AdvisoryContextRecord['type']>(['evidence']),
  rule_explanation: new Set<AdvisoryContextRecord['type']>(['rule']),
} satisfies Record<AdvisoryRequest['useCase'], Set<AdvisoryContextRecord['type']>>;

const forbiddenLocatorPatterns: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'local file URI', pattern: /file:\/\//i },
  { label: 'private network URI', pattern: /(?:ssh|smb|nfs):\/\//i },
  { label: 'Windows drive path', pattern: /(?:^|[\s("'])[A-Za-z]:[\\/]/ },
  { label: 'UNC path', pattern: /\\\\[A-Za-z0-9._-]+\\/ },
  { label: 'POSIX local path', pattern: /(?:^|[\s("'])\/(?:home|Users|etc|var|srv|mnt|opt|root|tmp)(?:\/|\b)/i },
  { label: 'localhost address', pattern: /(?:^|[^A-Za-z0-9.-])(?:localhost|127(?:\.\d{1,3}){3})(?:[^A-Za-z0-9.-]|$)/i },
  { label: 'private IPv4 address', pattern: /(?:^|[^\d])(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2})(?:[^\d]|$)/ },
];

function isPrivateHost(hostnameInput: string): boolean {
  const hostname = hostnameInput.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.endsWith('.internal') || hostname.endsWith('.lan') || hostname.endsWith('.home.arpa')) return true;
  if (isIP(hostname) === 6) {
    return hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe8')
      || hostname.startsWith('fe9') || hostname.startsWith('fea') || hostname.startsWith('feb');
  }
  if (isIP(hostname) === 4) {
    const octets = hostname.split('.').map(Number);
    const first = octets[0]!;
    const second = octets[1]!;
    const third = octets[2]!;
    return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127) || (first === 192 && second === 0)
      || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
      || (first === 203 && second === 0 && third === 113);
  }
  return !hostname.includes('.');
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username && !url.password && !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function assertNoPrivateLocators(value: unknown, path = 'context'): void {
  if (typeof value === 'string') {
    const match = forbiddenLocatorPatterns.find(({ pattern }) => pattern.test(value));
    if (match) throw new Error(`${path} contains a forbidden ${match.label}`);
    for (const urlText of value.match(/https?:\/\/[^\s<>()"']+/gi) ?? []) {
      if (!isPublicHttpUrl(urlText)) throw new Error(`${path} contains a forbidden private HTTP(S) URL`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPrivateLocators(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => assertNoPrivateLocators(entry, `${path}.${key}`));
  }
}

export type PreparedAdvisoryContext = {
  schemaVersion: 1;
  request: AdvisoryRequest;
  records: AdvisoryContextRecord[];
  audit: {
    recordIds: string[];
    recordTypes: AdvisoryContextRecord['type'][];
    fieldNames: string[];
    characterCount: number;
  };
  digest: string;
};

export function prepareAdvisoryContext(
  requestInput: unknown,
  recordInputs: readonly unknown[],
): PreparedAdvisoryContext {
  const request = advisoryRequestSchema.parse(requestInput);
  const records = recordInputs.map((record) => advisoryContextRecordSchema.parse(record));
  const selectedIds = new Set(request.recordIds);
  const actualIds = new Set(records.map(({ id }) => id));

  if (actualIds.size !== records.length) throw new Error('advisory context contains duplicate record IDs');
  if (selectedIds.size !== request.recordIds.length) throw new Error('advisory request contains duplicate record IDs');
  if (selectedIds.size !== actualIds.size || [...selectedIds].some((id) => !actualIds.has(id))) {
    throw new Error('advisory context must contain exactly the selected record IDs');
  }

  const allowedTypes = allowedRecordTypes[request.useCase];
  const disallowed = records.find(({ type }) => !allowedTypes.has(type));
  if (disallowed) throw new Error(`${disallowed.type} records are not allowed for ${request.useCase}`);

  const canonicalRequest: AdvisoryRequest = {
    useCase: request.useCase,
    recordIds: [...request.recordIds].sort(),
    ...(request.userInstruction ? { userInstruction: request.userInstruction } : {}),
    locale: request.locale,
  };
  const canonicalRecords = [...records].sort((left, right) => left.id.localeCompare(right.id));
  const payload = { schemaVersion: 1 as const, request: canonicalRequest, records: canonicalRecords };
  assertNoPrivateLocators(payload);
  const serialized = JSON.stringify(payload);
  const recordTypes = [...new Set(canonicalRecords.map(({ type }) => type))].sort();
  const fieldNames = [...new Set(canonicalRecords.flatMap((record) => Object.keys(record).map((field) => `records.${field}`)))].sort();
  const audit = {
    recordIds: [...canonicalRequest.recordIds],
    recordTypes,
    fieldNames: ['request.locale', 'request.recordIds', 'request.useCase', ...(canonicalRequest.userInstruction ? ['request.userInstruction'] : []), ...fieldNames],
    characterCount: [...serialized].length,
  };
  const digest = createHash('sha256').update(serialized, 'utf8').digest('hex');
  return { ...payload, audit, digest };
}
