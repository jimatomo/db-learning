import { Badge, Box, Group, Paper, Select, SimpleGrid, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { api, type ApiIteration, type ApiStatus, type ApiTodo, type AppTimeZone } from "../api";
import { formatTimestampLabel } from "../dateTime";

type IterationTrendPoint = {
  iterationId: number;
  iterationName: string;
  startsAt: string | null;
  endsAt: string | null;
  total: number;
  completed: number;
  started: number;
};

type ReplayEvent = {
  id: number;
  todoId: number | null;
  eventType: string;
  fieldName: string | null;
  fromValue: string | null;
  toValue: string | null;
  occurredAt: string;
  actor: string | null;
  projectId: number | null;
};

type NoteDiffPreview = {
  kind: "changed" | "added" | "removed";
  line: number;
  from?: string;
  to?: string;
};

type NoteDiffEvent = {
  format: "note-diff/v1";
  summary: string;
  startLine: number;
  stats: {
    added: number;
    removed: number;
    changed: number;
    fromLines: number;
    toLines: number;
  };
  preview: NoteDiffPreview[];
  truncated: boolean;
};

type TicketAnalysis = {
  todo: ApiTodo;
  events: ReplayEvent[];
  statusEvents: ReplayEvent[];
  updateEvents: ReplayEvent[];
  cycleHours: number | null;
  touchedFields: string[];
};

export default function InsightsPage({ selectedProjectId }: { selectedProjectId: number | null }) {
  const { data: iterations = [] } = useQuery({ queryKey: ["iterations"], queryFn: api.iterations });
  const { data: lesson } = useQuery({ queryKey: ["lesson"], queryFn: api.lesson });
  const { data: todos = [] } = useQuery({ queryKey: ["todos", selectedProjectId], queryFn: () => api.todos(selectedProjectId) });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: api.statuses });
  const [iterId, setIterId] = useState<string | null>(null);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const timeZone = settings?.timeZone ?? "Asia/Tokyo";

  const iteration = useMemo(() => {
    if (iterId != null) {
      const id = Number(iterId);
      return iterations.find((item) => item.id === id) ?? iterations[0];
    }
    return iterations[0];
  }, [iterId, iterations]);

  const id = iteration?.id;
  const { data: insight } = useQuery({
    queryKey: ["insights", id, selectedProjectId],
    queryFn: () => api.insights(id!, selectedProjectId),
    enabled: id != null,
  });
  const { data: trendData } = useQuery({
    queryKey: ["iteration-trends", selectedProjectId],
    queryFn: () => api.iterationTrends(selectedProjectId),
  });
  const { data: replayData } = useQuery({
    queryKey: ["replay", id, selectedProjectId],
    queryFn: () => api.replay(id!, selectedProjectId),
    enabled: id != null && lesson?.lesson === "c",
  });

  const events = replayData?.events ?? [];
  useEffect(() => {
    setSelectedTodoId(null);
  }, [id, selectedProjectId]);

  const iterSelectData = useMemo(
    () => (iterations as ApiIteration[]).map((item) => ({ value: String(item.id), label: item.name })),
    [iterations],
  );
  const completionTimes = insight?.completionTimes ?? [];
  const completionByTodoId = useMemo(() => new Map(completionTimes.map((item) => [item.todoId, item])), [completionTimes]);
  const trendRows = useMemo(() => [...(trendData?.iterations ?? [])].sort(compareTrendRowsChronologically), [trendData?.iterations]);
  const completedTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.iterationId === id && (todo.endAt != null || todo.status.toLowerCase() === "done"))
        .sort((a, b) => {
          const aEnd = a.endAt ?? a.updatedAt ?? "";
          const bEnd = b.endAt ?? b.updatedAt ?? "";
          if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
          return a.sortOrder - b.sortOrder || a.id - b.id;
        }),
    [id, todos],
  );
  const eventGroups = useMemo(() => groupEventsByTodo(events), [events]);
  const ticketAnalyses = useMemo(
    () =>
      completedTodos.map((todo) => {
        const ticketEvents = eventGroups.get(todo.id) ?? [];
        const completion = completionByTodoId.get(todo.id);
        return {
          todo,
          events: ticketEvents,
          statusEvents: ticketEvents.filter(isProgressionEvent),
          updateEvents: ticketEvents.filter((event) => !isProgressionEvent(event)),
          cycleHours:
            completion?.durationHours ??
            (todo.startAt && todo.endAt ? hoursBetween(todo.startAt, todo.endAt) : null),
          touchedFields: summarizeTouchedFields(ticketEvents),
        };
      }),
    [completedTodos, completionByTodoId, eventGroups],
  );
  const selectedTicket = useMemo(() => {
    if (!ticketAnalyses.length) return null;
    const selectedId = selectedTodoId == null ? null : Number(selectedTodoId);
    return ticketAnalyses.find((ticket) => ticket.todo.id === selectedId) ?? ticketAnalyses[0];
  }, [selectedTodoId, ticketAnalyses]);
  const ticketSelectData = useMemo(
    () => ticketAnalyses.map((ticket) => ({ value: String(ticket.todo.id), label: `#${ticket.todo.id} ${ticket.todo.title}` })),
    [ticketAnalyses],
  );
  const selectedTrend = trendRows.find((row) => row.iterationId === id);
  const ticketsWithCycleTime = ticketAnalyses.filter((item) => item.cycleHours != null);
  const averageCompletionHours = ticketsWithCycleTime.length
    ? ticketsWithCycleTime.reduce((sum, item) => sum + (item.cycleHours ?? 0), 0) / ticketsWithCycleTime.length
    : null;
  const longestCycle = ticketAnalyses.reduce<TicketAnalysis | null>((max, item) => {
    if (item.cycleHours == null) return max;
    if (max == null || (max.cycleHours ?? 0) < item.cycleHours) return item;
    return max;
  }, null);

  return (
    <div className="page-stack">
      <div className="page-actions">
        <div className="page-intro">
          <Text className="page-intro__title">Insights and trends</Text>
          <Text className="page-intro__copy">完了チケット単位で、ステータスの進み方と更新イベントを時系列に探索します。</Text>
        </div>
      </div>

      <Paper className="panel-card" p="lg" radius="sm">
        <Group justify="space-between" align="flex-start" gap="lg" mb="md">
          <div>
            <Title order={3}>Completion trend</Title>
            <Text size="sm" c="dimmed" mt={4}>
              イテレーションごとの総タスク数と完了タスク数を並べて、進捗の偏りや伸びを確認できます。
            </Text>
          </div>
        </Group>
        <CompletionTrendChart rows={trendRows} selectedIterationId={id ?? null} />
      </Paper>

      <Paper className="panel-card" p="lg" radius="sm">
        <Group justify="space-between" align="flex-end" gap="lg" mb="lg">
          <div>
            <Title order={3}>Iteration drilldown</Title>
            <Text size="sm" c="dimmed" mt={4}>
              イテレーション全体の分析は完了チケットを母数にして集計します。
            </Text>
          </div>
          <Select
            label="イテレーション"
            data={iterSelectData}
            value={iteration ? String(iteration.id) : null}
            onChange={(value: string | null) => {
              setIterId(value);
              setSelectedTodoId(null);
            }}
            maw={360}
          />
        </Group>

        <div className="insight-kpi-grid">
          <InsightKpi label="完了チケット" value={`${ticketAnalyses.length}`} hint={`総数 ${selectedTrend?.total ?? 0} 件`} />
          <InsightKpi
            label="平均完了時間"
            value={averageCompletionHours == null || Number.isNaN(averageCompletionHours) ? "-" : formatDurationHours(averageCompletionHours)}
            hint="start_at から end_at まで"
          />
          <InsightKpi label="イベント数" value={`${selectedTicket?.events.length ?? 0}`} hint="選択中チケットの更新履歴" />
          <InsightKpi
            label="最長チケット"
            value={longestCycle?.cycleHours == null ? "-" : formatDurationHours(longestCycle.cycleHours)}
            hint={longestCycle ? `#${longestCycle.todo.id} ${longestCycle.todo.title}` : "対象なし"}
          />
        </div>

        {lesson?.lesson !== "c" ? (
          <div className="empty-state">チケット別のイベント探索は Lesson C で利用できます。</div>
        ) : (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mt="lg">
            <div className="ticket-browser">
              <Group justify="space-between" align="flex-end" mb="md">
                <div>
                  <Title order={4}>Completed tickets</Title>
                  <Text size="xs" c="dimmed">
                    完了済みだけを表示しています。
                  </Text>
                </div>
                <Select
                  label="チケット"
                  data={ticketSelectData}
                  value={selectedTicket ? String(selectedTicket.todo.id) : null}
                  onChange={setSelectedTodoId}
                  searchable
                  clearable={false}
                  maw={320}
                />
              </Group>
              <Box className="ticket-list">
                {ticketAnalyses.length ? (
                  ticketAnalyses.map((ticket) => (
                    <button
                      key={ticket.todo.id}
                      type="button"
                      className={`ticket-list__item${selectedTicket?.todo.id === ticket.todo.id ? " ticket-list__item--active" : ""}`}
                      onClick={() => setSelectedTodoId(String(ticket.todo.id))}
                    >
                      <span className="ticket-list__topline">
                        <span className="ticket-list__title">#{ticket.todo.id} {ticket.todo.title}</span>
                        <Badge size="sm" radius="sm" variant="light" color="green">
                          {ticket.todo.status}
                        </Badge>
                      </span>
                      <span className="ticket-list__meta">
                        <span>{ticket.cycleHours == null ? "duration -" : formatDurationHours(ticket.cycleHours)}</span>
                        <span>{ticket.statusEvents.length} status moves</span>
                        <span>{ticket.updateEvents.length} updates</span>
                      </span>
                      <span className="ticket-list__fields">{ticket.touchedFields.length ? ticket.touchedFields.join(", ") : "イベント記録なし"}</span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">このイテレーションに完了チケットはありません。</div>
                )}
              </Box>
            </div>

            <TicketTimeline ticket={selectedTicket} timeZone={timeZone} statuses={statuses} />
          </SimpleGrid>
        )}
      </Paper>
    </div>
  );
}

function trendDateKey(row: IterationTrendPoint) {
  return row.startsAt ?? row.endsAt ?? "";
}

function compareTrendRowsChronologically(a: IterationTrendPoint, b: IterationTrendPoint) {
  const aDate = trendDateKey(a);
  const bDate = trendDateKey(b);
  if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
  if (aDate !== bDate) return aDate ? -1 : 1;
  return a.iterationId - b.iterationId;
}

function formatDurationHours(hours: number) {
  if (!Number.isFinite(hours)) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (days > 0 && remainingHours > 0) return `${days}d ${remainingHours}h`;
  if (days > 0) return `${days}d`;
  return `${Math.round(hours)}h`;
}

function hoursBetween(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 1000 / 60 / 60;
}

function groupEventsByTodo(events: ReplayEvent[]) {
  const grouped = new Map<number, ReplayEvent[]>();
  for (const event of events) {
    if (event.todoId == null) continue;
    const bucket = grouped.get(event.todoId) ?? [];
    bucket.push(event);
    grouped.set(event.todoId, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id);
  }
  return grouped;
}

function isProgressionEvent(event: ReplayEvent) {
  return event.eventType === "status_change" || event.eventType === "sub_status_change";
}

function isStatusChangeEvent(event: ReplayEvent) {
  return event.eventType === "status_change" && event.fieldName === "status";
}

function statusKey(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function summarizeTouchedFields(events: ReplayEvent[]) {
  const fields = new Set<string>();
  for (const event of events) fields.add(fieldLabel(event.fieldName ?? event.eventType));
  return [...fields].slice(0, 4);
}

function fieldLabel(value: string) {
  if (value === "description") return "note";
  return value;
}

function eventLabel(event: ReplayEvent) {
  if (event.eventType === "create") return "作成";
  if (event.eventType === "status_change") return "ステータス変更";
  if (event.eventType === "sub_status_change") return "サブステータス変更";
  if (event.eventType === "label_add") return "ラベル追加";
  if (event.eventType === "label_remove") return "ラベル削除";
  if (event.eventType.endsWith("_change")) return `${fieldLabel(event.fieldName ?? event.eventType)} 変更`;
  return event.fieldName ? `${fieldLabel(event.fieldName)} 更新` : event.eventType;
}

function eventTone(event: ReplayEvent) {
  if (event.eventType === "create") return "create";
  if (isProgressionEvent(event)) return "progress";
  if (event.fieldName === "description") return "note";
  if (event.eventType.startsWith("label_")) return "label";
  return "field";
}

function eventToneLabel(tone: ReturnType<typeof eventTone>) {
  if (tone === "create") return "作成";
  if (tone === "progress") return "進行";
  if (tone === "note") return "ノート";
  if (tone === "label") return "ラベル";
  return "項目";
}

function parseNoteDiff(event: ReplayEvent): NoteDiffEvent | null {
  if (event.fieldName !== "description" || !event.toValue) return null;
  try {
    const parsed = JSON.parse(event.toValue) as Partial<NoteDiffEvent>;
    if (parsed.format !== "note-diff/v1" || typeof parsed.summary !== "string" || !Array.isArray(parsed.preview)) return null;
    return parsed as NoteDiffEvent;
  } catch {
    return null;
  }
}

function EventValue({ event }: { event: ReplayEvent }) {
  const noteDiff = parseNoteDiff(event);
  if (!noteDiff) {
    return (
      <div className="event-value" aria-label={`${event.fromValue || "-"} から ${event.toValue || "-"} へ`}>
        <span className={`event-value__pill${event.fromValue ? "" : " event-value__pill--empty"}`}>{event.fromValue || "-"}</span>
        <span className="event-value__arrow">→</span>
        <span className={`event-value__pill event-value__pill--to${event.toValue ? "" : " event-value__pill--empty"}`}>{event.toValue || "-"}</span>
      </div>
    );
  }

  return (
    <div className="note-diff">
      <Group gap="xs" align="center">
        <Text size="sm" fw={700}>
          {noteDiff.summary}
        </Text>
        <Badge size="xs" radius="sm" variant="light" color="gray">
          {noteDiff.stats.fromLines}L → {noteDiff.stats.toLines}L
        </Badge>
      </Group>
      <div className="note-diff__preview">
        {noteDiff.preview.map((item, index) =>
          item.kind === "changed" ? (
            <div key={`${item.kind}-${item.line}-${index}`} className="note-diff__change">
              <NoteDiffPreviewLine kind="removed" line={item.line} value={item.from ?? "-"} />
              <NoteDiffPreviewLine kind="added" line={item.line} value={item.to ?? "-"} />
            </div>
          ) : (
            <NoteDiffPreviewLine key={`${item.kind}-${item.line}-${index}`} kind={item.kind} line={item.line} value={item.to ?? item.from ?? "-"} />
          ),
        )}
        {noteDiff.truncated ? <div className="note-diff__more">preview truncated</div> : null}
      </div>
    </div>
  );
}

function NoteDiffPreviewLine({ kind, line, value }: { kind: "added" | "removed"; line: number; value: string }) {
  return (
    <div className={`note-diff__line note-diff__line--${kind}`}>
      <span className="note-diff__line-marker">{kind === "added" ? "+" : "-"}</span>
      <span className="note-diff__line-number">L{line}</span>
      <span className="note-diff__line-body">{value}</span>
    </div>
  );
}

function formatDateTime(value: string | null, timeZone: AppTimeZone) {
  return formatTimestampLabel(value, timeZone) ?? "-";
}

function InsightKpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="insight-kpi">
      <Text className="insight-kpi__label">{label}</Text>
      <Text className="insight-kpi__value">{value}</Text>
      <Text className="insight-kpi__hint">{hint}</Text>
    </div>
  );
}

function TicketTimeline({
  ticket,
  timeZone,
  statuses,
}: {
  ticket: TicketAnalysis | null;
  timeZone: AppTimeZone;
  statuses: ApiStatus[];
}) {
  if (!ticket) {
    return <div className="empty-state">分析するチケットを選択してください。</div>;
  }

  const allEvents = ticket.events;
  const progressionEvents = ticket.statusEvents.filter(isStatusChangeEvent);

  return (
    <div className="ticket-detail">
      <Group justify="space-between" align="flex-start" gap="md" mb="md">
        <div>
          <Title order={4}>#{ticket.todo.id} {ticket.todo.title}</Title>
          <Text size="sm" c="dimmed" mt={4}>
            {ticket.todo.startAt ? formatDateTime(ticket.todo.startAt, timeZone) : "start -"} から {ticket.todo.endAt ? formatDateTime(ticket.todo.endAt, timeZone) : "end -"}
          </Text>
        </div>
        <Badge size="lg" radius="sm" variant="light" color="orange">
          {ticket.cycleHours == null ? "duration -" : formatDurationHours(ticket.cycleHours)}
        </Badge>
      </Group>

      <ChangeOverview ticket={ticket} timeZone={timeZone} />

      <div className="status-path" aria-label="ステータス遷移">
        {progressionEvents.length ? (
          progressionEvents.map((event) => (
            <div key={event.id} className="status-path__step">
              <div className="status-path__body">
                <Group justify="space-between" gap="sm" mb="xs">
                  <Text size="xs" c="dimmed">
                    {formatDateTime(event.occurredAt, timeZone)}
                  </Text>
                </Group>
                <StatusTransitionPath event={event} statuses={statuses} />
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">ステータス遷移イベントは記録されていません。</div>
        )}
      </div>

      <Title order={5} mt="lg" mb="sm">
        Update timeline
      </Title>
      <div className="event-timeline">
        {allEvents.length ? (
          allEvents.map((event, index) => (
            <div
              key={event.id}
              className={`event-row event-tone--${eventTone(event)}${isProgressionEvent(event) ? " event-row--progress" : ""}`}
            >
              <div className="event-row__time">{formatDateTime(event.occurredAt, timeZone)}</div>
              <div
                className={`event-row__marker${index === 0 ? " event-row__marker--first" : ""}${index === allEvents.length - 1 ? " event-row__marker--last" : ""}`}
                aria-hidden="true"
              >
                <span className="event-row__dot" />
              </div>
              <div className="event-row__body">
                <Group gap="xs" mb={4}>
                  <span className="event-row__kind">{eventLabel(event)}</span>
                  {event.actor ? (
                    <Text size="xs" c="dimmed">
                      {event.actor}
                    </Text>
                  ) : null}
                </Group>
                <EventValue event={event} />
                {event.fieldName ? (
                  <span className="event-row__field">field: {fieldLabel(event.fieldName)}</span>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">このチケットにはイベントがありません。</div>
        )}
      </div>
    </div>
  );
}

function ChangeOverview({ ticket, timeZone }: { ticket: TicketAnalysis; timeZone: AppTimeZone }) {
  const events = ticket.events;
  const firstEvent = events[0] ?? null;
  const lastEvent = events[events.length - 1] ?? null;
  const createEvents = events.filter((event) => event.eventType === "create").length;
  const noteEvents = events.filter((event) => event.fieldName === "description").length;
  const labelEvents = events.filter((event) => event.eventType.startsWith("label_")).length;
  const fieldEvents = events.filter(
    (event) => event.eventType !== "create" && !isProgressionEvent(event) && event.fieldName !== "description" && !event.eventType.startsWith("label_"),
  ).length;
  const summaryItems = [
    { label: "作成", value: createEvents, tone: "create" },
    { label: "進行", value: ticket.statusEvents.length, tone: "progress" },
    { label: "ノート", value: noteEvents, tone: "note" },
    { label: "ラベル", value: labelEvents, tone: "label" },
    { label: "項目", value: fieldEvents, tone: "field" },
  ];

  return (
    <div className="change-overview" aria-label="変更履歴の概要">
      <div className="change-overview__header">
        <div>
          <Text className="change-overview__eyebrow">Change map</Text>
          <Text className="change-overview__title">
            {events.length} events
            {firstEvent && lastEvent ? ` / ${formatDateTime(firstEvent.occurredAt, timeZone)} - ${formatDateTime(lastEvent.occurredAt, timeZone)}` : ""}
          </Text>
        </div>
        <div className="change-overview__stats">
          {summaryItems.map((item) => (
            <div key={item.label} className={`change-overview__stat event-tone--${item.tone}`}>
              <span className="change-overview__stat-value">{item.value}</span>
              <span className="change-overview__stat-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {events.length ? (
        <div className="change-map" aria-label="イベントの並び">
          {events.map((event) => (
            <div key={event.id} className={`change-map__item event-tone--${eventTone(event)}`}>
              <span className="change-map__dot" aria-hidden="true" />
              <span className="change-map__label">{eventToneLabel(eventTone(event))}</span>
              <span className="change-map__time">{formatDateTime(event.occurredAt, timeZone)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">このチケットにはイベントがありません。</div>
      )}
    </div>
  );
}

function StatusTransitionPath({ event, statuses }: { event: ReplayEvent; statuses: ApiStatus[] }) {
  const fromKey = statusKey(event.fromValue);
  const toKey = statusKey(event.toValue);
  const orderedStatuses = statuses.length
    ? statuses
    : [
        { id: -1, name: event.fromValue || "-", sortOrder: 0, color: "#9ca3af", autoStart: false, autoEnd: false },
        { id: -2, name: event.toValue || "-", sortOrder: 1, color: "#9ca3af", autoStart: false, autoEnd: false },
      ];

  return (
    <div className="status-flow" aria-label={`${event.fromValue || "-"} から ${event.toValue || "-"} への遷移`}>
      <div className="status-flow__nodes">
        {orderedStatuses.map((status) => {
          const isFrom = statusKey(status.name) === fromKey;
          const isTo = statusKey(status.name) === toKey;
          const isEndpoint = isFrom || isTo;
          return (
            <div
              key={status.id}
              className={`status-flow__node-step${isEndpoint ? " status-flow__node-step--active" : ""}${isFrom ? " status-flow__node-step--from" : ""}${isTo ? " status-flow__node-step--to" : ""}`}
              style={{ "--status-color": status.color } as CSSProperties}
            >
              <span className="status-flow__node" aria-hidden="true" />
              <span className="status-flow__label">
                <span className="status-flow__name">{status.name}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompletionTrendChart({
  rows,
  selectedIterationId,
}: {
  rows: IterationTrendPoint[];
  selectedIterationId: number | null;
}) {
  if (!rows.length) {
    return <div className="empty-state">推移を表示するイテレーションがありません。</div>;
  }

  const width = Math.max(520, rows.length * 92);
  const height = 280;
  const left = 46;
  const right = 22;
  const top = 22;
  const bottom = 66;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxCount = Math.max(1, ...rows.map((row) => Math.max(row.total, row.completed)));
  const yFor = (value: number) => top + chartHeight - (value / maxCount) * chartHeight;
  const barWidth = Math.min(38, Math.max(18, chartWidth / Math.max(rows.length, 1) * 0.42));
  const plotLeft = left + barWidth / 2 + 14;
  const plotRight = width - right - barWidth / 2;
  const plotWidth = plotRight - plotLeft;
  const xFor = (index: number) => (rows.length === 1 ? plotLeft + plotWidth / 2 : plotLeft + (index / (rows.length - 1)) * plotWidth);
  const ticks = [0, Math.ceil(maxCount / 2), maxCount].filter((value, index, all) => all.indexOf(value) === index);

  return (
    <div className="trend-chart" role="img" aria-label="イテレーションごとの完了タスク推移">
      <svg className="trend-chart__svg" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }}>
        {ticks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line className="trend-chart__grid" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="trend-chart__axis" x={left - 12} y={y + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const x = xFor(index);
          const totalHeight = chartHeight - (yFor(row.total) - top);
          const completedHeight = chartHeight - (yFor(row.completed) - top);
          const isSelected = row.iterationId === selectedIterationId;
          return (
            <g key={row.iterationId}>
              <title>{`${row.iterationName}: 完了 ${row.completed} / 総数 ${row.total}`}</title>
              <rect
                className="trend-chart__bar trend-chart__bar--total"
                x={x - barWidth / 2}
                y={top + chartHeight - totalHeight}
                width={barWidth}
                height={totalHeight}
                rx={5}
              />
              <rect
                className="trend-chart__bar trend-chart__bar--completed"
                x={x - barWidth / 2}
                y={top + chartHeight - completedHeight}
                width={barWidth}
                height={completedHeight}
                rx={5}
              />
              <circle className="trend-chart__point" cx={x} cy={yFor(row.completed)} r={isSelected ? 5.5 : 4} />
              {isSelected ? <circle className="trend-chart__point-ring" cx={x} cy={yFor(row.completed)} r={9} /> : null}
              <text className="trend-chart__label" x={x} y={height - 22} textAnchor="middle">
                {row.iterationName}
              </text>
            </g>
          );
        })}
      </svg>
      <Group gap="lg" mt="sm" className="trend-chart__legend">
        <Group gap={6}>
          <span className="trend-chart__legend-mark trend-chart__legend-mark--total" />
          <Text size="xs" c="dimmed">
            総タスク数
          </Text>
        </Group>
        <Group gap={6}>
          <span className="trend-chart__legend-mark trend-chart__legend-mark--completed" />
          <Text size="xs" c="dimmed">
            完了タスク数
          </Text>
        </Group>
      </Group>
    </div>
  );
}
