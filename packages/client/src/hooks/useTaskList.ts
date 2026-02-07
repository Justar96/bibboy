import { useState, useCallback, useEffect } from "react"

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "pending" | "in-progress" | "done"
export type TaskSource = "user" | "agent"

export interface Task {
  readonly id: string
  readonly text: string
  readonly status: TaskStatus
  readonly source: TaskSource
  readonly createdAt: number
  readonly accepted?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "bibboy-tasks"

// ============================================================================
// Helpers
// ============================================================================

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Task[]) : []
  } catch {
    return []
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

// ============================================================================
// Hook
// ============================================================================

export function useTaskList() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  const addTask = useCallback((text: string, source: TaskSource = "user") => {
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      status: "pending",
      source,
      createdAt: Date.now(),
      accepted: source === "user" ? true : undefined,
    }
    setTasks((prev) => [task, ...prev])
    return task.id
  }, [])

  const updateStatus = useCallback((id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
  }, [])

  const acceptTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, accepted: true } : t)))
  }, [])

  const dismissTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pendingCount = tasks.filter(
    (t) => t.status !== "done" && (t.source === "user" || t.accepted)
  ).length

  return { tasks, addTask, updateStatus, acceptTask, dismissTask, deleteTask, pendingCount }
}
