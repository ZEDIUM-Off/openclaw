import { Type } from "@sinclair/typebox";

const NonEmptyString = Type.String({ minLength: 1 });

export const KgmAdminStatusParamsSchema = Type.Object({}, { additionalProperties: false });

export const KgmAdminInitParamsSchema = Type.Object({}, { additionalProperties: false });

export const KgmAdminEnsureAgentParamsSchema = Type.Object(
  {
    agentId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const KgmSchemaDescribeParamsSchema = Type.Object(
  {
    scope: NonEmptyString,
    database: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentSearchParamsSchema = Type.Object(
  {
    query: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentGetParamsSchema = Type.Object(
  {
    key: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentPutNodeParamsSchema = Type.Object(
  {
    key: NonEmptyString,
    label: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    properties: Type.Optional(Type.Object({}, { additionalProperties: true })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentPutEdgeParamsSchema = Type.Object(
  {
    fromKey: NonEmptyString,
    fromLabel: NonEmptyString,
    toKey: NonEmptyString,
    toLabel: NonEmptyString,
    type: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    properties: Type.Optional(Type.Object({}, { additionalProperties: true })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentLinkParamsSchema = Type.Object(
  {
    fromKey: NonEmptyString,
    fromLabel: NonEmptyString,
    toKey: NonEmptyString,
    toLabel: NonEmptyString,
    type: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    properties: Type.Optional(Type.Object({}, { additionalProperties: true })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentPinParamsSchema = Type.Object(
  {
    key: NonEmptyString,
    scope: Type.Optional(NonEmptyString),
    pinned: Type.Optional(Type.Boolean()),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentTouchParamsSchema = Type.Object(
  {
    keys: Type.Array(NonEmptyString, { minItems: 1 }),
    scope: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentGcParamsSchema = Type.Object(
  {
    scope: Type.Optional(NonEmptyString),
    minWeight: Type.Optional(Type.Number({ minimum: 0 })),
    maxNodes: Type.Optional(Type.Integer({ minimum: 1 })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentEnsureSchemaParamsSchema = Type.Object(
  {
    scope: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentContextGetParamsSchema = Type.Object(
  {
    scope: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentContextPatchParamsSchema = Type.Object(
  {
    scope: Type.Optional(NonEmptyString),
    addNodes: Type.Optional(Type.Array(NonEmptyString)),
    removeNodes: Type.Optional(Type.Array(NonEmptyString)),
    addMessages: Type.Optional(Type.Array(NonEmptyString)),
    removeMessages: Type.Optional(Type.Array(NonEmptyString)),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const KgmAgentContextMaterializeParamsSchema = Type.Object(
  {
    scope: Type.Optional(NonEmptyString),
    maxNodes: Type.Optional(Type.Integer({ minimum: 1 })),
    maxMessages: Type.Optional(Type.Integer({ minimum: 1 })),
    sessionKey: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
