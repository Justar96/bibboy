type EventCallback = (...args: unknown[]) => void

class EventBusClass {
  private readonly listeners = new Map<string, EventCallback[]>()

  on(event: string, callback: EventCallback): this {
    const list = this.listeners.get(event) ?? []
    list.push(callback)
    this.listeners.set(event, list)
    return this
  }

  off(event: string, callback: EventCallback): this {
    const list = this.listeners.get(event)
    if (list) {
      this.listeners.set(event, list.filter(cb => cb !== callback))
    }
    return this
  }

  emit(event: string, ...args: unknown[]): this {
    const list = this.listeners.get(event)
    if (list) {
      for (const cb of list) cb(...args)
    }
    return this
  }

  removeAllListeners(): this {
    this.listeners.clear()
    return this
  }
}

export const EventBus = new EventBusClass()
