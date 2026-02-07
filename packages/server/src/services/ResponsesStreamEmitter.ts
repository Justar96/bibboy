import type {
  ResponseFunctionCallItem,
  ResponseOutputItem,
  ResponseResource,
  ResponseStreamEvent,
  ServerNotification,
  ResponseUsage,
  ToolExecutionResult,
} from "@bibboy/shared"

export type ResponseStreamPayload = ResponseStreamEvent | ServerNotification

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

type Emit = (event: ResponseStreamPayload) => void
type UnsequencedResponsePayload = DistributiveOmit<ResponseStreamPayload, "sequence_number">

function withSequenceNumber(
  event: UnsequencedResponsePayload,
  sequenceNumber: number
): ResponseStreamPayload {
  return {
    ...event,
    sequence_number: sequenceNumber,
  }
}

const createEmptyUsage = (): ResponseUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
})

function createResponseResource(params: {
  id: string
  model: string
  status: ResponseResource["status"]
  output: ResponseOutputItem[]
  usage?: ResponseUsage
  error?: { code: string; message: string }
  extras?: Partial<ResponseResource>
  createdAt?: number
}): ResponseResource {
  return {
    ...params.extras,
    id: params.id,
    object: "response",
    created_at: params.createdAt ?? Math.floor(Date.now() / 1000),
    status: params.status,
    model: params.model,
    output: params.output,
    usage: params.usage ?? createEmptyUsage(),
    error: params.error,
  }
}

function createMessageItem(params: {
  id: string
  text: string
  status?: "in_progress" | "completed"
}): ResponseOutputItem {
  return {
    type: "message",
    id: params.id,
    role: "assistant",
    content: [{ type: "output_text", text: params.text }],
    status: params.status,
  }
}

function createFunctionCallItem(params: {
  id: string
  callId: string
  name: string
  arguments: string
  status?: "in_progress" | "completed"
}): ResponseFunctionCallItem {
  return {
    type: "function_call",
    id: params.id,
    call_id: params.callId,
    name: params.name,
    arguments: params.arguments,
    status: params.status,
  }
}

function createFunctionCallOutputItem(params: {
  id: string
  callId: string
  output: string
  status?: "in_progress" | "completed"
}): ResponseOutputItem {
  return {
    type: "function_call_output",
    id: params.id,
    call_id: params.callId,
    output: params.output,
    status: params.status,
  }
}

export function createResponsesStreamEmitter(params: {
  model: string
  emit: Emit
  responseId?: string
  responseExtras?: Partial<ResponseResource>
}): {
  responseId: string
  start: () => void
  addTextDelta: (delta: string) => void
  addToolCall: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void
  addToolResult: (toolCallId: string, toolName: string, result: ToolExecutionResult) => void
  complete: (status?: ResponseResource["status"], usage?: ResponseUsage) => void
  fail: (message: string, usage?: ResponseUsage) => void
} {
  const responseId = params.responseId ?? `resp_${crypto.randomUUID()}`
  const messageItemId = `msg_${crypto.randomUUID()}`
  const outputItems: ResponseOutputItem[] = []
  let outputText = ""
  let sequence = 0
  let started = false
  const responseExtras = params.responseExtras ?? {}
  const createdAt = Math.floor(Date.now() / 1000)

  const emitWithSeq = (event: UnsequencedResponsePayload) => {
    sequence += 1
    params.emit(withSequenceNumber(event, sequence))
  }

  const start = () => {
    if (started) return
    started = true

    const initialResponse = createResponseResource({
      id: responseId,
      model: params.model,
      status: "in_progress",
      output: [],
      extras: responseExtras,
      createdAt,
    })

    emitWithSeq({ type: "response.created", response: initialResponse })
    emitWithSeq({ type: "response.in_progress", response: initialResponse })

    const messageItem = createMessageItem({
      id: messageItemId,
      text: "",
      status: "in_progress",
    })
    outputItems[0] = messageItem

    emitWithSeq({
      type: "response.output_item.added",
      output_index: 0,
      item: messageItem,
    })

    emitWithSeq({
      type: "response.content_part.added",
      item_id: messageItemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "" },
    })
  }

  const addTextDelta = (delta: string) => {
    if (!started) start()
    outputText += delta
    emitWithSeq({
      type: "response.output_text.delta",
      item_id: messageItemId,
      output_index: 0,
      content_index: 0,
      delta,
    })
  }

  const addToolCall = (toolCallId: string, toolName: string, args: Record<string, unknown>) => {
    if (!started) start()
    const itemId = `call_${toolCallId}`
    const argsJson = JSON.stringify(args ?? {})
    const item = createFunctionCallItem({
      id: itemId,
      callId: toolCallId,
      name: toolName,
      arguments: "",
      status: "in_progress",
    })
    const outputIndex = outputItems.length
    outputItems.push(item)
    emitWithSeq({
      type: "response.output_item.added",
      output_index: outputIndex,
      item,
    })

    emitWithSeq({
      type: "response.function_call_arguments.delta",
      item_id: itemId,
      output_index: outputIndex,
      delta: argsJson,
    })
    emitWithSeq({
      type: "response.function_call_arguments.done",
      item_id: itemId,
      name: toolName,
      output_index: outputIndex,
      arguments: argsJson,
    })

    const completedItem: ResponseOutputItem = {
      ...item,
      arguments: argsJson,
      status: "completed",
    }

    outputItems[outputIndex] = completedItem
    emitWithSeq({
      type: "response.output_item.done",
      output_index: outputIndex,
      item: completedItem,
    })
  }

  const addToolResult = (toolCallId: string, _toolName: string, result: ToolExecutionResult) => {
    if (!started) start()
    const outputItem = createFunctionCallOutputItem({
      id: `call_output_${toolCallId}`,
      callId: toolCallId,
      output: JSON.stringify(result),
      status: "completed",
    })
    const outputItemIndex = outputItems.length
    outputItems.push(outputItem)

    emitWithSeq({
      type: "response.output_item.added",
      output_index: outputItemIndex,
      item: outputItem,
    })
    emitWithSeq({
      type: "response.output_item.done",
      output_index: outputItemIndex,
      item: outputItem,
    })
  }

  const complete = (status: ResponseResource["status"] = "completed", usage?: ResponseUsage) => {
    if (!started) start()

    emitWithSeq({
      type: "response.output_text.done",
      item_id: messageItemId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    })

    emitWithSeq({
      type: "response.content_part.done",
      item_id: messageItemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: outputText },
    })

    const completedMessage = createMessageItem({
      id: messageItemId,
      text: outputText,
      status: "completed",
    })
    outputItems[0] = completedMessage

    emitWithSeq({
      type: "response.output_item.done",
      output_index: 0,
      item: completedMessage,
    })

    const finalResponse = createResponseResource({
      id: responseId,
      model: params.model,
      status,
      output: outputItems,
      usage,
      extras: {
        ...responseExtras,
        output_text: outputText,
        completed_at: Math.floor(Date.now() / 1000),
      },
      createdAt,
    })

    emitWithSeq({ type: "response.completed", response: finalResponse })
  }

  const fail = (message: string, usage?: ResponseUsage) => {
    if (!started) start()
    const errorResponse = createResponseResource({
      id: responseId,
      model: params.model,
      status: "failed",
      output: outputItems,
      usage,
      error: { code: "api_error", message },
      extras: {
        ...responseExtras,
        output_text: outputText,
        completed_at: Math.floor(Date.now() / 1000),
      },
      createdAt,
    })

    emitWithSeq({ type: "response.failed", response: errorResponse })
    emitWithSeq({ type: "error", error: { code: "api_error", message } })
  }

  return {
    responseId,
    start,
    addTextDelta,
    addToolCall,
    addToolResult,
    complete,
    fail,
  }
}
