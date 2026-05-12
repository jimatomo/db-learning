import { Badge, Box, Button, Group, MultiSelect, Paper, Select, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo, useState } from "react";
import { api, type ApiIteration, type ApiTodo, type AppTimeZone } from "../api";
import { formatTimestampLabel } from "../dateTime";
import { getLabelBadgeStyle } from "../labelColors";
import TodoSidePanel from "../ui/TodoSidePanel";

const NO_ITERATION_FILTER = "__none__";

function buildTree(todos: ApiTodo[]) {
  const byParent = new Map<number | null, ApiTodo[]>();
  for (const todo of todos) {
    const parent = todo.parentId ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)?.push(todo);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }
  return byParent;
}

function countChildren(byParent: Map<number | null, ApiTodo[]>, id: number): number {
  const children = byParent.get(id) ?? [];
  return children.reduce((sum, child) => sum + 1 + countChildren(byParent, child.id), 0);
}

function maxDepth(byParent: Map<number | null, ApiTodo[]>, parentId: number | null, depth: number): number {
  const children = byParent.get(parentId) ?? [];
  if (!children.length) return depth;
  return Math.max(...children.map((child) => maxDepth(byParent, child.id, depth + 1)));
}

function isTodoDone(todo: ApiTodo) {
  return Boolean(todo.endAt) || /done|closed|complete/i.test(todo.status);
}

function isTodoOverdue(todo: ApiTodo) {
  if (!todo.dueAt || isTodoDone(todo)) return false;
  const due = new Date(todo.dueAt.length <= 10 ? `${todo.dueAt}T23:59:59` : todo.dueAt.replace(" ", "T"));
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function matchesSearch(todo: ApiTodo, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [todo.title, todo.description, todo.status, String(todo.id), ...todo.labels.map((label) => label.name)]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalized));
}

function Rows({
  byParent,
  parentId,
  depth,
  onEdit,
  matchingIds,
  filtersActive,
  statusColors,
  iterationNames,
  timeZone,
}: {
  byParent: Map<number | null, ApiTodo[]>;
  parentId: number | null;
  depth: number;
  onEdit: (todo: ApiTodo) => void;
  matchingIds: Set<number>;
  filtersActive: boolean;
  statusColors: Map<string, string>;
  iterationNames: Map<number, string>;
  timeZone: AppTimeZone;
}) {
  const rows = byParent.get(parentId) ?? [];

  return (
    <>
      {rows.map((todo) => {
        const isMatch = matchingIds.has(todo.id);
        return (
          <Box key={todo.id} className={`backlog-tree${filtersActive && !isMatch ? " backlog-tree--context" : ""}`}>
            <button
              type="button"
              className={`backlog-row${filtersActive && isMatch ? " backlog-row--match" : ""}`}
              onClick={() => onEdit(todo)}
            >
              <div className="backlog-row__inner" style={{ "--depth": depth } as CSSProperties}>
                <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                  <div className="backlog-row__primary">
                    <div className="backlog-row__title-line">
                      <Text className="backlog-row__title" fw={700} size="sm">
                        {todo.title}
                      </Text>
                      <Badge variant="light" color="gray" size="xs">
                        #{todo.id}
                      </Badge>
                      <Badge variant="filled" size="xs" style={getLabelBadgeStyle(statusColors.get(todo.status))}>
                        {todo.status}
                      </Badge>
                    </div>
                    {todo.description ? (
                      <Text size="sm" c="dimmed" mt={6} lineClamp={2}>
                        {todo.description}
                      </Text>
                    ) : null}
                  </div>
                  <div className="backlog-row__children">{countChildren(byParent, todo.id)} child</div>
                </Group>

                <Group gap={6} mt={10} wrap="wrap">
                  {todo.plannedStartAt ? (
                    <Badge size="xs" variant="light" color="blue">
                      開始予定 {formatTimestampLabel(todo.plannedStartAt, timeZone)}
                    </Badge>
                  ) : null}
                  {todo.iterationId != null ? (
                    <Badge size="xs" variant="light" color="violet">
                      {iterationNames.get(todo.iterationId) ?? `Iteration #${todo.iterationId}`}
                    </Badge>
                  ) : null}
                  {todo.startAt ? (
                    <Badge size="xs" variant="light" color="cyan">
                      開始 {formatTimestampLabel(todo.startAt, timeZone)}
                    </Badge>
                  ) : null}
                  {todo.dueAt ? (
                    <Badge size="xs" variant="light" color="yellow">
                      期限 {formatTimestampLabel(todo.dueAt, timeZone)}
                    </Badge>
                  ) : null}
                  {todo.endAt ? (
                    <Badge size="xs" variant="light" color="green">
                      終了 {formatTimestampLabel(todo.endAt, timeZone)}
                    </Badge>
                  ) : null}
                  {todo.labels.map((label) => (
                    <Badge key={`${label.id}-${label.name}`} size="xs" variant="filled" style={getLabelBadgeStyle(label.color)}>
                      {label.name}
                    </Badge>
                  ))}
                </Group>
              </div>
            </button>
                <Rows
                  byParent={byParent}
                  parentId={todo.id}
                  depth={depth + 1}
                  onEdit={onEdit}
                  matchingIds={matchingIds}
                  filtersActive={filtersActive}
                  statusColors={statusColors}
                  iterationNames={iterationNames}
                  timeZone={timeZone}
                />
          </Box>
        );
      })}
    </>
  );
}

export default function BacklogPage({ selectedProjectId }: { selectedProjectId: number | null }) {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: todos = [] } = useQuery({ queryKey: ["todos", selectedProjectId], queryFn: () => api.todos(selectedProjectId) });
  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: api.statuses });
  const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: api.labels });
  const { data: iterations = [] } = useQuery({ queryKey: ["iterations"], queryFn: api.iterations });
  const [panelOpened, setPanelOpened] = useState(false);
  const [editingTodo, setEditingTodo] = useState<ApiTodo | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [iterationFilter, setIterationFilter] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [filtersOpened, setFiltersOpened] = useState(false);
  const allTodos = todos as ApiTodo[];
  const timeZone = settings?.timeZone ?? "Asia/Tokyo";

  const matchingTodos = useMemo(() => {
    return allTodos.filter((todo) => {
      if (!matchesSearch(todo, query)) return false;
      if (statusFilter && todo.status !== statusFilter) return false;
      if (iterationFilter === NO_ITERATION_FILTER && todo.iterationId != null) return false;
      if (iterationFilter && iterationFilter !== NO_ITERATION_FILTER && String(todo.iterationId ?? "") !== iterationFilter) return false;
      if (labelFilter.length && !labelFilter.every((labelName) => todo.labels.some((label) => label.name === labelName))) return false;
      if (dateFilter === "overdue" && !isTodoOverdue(todo)) return false;
      if (dateFilter === "unscheduled" && (todo.plannedStartAt || todo.startAt || todo.dueAt || todo.endAt)) return false;
      if (dateFilter === "done" && !isTodoDone(todo)) return false;
      if (dateFilter === "open" && isTodoDone(todo)) return false;
      return true;
    });
  }, [allTodos, dateFilter, iterationFilter, labelFilter, query, statusFilter]);

  const matchingIds = useMemo(() => new Set(matchingTodos.map((todo) => todo.id)), [matchingTodos]);
  const filtersActive = Boolean(query.trim() || statusFilter || iterationFilter || labelFilter.length || dateFilter);
  const visibleTodos = useMemo(() => {
    if (!filtersActive) return allTodos;
    const byId = new Map(allTodos.map((todo) => [todo.id, todo]));
    const included = new Set<number>();
    for (const todo of matchingTodos) {
      let current: ApiTodo | undefined = todo;
      while (current) {
        included.add(current.id);
        current = current.parentId == null ? undefined : byId.get(current.parentId);
      }
    }
    return allTodos.filter((todo) => included.has(todo.id));
  }, [allTodos, filtersActive, matchingTodos]);

  const byParent = useMemo(() => buildTree(visibleTodos), [visibleTodos]);
  const statusColors = useMemo(() => new Map(statuses.map((status) => [status.name, status.color])), [statuses]);
  const iterationNames = useMemo(
    () => new Map((iterations as ApiIteration[]).map((iteration) => [iteration.id, iteration.name])),
    [iterations],
  );

  const roots = byParent.get(null) ?? [];
  const depthCount = maxDepth(byParent, null, 0);
  const statusData = useMemo(
    () => statuses.map((status) => ({ value: status.name, label: status.name })),
    [statuses],
  );
  const labelData = useMemo(
    () => labels.map((label) => ({ value: label.name, label: label.name })),
    [labels],
  );
  const iterationData = useMemo(
    () => [
      { value: NO_ITERATION_FILTER, label: "なし" },
      ...(iterations as ApiIteration[]).map((iteration) => ({ value: String(iteration.id), label: iteration.name })),
    ],
    [iterations],
  );
  const clearFilters = () => {
    setQuery("");
    setStatusFilter(null);
    setIterationFilter(null);
    setLabelFilter([]);
    setDateFilter(null);
  };
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
      <div className="page-toolbar">
        <div>
          <Text className="page-toolbar__title">Backlog</Text>
          <Text className="page-toolbar__meta">
            {filtersActive ? `${matchingTodos.length} matched / ` : ""}
            {visibleTodos.length} items / {roots.length} roots / depth {depthCount}
          </Text>
        </div>
        <Button size="sm" radius="sm" onClick={handleCreate}>
          TODO を追加
        </Button>
      </div>

      <Paper className={`backlog-filter${filtersOpened ? " backlog-filter--open" : ""}`} p="xs">
        <div className="backlog-filter__summary">
          <Text className="backlog-filter__title">
            フィルター{filtersActive ? ` (${matchingTodos.length})` : ""}
          </Text>
          <Button size="xs" variant="subtle" color="gray" onClick={() => setFiltersOpened((opened) => !opened)}>
            {filtersOpened ? "閉じる" : "開く"}
          </Button>
        </div>
        <div className="backlog-filter__body">
          <TextInput
            aria-label="検索"
            placeholder="検索"
            size="xs"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Select
            aria-label="状態"
            placeholder="状態"
            data={statusData}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            size="xs"
          />
          <Select
            aria-label="イテレーション"
            placeholder="イテレーション"
            data={iterationData}
            value={iterationFilter}
            onChange={setIterationFilter}
            clearable
            size="xs"
          />
          <MultiSelect
            aria-label="ラベル"
            placeholder="ラベル"
            data={labelData}
            value={labelFilter}
            onChange={setLabelFilter}
            clearable
            size="xs"
          />
          <Select
            aria-label="期限"
            placeholder="期限"
            data={[
              { value: "open", label: "未完了" },
              { value: "overdue", label: "期限超過" },
              { value: "unscheduled", label: "日付なし" },
              { value: "done", label: "完了" },
            ]}
            value={dateFilter}
            onChange={setDateFilter}
            clearable
            size="xs"
          />
          <Button size="xs" variant="light" color="gray" onClick={clearFilters} disabled={!filtersActive}>
            クリア
          </Button>
        </div>
      </Paper>

      <div className="backlog-list">
        {visibleTodos.length ? (
      <Rows
        byParent={byParent}
        parentId={null}
        depth={0}
        onEdit={handleEdit}
        matchingIds={matchingIds}
        filtersActive={filtersActive}
        statusColors={statusColors}
        iterationNames={iterationNames}
        timeZone={timeZone}
      />
        ) : (
          <div className="empty-state">{filtersActive ? "条件に一致する TODO はありません。" : "まだ TODO がありません。追加するとここに階層表示されます。"}</div>
        )}
      </div>

      <TodoSidePanel opened={panelOpened} todo={editingTodo} selectedProjectId={selectedProjectId} onClose={handleClosePanel} />
    </div>
  );
}
