import { useEffect, useMemo, lazy, Suspense } from "react";
import { useLayoutNav } from "@/components/MainLayout";
import { useWebSocketChat } from "@/hooks/useWebSocketChat";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useTaskList } from "@/hooks/useTaskList";
import { useAutoIngestTaskSuggestions } from "@/hooks/task-suggest-ingestion";
import { SIDEBAR_AGENT_CONFIG } from "@/components/RightSidebar";
import type { LeftSidebarData } from "@/components/LeftSidebar";

// Lazy-load PhaserChat so the full Phaser engine (~1.2 MB) is only
// downloaded when the user lands on the index tab.
const PhaserChat = lazy(() =>
  import("@bibboy/phaser-chat").then((m) => ({ default: m.PhaserChat })),
);

// ============================================================================
// Main Component
// ============================================================================

export function HomePage() {
  const { setSidebarMode, setAgentConfigData, setLeftSidebarData } = useLayoutNav();
  const wsChat = useWebSocketChat({ autoConnect: true });

  const { connectionState } = wsChat;

  // Set sidebar mode to agent config
  useEffect(() => {
    setSidebarMode(SIDEBAR_AGENT_CONFIG);
    return () => setSidebarMode({ type: "none" });
  }, [setSidebarMode]);

  // Push agent config data to sidebar context
  useEffect(() => {
    setAgentConfigData({
      soulState: wsChat.soulState,
      soulStage: wsChat.soulStage ?? "orb",
      connectionState,
    });
  }, [wsChat.soulState, wsChat.soulStage, connectionState, setAgentConfigData]);

  // ------------------------------------------------------------------
  // Activity Log + Task List → Left Sidebar
  // ------------------------------------------------------------------

  const activityGroups = useActivityLog({
    messages: wsChat.messages,
    activeTools: wsChat.activeTools,
    isTyping: wsChat.isTyping,
    typingState: wsChat.typingState,
    isCompacting: wsChat.isCompacting,
  });

  const taskList = useTaskList();
  useAutoIngestTaskSuggestions({
    activeTools: wsChat.activeTools,
    ingestSuggestedTasks: taskList.ingestSuggestedTasks,
  });

  const leftSidebarData = useMemo<LeftSidebarData>(
    () => ({
      activityGroups,
      tasks: taskList.tasks,
      pendingCount: taskList.pendingCount,
      onAddTask: taskList.addTask,
      onUpdateStatus: taskList.updateStatus,
      onAcceptTask: taskList.acceptTask,
      onDismissTask: taskList.dismissTask,
      onDeleteTask: taskList.deleteTask,
    }),
    [activityGroups, taskList],
  );

  useEffect(() => {
    setLeftSidebarData(leftSidebarData);
    return () => setLeftSidebarData(null);
  }, [leftSidebarData, setLeftSidebarData]);

  return (
    <Suspense fallback={<div className="w-full h-[300px]" />}>
      <PhaserChat
        chatAdapter={wsChat}
        connectionState={connectionState}
        canvasBlueprint={wsChat.canvasBlueprint}
        canvasVersion={wsChat.canvasVersion}
        lastCanvasOp={wsChat.lastCanvasOp}
        soulState={wsChat.soulState}
        soulStage={wsChat.soulStage}
      />
    </Suspense>
  );
}
