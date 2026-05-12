import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Badge, Box, Button, Group, MultiSelect, Paper, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { api, type ApiStatus, type ApiTodo, type AppTimeZone } from "../api";
import { formatTimestampLabel } from "../dateTime";
import { getLabelBadgeStyle } from "../labelColors";
import TodoSidePanel from "../ui/TodoSidePanel";

const KANBAN_VISIBLE_STATUS_STORAGE_KEY = "db-learning:kanban-visible-statuses:v2";
const DONE_COLUMN_LIMIT = 10;

function updatedAtTime(todo: ApiTodo) {
  const normalized = `${todo.updatedAt.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isDoneStatus(status: ApiStatus) {
  return status.name.trim().toLowerCase() === "done";
}

function isTodoOverdue(todo: ApiTodo) {
  if (!todo.dueAt || todo.endAt) return false;
  const due = new Date(`${todo.dueAt.length <= 10 ? `${todo.dueAt}T23:59:59` : todo.dueAt.replace(" ", "T")}Z`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function TodoCardContent({ todo, timeZone }: { todo: ApiTodo; timeZone: AppTimeZone }) {
  const hasBadges = todo.labels.length > 0;

  return (
    <>
      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
        <div className="todo-card__content">
          <Text className="todo-card__title">{todo.title}</Text>
          {todo.description ? (
            <Text className="todo-card__description" lineClamp={2}>
              {todo.description}
            </Text>
          ) : null}
        </div>
        {todo.dueAt ? (
          <Badge
            variant={isTodoOverdue(todo) ? "filled" : "light"}
            color={isTodoOverdue(todo) ? "red" : "gray"}
            className="todo-card__due"
          >
            {formatTimestampLabel(todo.dueAt, timeZone)}
          </Badge>
        ) : null}
      </Group>

      <Group gap={5} mt={hasBadges ? "xs" : 0} wrap="wrap">
        {todo.labels.map((label) => (
          <Badge
            key={`${label.id}-${label.name}`}
            size="xs"
            radius="sm"
            variant="filled"
            style={getLabelBadgeStyle(label.color)}
          >
            {label.name}
          </Badge>
        ))}
      </Group>
    </>
  );
}

function DraggableCard({ todo, onEdit, timeZone }: { todo: ApiTodo; onEdit: (todo: ApiTodo) => void; timeZone: AppTimeZone }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `todo:${todo.id}`,
    data: { todo },
  });
  const style: CSSProperties = {
    opacity: isDragging ? 0.28 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onEdit(todo)}
      className="todo-card"
      styles={{ root: { cursor: "grab" } }}
    >
      <TodoCardContent todo={todo} timeZone={timeZone} />
    </Paper>
  );
}

function Column({
  status,
  colId,
  todos,
  onEdit,
  timeZone,
}: {
  status: ApiStatus;
  colId: string;
  todos: ApiTodo[];
  onEdit: (todo: ApiTodo) => void;
  timeZone: AppTimeZone;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${colId}`, data: { statusKey: colId } });
  const overdue = todos.filter(isTodoOverdue).length;

  return (
    <Paper
      ref={setNodeRef}
      className="column-card"
      style={{
        outline: isOver ? "2px solid rgba(212, 102, 44, 0.6)" : undefined,
        outlineOffset: 4,
      }}
    >
      <div className="column-card__header">
        <div>
          <Badge variant="filled" radius="sm" style={getLabelBadgeStyle(status.color)}>
            {status.name}
          </Badge>
          <Text className="column-card__meta">{todos.length} TODO</Text>
        </div>
        {overdue > 0 ? <Badge color="red">{overdue} overdue</Badge> : null}
      </div>

      <Stack gap="sm">
        {todos.length ? (
          todos.map((todo) => <DraggableCard key={todo.id} todo={todo} onEdit={onEdit} timeZone={timeZone} />)
        ) : (
          <div className="empty-state">この状態の TODO はありません。</div>
        )}
      </Stack>
    </Paper>
  );
}

export default function KanbanPage({ selectedProjectId }: { selectedProjectId: number | null }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: lesson } = useQuery({ queryKey: ["lesson"], queryFn: api.lesson });
  const { data: todos = [] } = useQuery({ queryKey: ["todos", selectedProjectId], queryFn: () => api.todos(selectedProjectId) });
  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: api.statuses });
  const [panelOpened, setPanelOpened] = useState(false);
  const [editingTodo, setEditingTodo] = useState<ApiTodo | null>(null);
  const [activeTodo, setActiveTodo] = useState<ApiTodo | null>(null);
  const timeZone = settings?.timeZone ?? "Asia/Tokyo";
  const [visibleStatusKeys, setVisibleStatusKeys] = useState<string[] | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(KANBAN_VISIBLE_STATUS_STORAGE_KEY);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : null;
    } catch {
      return null;
    }
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const statusKey = (status: ApiStatus) => (lesson?.lesson === "a" ? status.name : String(status.id));
  const allStatusKeys = useMemo(() => (statuses as ApiStatus[]).map(statusKey), [lesson?.lesson, statuses]);
  const statusFilterOptions = useMemo(
    () => (statuses as ApiStatus[]).map((status) => ({ value: statusKey(status), label: status.name })),
    [lesson?.lesson, statuses],
  );
  const selectedStatusKeys = useMemo(() => {
    const available = new Set(allStatusKeys);
    const selected = (visibleStatusKeys ?? allStatusKeys).filter((key) => available.has(key));
    return selected.length ? selected : allStatusKeys;
  }, [allStatusKeys, visibleStatusKeys]);
  const visibleStatusKeySet = useMemo(() => new Set(selectedStatusKeys), [selectedStatusKeys]);

  useEffect(() => {
    if (typeof window === "undefined" || visibleStatusKeys == null) return;
    window.localStorage.setItem(KANBAN_VISIBLE_STATUS_STORAGE_KEY, JSON.stringify(visibleStatusKeys));
  }, [visibleStatusKeys]);

  const columns = useMemo(() => {
    const isA = lesson?.lesson === "a";
    const map = new Map<string, ApiTodo[]>();
    const doneColumnKeys = new Set((statuses as ApiStatus[]).filter(isDoneStatus).map((status) => (isA ? status.name : String(status.id))));
    if (isA) {
      for (const status of statuses) {
        if (visibleStatusKeySet.has(status.name)) map.set(status.name, []);
      }
      for (const todo of todos) {
        const key = todo.status;
        if (!visibleStatusKeySet.has(key)) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(todo);
      }
    } else {
      for (const status of statuses) {
        const key = String(status.id);
        if (visibleStatusKeySet.has(key)) map.set(key, []);
      }
      for (const todo of todos) {
        const key = String(todo.statusId ?? "");
        if (!visibleStatusKeySet.has(key)) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(todo);
      }
    }

    for (const [key, list] of map) {
      if (doneColumnKeys.has(key)) {
        list.sort((a, b) => updatedAtTime(b) - updatedAtTime(a) || b.id - a.id);
        if (list.length > DONE_COLUMN_LIMIT) list.splice(DONE_COLUMN_LIMIT);
      } else {
        list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      }
    }
    return map;
  }, [lesson?.lesson, statuses, todos, visibleStatusKeySet]);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patchTodo(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: ["todos"] });
      const previousTodos = qc.getQueriesData<ApiTodo[]>({ queryKey: ["todos"] });

      for (const [queryKey, queryTodos] of previousTodos) {
        if (!queryTodos) continue;
        qc.setQueryData<ApiTodo[]>(
          queryKey,
          queryTodos.map((todo) => (todo.id === id ? { ...todo, ...body } : todo)),
        );
      }

      return { previousTodos };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, queryTodos] of context?.previousTodos ?? []) {
        qc.setQueryData(queryKey, queryTodos);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });

  const onDragStart = (event: DragStartEvent) => {
    setActiveTodo((event.active.data.current?.todo as ApiTodo | undefined) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const todo = event.active.data.current?.todo as ApiTodo | undefined;
    const overStatusKey = event.over?.data.current?.statusKey as string | undefined;
    setActiveTodo(null);
    if (!todo || !overStatusKey || !lesson) return;

    if (lesson.lesson === "a") {
      if (todo.status === overStatusKey) return;
      patch.mutate({ id: todo.id, body: { status: overStatusKey } });
      return;
    }

    const newStatusId = Number(overStatusKey);
    if (Number.isNaN(newStatusId) || todo.statusId === newStatusId) return;
    patch.mutate({ id: todo.id, body: { statusId: newStatusId } });
  };

  const onDragCancel = () => setActiveTodo(null);

  const total = todos.length;
  const overdue = todos.filter(isTodoOverdue).length;
  const handleCreate = () => {
    setEditingTodo(null);
    setPanelOpened(true);
  };
  const handleEdit = (todo: ApiTodo) => {
    setEditingTodo(todo);
    setPanelOpened(true);
  };
  const handleClosePanel = () => {
    setPanelOpened(false);
    setEditingTodo(null);
  };

  return (
    <div className="page-stack">
      <div className="page-actions kanban-header">
        <div className="page-intro">
          <Text className="page-intro__title">TODO</Text>
          <Text className="page-intro__copy">
            {total}件{overdue > 0 ? ` / 期限超過 ${overdue}件` : ""}
          </Text>
        </div>
        <Button size="sm" radius="sm" onClick={handleCreate}>
          TODO を追加
        </Button>
      </div>

      <Paper className="kanban-controls" p="sm" radius="sm">
        <MultiSelect
          label="カンバンに表示するステータス"
          data={statusFilterOptions}
          value={selectedStatusKeys}
          onChange={(values) => setVisibleStatusKeys(values)}
          clearable
          searchable={false}
          disabled={statusFilterOptions.length === 0}
        />
      </Paper>

      {patch.isError ? (
        <Alert color="red" title="更新に失敗しました">
          {String((patch.error as Error).message)}
        </Alert>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <Box className="board">
          {(statuses as ApiStatus[]).map((status) => {
            const colId = statusKey(status);
            if (!visibleStatusKeySet.has(colId)) return null;
            const list = columns.get(colId) ?? [];
            return <Column key={colId} colId={colId} status={status} todos={list} onEdit={handleEdit} timeZone={timeZone} />;
          })}
        </Box>
        <DragOverlay zIndex={1000} dropAnimation={null}>
          {activeTodo ? (
            <Paper className="todo-card todo-card--overlay" styles={{ root: { cursor: "grabbing" } }}>
              <TodoCardContent todo={activeTodo} timeZone={timeZone} />
            </Paper>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TodoSidePanel opened={panelOpened} todo={editingTodo} selectedProjectId={selectedProjectId} onClose={handleClosePanel} />
    </div>
  );
}
