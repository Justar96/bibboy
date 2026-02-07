import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActivitySection } from "@/components/LeftSidebar/ActivitySection";
import { TaskSection } from "@/components/LeftSidebar/TaskSection";
import type { ActivityGroup } from "@/hooks/useActivityLog";
import type { Task } from "@/hooks/useTaskList";

function makeGroup(messageId: string, userText: string, actionName: string): ActivityGroup {
  return {
    messageId,
    userText,
    timestamp: Date.now(),
    actions: [
      {
        id: `${messageId}_action`,
        type: "tool",
        name: actionName,
        status: "completed",
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        details: { q: userText },
      },
    ],
  };
}

describe("ActivitySection", () => {
  it("auto-expands newest query and collapses older ones when a new query appears", () => {
    const first = makeGroup("m1", "first query", "first action");
    const second = makeGroup("m2", "second query", "second action");

    const { rerender } = render(<ActivitySection groups={[first]} />);

    expect(screen.getByText("first action")).toBeInTheDocument();

    rerender(<ActivitySection groups={[first, second]} />);

    expect(screen.queryByText("first action")).not.toBeInTheDocument();
    expect(screen.getByText("second action")).toBeInTheDocument();
  });

  it("lets the user manually collapse and expand query groups", () => {
    const first = makeGroup("m1", "first query", "first action");
    const second = makeGroup("m2", "second query", "second action");

    render(<ActivitySection groups={[first, second]} />);

    fireEvent.click(screen.getByRole("button", { name: /second query/i }));
    expect(screen.queryByText("second action")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /first query/i }));
    expect(screen.getByText("first action")).toBeInTheDocument();
  });

  it("is not section-collapsible via an Activity header button", () => {
    render(<ActivitySection groups={[]} />);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^activity$/i })).toBeNull();
  });
});

describe("TaskSection", () => {
  const tasks: Task[] = [
    {
      id: "t1",
      text: "Agent suggestion",
      status: "pending",
      source: "agent",
      createdAt: Date.now(),
    },
  ];

  it("is not section-collapsible via a Tasks header button", () => {
    render(
      <TaskSection
        tasks={tasks}
        pendingCount={1}
        onAddTask={vi.fn()}
        onUpdateStatus={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^tasks$/i })).toBeNull();
  });
});
