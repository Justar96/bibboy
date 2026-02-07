import { memo, useCallback, useState } from "react";
import type { Task, TaskStatus } from "@/hooks/useTaskList";
import { SpinnerIcon, CheckIcon, CloseIcon } from "@/components/Chat/icons";

// ============================================================================
// Types
// ============================================================================

interface TaskSectionProps {
  readonly tasks: Task[];
  readonly pendingCount: number;
  readonly onAddTask: (text: string) => void;
  readonly onUpdateStatus: (id: string, status: TaskStatus) => void;
  readonly onAccept: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly listMaxHeightClass?: string;
}

// ============================================================================
// Task Status Icon
// ============================================================================

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  if (status === "in-progress") {
    return <SpinnerIcon className="w-3 h-3 animate-spin text-[#0066CC]" />;
  }
  if (status === "done") {
    return <CheckIcon className="w-3 h-3 text-emerald-500" />;
  }
  // pending — empty circle
  return <div className="w-3 h-3 rounded-full border border-[#CCCCCC]" />;
}

// ============================================================================
// Task Row
// ============================================================================

const TaskRow = memo(function TaskRow({
  task,
  onCycleStatus,
  onAccept,
  onDismiss,
  onDelete,
}: {
  task: Task;
  onCycleStatus: (id: string, current: TaskStatus) => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isAgentUnaccepted = task.source === "agent" && !task.accepted;

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 rounded-sm transition-colors hover:bg-[#F5F5F5] ${
        task.status === "done" ? "opacity-40" : ""
      }`}
    >
      <button
        onClick={() => onCycleStatus(task.id, task.status)}
        className="shrink-0"
        title={`Status: ${task.status}`}
      >
        <TaskStatusIcon status={task.status} />
      </button>
      <span className="flex-1 font-mono text-[11px] text-[#555555] truncate">{task.text}</span>

      {isAgentUnaccepted ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onAccept(task.id)}
            className="font-mono text-[9px] text-emerald-600 hover:text-emerald-700 px-1"
          >
            Accept
          </button>
          <button
            onClick={() => onDismiss(task.id)}
            className="font-mono text-[9px] text-[#AAAAAA] hover:text-red-500 px-1"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <button
          onClick={() => onDelete(task.id)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete task"
        >
          <CloseIcon className="w-2.5 h-2.5 text-[#CCCCCC] hover:text-red-500" />
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const TaskSection = memo(function TaskSection({
  tasks,
  pendingCount,
  onAddTask,
  onUpdateStatus,
  onAccept,
  onDismiss,
  onDelete,
  listMaxHeightClass = "max-h-[300px]",
}: TaskSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draftTask, setDraftTask] = useState("");

  const cycleStatus = useCallback(
    (id: string, current: TaskStatus) => {
      const next: TaskStatus =
        current === "pending" ? "in-progress" : current === "in-progress" ? "done" : "pending";
      onUpdateStatus(id, next);
    },
    [onUpdateStatus],
  );

  const submitTask = useCallback(() => {
    const next = draftTask.trim();
    if (!next) {
      setIsAdding(false);
      setDraftTask("");
      return;
    }

    onAddTask(next);
    setDraftTask("");
    setIsAdding(false);
  }, [draftTask, onAddTask]);

  // Sort: in-progress → pending → done
  const sorted = [...tasks].sort((a, b) => {
    const order: Record<TaskStatus, number> = { "in-progress": 0, pending: 1, done: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[#F0F0F0] flex items-center gap-2 bg-white">
        <span className="font-mono text-[10px] font-semibold text-[#888888] uppercase tracking-[0.08em]">
          Tasks
        </span>
        {pendingCount > 0 && (
          <span className="font-mono text-[9px] font-semibold text-white bg-[#0066CC] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {pendingCount}
          </span>
        )}
        <div className="ml-auto" />
        <button
          onClick={() => {
            setIsAdding((prev) => !prev);
            setDraftTask("");
          }}
          className="font-mono text-[10px] text-[#888888] hover:text-[#0066CC] transition-colors"
        >
          {isAdding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {isAdding && (
        <div className="px-2 py-2 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draftTask}
              onChange={(event) => setDraftTask(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitTask();
                }
                if (event.key === "Escape") {
                  setIsAdding(false);
                  setDraftTask("");
                }
              }}
              placeholder="Add a task..."
              autoFocus
              className="flex-1 font-mono text-[11px] text-[#555555] border border-[#E5E5E5] bg-[#FAFAFA] rounded-sm px-2 py-1 outline-none focus:border-[#0066CC]"
            />
            <button
              onClick={submitTask}
              className="font-mono text-[10px] text-[#0066CC] hover:text-[#0055AA] transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="flex-1 px-2 py-4 text-center">
          <span className="font-mono text-[10px] text-[#CCCCCC]">No tasks yet</span>
        </div>
      ) : (
        <div className={`${listMaxHeightClass} overflow-y-auto space-y-px sidebar-scroll`}>
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onCycleStatus={cycleStatus}
              onAccept={onAccept}
              onDismiss={onDismiss}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
});
