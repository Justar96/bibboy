import { Schema } from "effect"

// ============================================================================
// Responses API Types (streaming + resources)
// ============================================================================

export const ResponseOutputTextPartSchema = Schema.Struct({
  type: Schema.Literal("output_text"),
  text: Schema.String,
  annotations: Schema.optional(Schema.Array(Schema.Unknown)),
  logprobs: Schema.optional(Schema.Array(Schema.Unknown)),
})

export type ResponseOutputTextPart = Schema.Schema.Type<typeof ResponseOutputTextPartSchema>

export const ResponseRefusalPartSchema = Schema.Struct({
  type: Schema.Literal("refusal"),
  refusal: Schema.String,
})

export type ResponseRefusalPart = Schema.Schema.Type<typeof ResponseRefusalPartSchema>

export const ResponseReasoningTextPartSchema = Schema.Struct({
  type: Schema.Literal("reasoning_text"),
  text: Schema.String,
})

export type ResponseReasoningTextPart = Schema.Schema.Type<
  typeof ResponseReasoningTextPartSchema
>

export const ResponseContentPartSchema = Schema.Union(
  ResponseOutputTextPartSchema,
  ResponseRefusalPartSchema,
  ResponseReasoningTextPartSchema
)

export type ResponseContentPart = Schema.Schema.Type<typeof ResponseContentPartSchema>

export const ResponseMessageItemSchema = Schema.Struct({
  type: Schema.Literal("message"),
  id: Schema.String,
  role: Schema.Literal("assistant"),
  content: Schema.Array(ResponseContentPartSchema),
  status: Schema.optional(
    Schema.Union(
      Schema.Literal("in_progress"),
      Schema.Literal("completed"),
      Schema.Literal("incomplete")
    )
  ),
})

export type ResponseMessageItem = Schema.Schema.Type<typeof ResponseMessageItemSchema>

export const ResponseFunctionCallItemSchema = Schema.Struct({
  type: Schema.Literal("function_call"),
  id: Schema.String,
  call_id: Schema.String,
  name: Schema.String,
  arguments: Schema.String,
  status: Schema.optional(
    Schema.Union(
      Schema.Literal("in_progress"),
      Schema.Literal("completed"),
      Schema.Literal("incomplete")
    )
  ),
})

export type ResponseFunctionCallItem = Schema.Schema.Type<typeof ResponseFunctionCallItemSchema>

export const ResponseFunctionCallOutputItemSchema = Schema.Struct({
  type: Schema.Literal("function_call_output"),
  id: Schema.String,
  call_id: Schema.String,
  output: Schema.String,
  status: Schema.optional(
    Schema.Union(
      Schema.Literal("in_progress"),
      Schema.Literal("completed"),
      Schema.Literal("incomplete")
    )
  ),
})

export type ResponseFunctionCallOutputItem = Schema.Schema.Type<
  typeof ResponseFunctionCallOutputItemSchema
>

export const ResponseOutputItemSchema = Schema.Union(
  ResponseMessageItemSchema,
  ResponseFunctionCallItemSchema,
  ResponseFunctionCallOutputItemSchema
)

export type ResponseOutputItem = Schema.Schema.Type<typeof ResponseOutputItemSchema>

export const ResponseUsageSchema = Schema.Struct({
  input_tokens: Schema.Number,
  input_tokens_details: Schema.optional(
    Schema.Struct({
      cached_tokens: Schema.optional(Schema.Number),
    })
  ),
  output_tokens: Schema.Number,
  output_tokens_details: Schema.optional(
    Schema.Struct({
      reasoning_tokens: Schema.optional(Schema.Number),
    })
  ),
  total_tokens: Schema.Number,
})

export type ResponseUsage = Schema.Schema.Type<typeof ResponseUsageSchema>

export const ResponseStatusSchema = Schema.Union(
  Schema.Literal("queued"),
  Schema.Literal("in_progress"),
  Schema.Literal("completed"),
  Schema.Literal("failed"),
  Schema.Literal("cancelled"),
  Schema.Literal("incomplete")
)

export type ResponseStatus = Schema.Schema.Type<typeof ResponseStatusSchema>

export const ResponseResourceSchema = Schema.Struct({
  id: Schema.String,
  object: Schema.Literal("response"),
  created_at: Schema.Number,
  completed_at: Schema.optional(Schema.Number),
  background: Schema.optional(Schema.Boolean),
  status: ResponseStatusSchema,
  model: Schema.String,
  output: Schema.Array(ResponseOutputItemSchema),
  output_text: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.Union(Schema.String, Schema.Array(Schema.Unknown))),
  conversation: Schema.optional(
    Schema.Union(
      Schema.Null,
      Schema.Struct({
        id: Schema.String,
      })
    )
  ),
  previous_response_id: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
  max_output_tokens: Schema.optional(Schema.Union(Schema.Number, Schema.Null)),
  max_tool_calls: Schema.optional(Schema.Union(Schema.Number, Schema.Null)),
  metadata: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean),
    })
  ),
  parallel_tool_calls: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Number),
  top_p: Schema.optional(Schema.Number),
  top_logprobs: Schema.optional(Schema.Number),
  tool_choice: Schema.optional(
    Schema.Union(
      Schema.Literal("none"),
      Schema.Literal("auto"),
      Schema.Literal("required"),
      Schema.Struct({
        type: Schema.String,
      })
    )
  ),
  tools: Schema.optional(Schema.Array(Schema.Unknown)),
  truncation: Schema.optional(Schema.Union(Schema.Literal("auto"), Schema.Literal("disabled"))),
  reasoning: Schema.optional(
    Schema.Struct({
      effort: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
      summary: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
      generate_summary: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
    })
  ),
  service_tier: Schema.optional(Schema.String),
  text: Schema.optional(
    Schema.Struct({
      format: Schema.optional(
        Schema.Struct({
          type: Schema.String,
        })
      ),
    })
  ),
  prompt: Schema.optional(
    Schema.Struct({
      id: Schema.optional(Schema.String),
      version: Schema.optional(Schema.String),
      variables: Schema.optional(
        Schema.Record({
          key: Schema.String,
          value: Schema.Unknown,
        })
      ),
    })
  ),
  store: Schema.optional(Schema.Boolean),
  user: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
  usage: Schema.optional(ResponseUsageSchema),
  incomplete_details: Schema.optional(
    Schema.Union(
      Schema.Null,
      Schema.Struct({
        reason: Schema.String,
      })
    )
  ),
  error: Schema.optional(
    Schema.Union(
      Schema.Null,
      Schema.Struct({
        code: Schema.String,
        message: Schema.String,
      })
    )
  ),
})

export type ResponseResource = Schema.Schema.Type<typeof ResponseResourceSchema>

// ============================================================================
// Streaming Events
// ============================================================================

const SequenceNumberSchema = Schema.Struct({
  sequence_number: Schema.Number,
})

export const ResponseCreatedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.created"),
    response: ResponseResourceSchema,
  }),
  SequenceNumberSchema
)

export const ResponseInProgressEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.in_progress"),
    response: ResponseResourceSchema,
  }),
  SequenceNumberSchema
)

export const ResponseQueuedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.queued"),
    response: ResponseResourceSchema,
  }),
  SequenceNumberSchema
)

export const ResponseCompletedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.completed"),
    response: ResponseResourceSchema,
  }),
  SequenceNumberSchema
)

export const ResponseFailedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.failed"),
    response: ResponseResourceSchema,
  }),
  SequenceNumberSchema
)

export const OutputItemAddedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.output_item.added"),
    output_index: Schema.Number,
    item: ResponseOutputItemSchema,
  }),
  SequenceNumberSchema
)

export const OutputItemDoneEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.output_item.done"),
    output_index: Schema.Number,
    item: ResponseOutputItemSchema,
  }),
  SequenceNumberSchema
)

export const ContentPartAddedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.content_part.added"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    part: ResponseContentPartSchema,
  }),
  SequenceNumberSchema
)

export const ContentPartDoneEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.content_part.done"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    part: ResponseContentPartSchema,
  }),
  SequenceNumberSchema
)

export const OutputTextDeltaEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.output_text.delta"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    delta: Schema.String,
    logprobs: Schema.optional(Schema.Array(Schema.Unknown)),
  }),
  SequenceNumberSchema
)

export const OutputTextDoneEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.output_text.done"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    text: Schema.String,
    logprobs: Schema.optional(Schema.Array(Schema.Unknown)),
  }),
  SequenceNumberSchema
)

export const OutputTextAnnotationAddedEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.output_text.annotation.added"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    annotation_index: Schema.Number,
    annotation: Schema.Unknown,
  }),
  SequenceNumberSchema
)

export const RefusalDeltaEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.refusal.delta"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    delta: Schema.String,
  }),
  SequenceNumberSchema
)

export const RefusalDoneEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.refusal.done"),
    item_id: Schema.String,
    output_index: Schema.Number,
    content_index: Schema.Number,
    refusal: Schema.String,
  }),
  SequenceNumberSchema
)

export const FunctionCallArgumentsDeltaEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.function_call_arguments.delta"),
    item_id: Schema.String,
    output_index: Schema.Number,
    delta: Schema.String,
  }),
  SequenceNumberSchema
)

export const FunctionCallArgumentsDoneEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("response.function_call_arguments.done"),
    item_id: Schema.String,
    name: Schema.String,
    output_index: Schema.Number,
    arguments: Schema.String,
  }),
  SequenceNumberSchema
)

export const ResponseErrorEventSchema = Schema.extend(
  Schema.Struct({
    type: Schema.Literal("error"),
    error: Schema.Struct({
      code: Schema.String,
      message: Schema.String,
    }),
  }),
  SequenceNumberSchema
)

export const ResponseStreamEventSchema = Schema.Union(
  ResponseCreatedEventSchema,
  ResponseQueuedEventSchema,
  ResponseInProgressEventSchema,
  ResponseCompletedEventSchema,
  ResponseFailedEventSchema,
  OutputItemAddedEventSchema,
  OutputItemDoneEventSchema,
  ContentPartAddedEventSchema,
  ContentPartDoneEventSchema,
  OutputTextDeltaEventSchema,
  OutputTextDoneEventSchema,
  OutputTextAnnotationAddedEventSchema,
  RefusalDeltaEventSchema,
  RefusalDoneEventSchema,
  FunctionCallArgumentsDeltaEventSchema,
  FunctionCallArgumentsDoneEventSchema,
  ResponseErrorEventSchema
)

export type ResponseStreamEvent = Schema.Schema.Type<typeof ResponseStreamEventSchema>
