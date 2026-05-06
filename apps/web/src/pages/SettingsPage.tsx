import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Badge, Box, Button, Group, Modal, Paper, Select, Switch, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type ReactNode, useMemo, useState } from "react";
import { api, type ApiIteration, type ApiLabel, type ApiProject, type ApiStatus } from "../api";
import { DEFAULT_LABEL_COLORS, getLabelBadgeStyle } from "../labelColors";

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Paper className="stat-card">
      <Text className="stat-card__label">{label}</Text>
      <Text className="stat-card__value" mt={8}>
        {value}
      </Text>
      <Text className="stat-card__hint" mt={10}>
        {hint}
      </Text>
    </Paper>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20L8.5 19L18.8 8.7C19.6 7.9 19.6 6.6 18.8 5.8L18.2 5.2C17.4 4.4 16.1 4.4 15.3 5.2L5 15.5L4 20Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.5 7L17 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 4H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7 7L7.8 18.1C7.9 19.2 8.8 20 9.9 20H14.1C15.2 20 16.1 19.2 16.2 18.1L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 11V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6H9.01M15 6H15.01M9 12H9.01M15 12H15.01M9 18H9.01M15 18H15.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatusBlock({
  status,
  isEditing,
  onEdit,
}: {
  status: ApiStatus;
  isEditing: boolean;
  onEdit: (status: ApiStatus) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: String(status.id) });
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: String(status.id),
    data: { status },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.72 : 1 }
    : { opacity: isDragging ? 0.72 : 1 };

  return (
    <div
      ref={setDropRef}
      className={`status-block${isOver ? " status-block--over" : ""}${isEditing ? " status-block--editing" : ""}`}
    >
      <div ref={setDragRef} className="status-block__inner" style={style}>
        <button className="status-block__grip" type="button" aria-label={`${status.name} を並び替え`} {...listeners} {...attributes}>
          <GripIcon />
        </button>
        <div className="status-block__body">
          <Badge variant="filled" radius="sm" style={getLabelBadgeStyle(status.color)}>
            {status.name}
          </Badge>
          <Group gap={6} mt={6}>
            {status.autoStart ? (
              <Badge variant="light" color="orange" radius="sm">
                start_at
              </Badge>
            ) : null}
            {status.autoEnd ? (
              <Badge variant="light" color="gray" radius="sm">
                end_at
              </Badge>
            ) : null}
          </Group>
        </div>
        <Button variant="default" size="compact-sm" radius="sm" px={10} onClick={() => onEdit(status)}>
          <PencilIcon />
        </Button>
      </div>
    </div>
  );
}

function reorderIds(ids: string[], activeId: string, overId: string) {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: lesson } = useQuery({ queryKey: ["lesson"], queryFn: api.lesson });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: api.labels });
  const { data: statuses = [] } = useQuery({ queryKey: ["statuses"], queryFn: api.statuses });
  const { data: iterations = [] } = useQuery({ queryKey: ["iterations"], queryFn: api.iterations });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#d4662c");
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [statusName, setStatusName] = useState("");
  const [statusColor, setStatusColor] = useState("#6b7280");
  const [statusAutoStart, setStatusAutoStart] = useState(false);
  const [statusAutoEnd, setStatusAutoEnd] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [iterationName, setIterationName] = useState("");
  const [iterationStart, setIterationStart] = useState("");
  const [iterationEnd, setIterationEnd] = useState("");
  const [editingIterationId, setEditingIterationId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "label" | "iteration" | "project"; id: number; name: string } | null>(null);

  const resetLabelForm = () => {
    setEditingLabelId(null);
    setLabelName("");
    setLabelColor("#d4662c");
  };

  const resetStatusForm = () => {
    setEditingStatusId(null);
    setStatusName("");
    setStatusColor("#6b7280");
    setStatusAutoStart(false);
    setStatusAutoEnd(false);
  };

  const resetIterationForm = () => {
    setEditingIterationId(null);
    setIterationName("");
    setIterationStart("");
    setIterationEnd("");
  };

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setProjectName("");
  };

  const addLabel = useMutation({
    mutationFn: () => api.createLabel({ name: labelName.trim(), color: labelColor.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      resetLabelForm();
    },
  });

  const updateLabel = useMutation({
    mutationFn: () => api.patchLabel(editingLabelId!, { name: labelName.trim(), color: labelColor.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      resetLabelForm();
    },
  });

  const deleteLabel = useMutation({
    mutationFn: (id: number) => api.deleteLabel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });

  const updateSettings = useMutation({
    mutationFn: api.patchSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const addStatus = useMutation({
    mutationFn: () =>
      api.createStatus({
        name: statusName.trim(),
        sortOrder: statuses.length,
        color: statusColor.trim(),
        autoStart: statusAutoStart,
        autoEnd: statusAutoEnd,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["statuses"] });
      resetStatusForm();
    },
  });

  const updateStatus = useMutation({
    mutationFn: () =>
      api.patchStatus(editingStatusId!, {
        name: statusName.trim(),
        color: statusColor.trim(),
        autoStart: statusAutoStart,
        autoEnd: statusAutoEnd,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["statuses"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
      resetStatusForm();
    },
  });

  const reorderStatuses = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(orderedIds.map((id, index) => api.patchStatus(Number(id), { sortOrder: index })));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["statuses"] });
    },
  });

  const addIteration = useMutation({
    mutationFn: () =>
      api.createIteration({
        name: iterationName.trim(),
        startsAt: iterationStart || null,
        endsAt: iterationEnd || null,
        sortOrder: iterations.length,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iterations"] });
      resetIterationForm();
    },
  });

  const updateIteration = useMutation({
    mutationFn: () =>
      api.patchIteration(editingIterationId!, {
        name: iterationName.trim(),
        startsAt: iterationStart || null,
        endsAt: iterationEnd || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iterations"] });
      resetIterationForm();
    },
  });

  const deleteIteration = useMutation({
    mutationFn: (id: number) => api.deleteIteration(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iterations"] }),
  });

  const addProject = useMutation({
    mutationFn: () => api.createProject({ name: projectName.trim(), sortOrder: projects.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      resetProjectForm();
    },
  });

  const updateProject = useMutation({
    mutationFn: () => api.patchProject(editingProjectId!, { name: projectName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      resetProjectForm();
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const iterationDateError = useMemo(() => {
    if (!iterationStart || !iterationEnd) return null;
    return iterationStart <= iterationEnd ? null : "開始日は終了日以前の日付を指定してください。";
  }, [iterationEnd, iterationStart]);

  const mutationError = useMemo(() => {
    for (const mutation of [
      addLabel,
      updateLabel,
      deleteLabel,
      updateSettings,
      addStatus,
      updateStatus,
      reorderStatuses,
      addIteration,
      updateIteration,
      deleteIteration,
      addProject,
      updateProject,
      deleteProject,
    ]) {
      if (mutation.isError) return String((mutation.error as Error).message);
    }
    return null;
  }, [
    addIteration,
    addLabel,
    addProject,
    addStatus,
    deleteIteration,
    deleteLabel,
    deleteProject,
    reorderStatuses,
    updateIteration,
    updateLabel,
    updateProject,
    updateSettings,
    updateStatus,
  ]);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "label") {
      deleteLabel.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
      return;
    }
    if (deleteTarget.type === "project") {
      deleteProject.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
      return;
    }
    deleteIteration.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  };

  const handleStatusDragEnd = (event: DragEndEvent) => {
    const activeId = event.active.id.toString();
    const overId = event.over?.id?.toString();
    if (!overId || activeId === overId) return;
    const orderedIds = (statuses as ApiStatus[]).map((status) => String(status.id));
    const nextIds = reorderIds(orderedIds, activeId, overId);
    if (nextIds === orderedIds) return;
    reorderStatuses.mutate(nextIds);
  };

  return (
    <div className="page-stack">
      <Modal
        opened={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="削除の確認"
        centered
        radius="sm"
      >
        <Text size="sm" c="dimmed">
          {deleteTarget ? `${deleteTarget.name} を削除します。元に戻せません。` : ""}
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" radius="sm" onClick={() => setDeleteTarget(null)}>
            キャンセル
          </Button>
          <Button
            color="red"
            radius="sm"
            onClick={confirmDelete}
            loading={deleteLabel.isPending || deleteIteration.isPending || deleteProject.isPending}
          >
            削除する
          </Button>
        </Group>
      </Modal>

      <div className="page-actions">
        <div className="page-intro">
          <Text className="page-intro__title">Workspace settings</Text>
          <Text className="page-intro__copy">追加フォームと削除一覧を分離し、運用系データを扱う画面として落ち着いた密度に調整しました。</Text>
        </div>
      </div>

      {mutationError ? (
        <Alert color="red" title="操作に失敗しました">
          {mutationError}
        </Alert>
      ) : null}

      <div className="stats-grid">
        <StatCard label="Lesson" value={lesson?.lesson?.toUpperCase() ?? "-"} hint="現在のデータモード" />
        <StatCard label="Time zone" value={settings?.timeZone ?? "Asia/Tokyo"} hint="日時の表示と入力に使うタイムゾーン" />
        <StatCard label="Labels" value={String(labels.length)} hint="登録済みラベル数" />
        <StatCard label="Statuses" value={String(statuses.length)} hint="登録済みステータス数" />
        <StatCard label="Iterations" value={String(iterations.length)} hint="登録済みイテレーション数" />
        <StatCard label="Projects" value={String(projects.length)} hint="登録済みプロジェクト数" />
      </div>

      <div className="settings-grid">
        <Paper className="settings-card" p="lg" radius="sm">
          <Title order={3} mb="md">
            Time zone
          </Title>
          <Select
            label="表示と入力"
            data={[
              { value: "Asia/Tokyo", label: "Asia/Tokyo" },
              { value: "UTC", label: "UTC" },
            ]}
            value={settings?.timeZone ?? "Asia/Tokyo"}
            onChange={(value) => updateSettings.mutate({ timeZone: value === "UTC" ? "UTC" : "Asia/Tokyo" })}
            disabled={updateSettings.isPending}
            allowDeselect={false}
          />
          <Text size="sm" c="dimmed" mt="sm">
            DB には UTC で保存し、この設定を使って画面表示と日時入力を変換します。
          </Text>
        </Paper>

        <Paper className="settings-card" p="lg" radius="sm">
          <Title order={3} mb="md">
            Labels
          </Title>
          {lesson?.lesson === "a" ? (
            <div className="empty-state">Lesson A では labels_csv で保持します。正規化 CRUD は Lesson B/C で利用できます。</div>
          ) : (
            <>
              <Group align="flex-end" mb="md" wrap="wrap">
                <TextInput
                  label="名前"
                  placeholder="shipping"
                  value={labelName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelName(event.target.value)}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <Group mt={24} gap="sm">
                  <Button
                    radius="sm"
                    onClick={() => {
                      if (!labelName.trim()) return;
                      if (editingLabelId == null) {
                        addLabel.mutate();
                        return;
                      }
                      updateLabel.mutate();
                    }}
                    loading={addLabel.isPending || updateLabel.isPending}
                  >
                    {editingLabelId == null ? "追加" : "更新"}
                  </Button>
                  {editingLabelId != null ? (
                    <Button variant="default" radius="sm" onClick={resetLabelForm}>
                      キャンセル
                    </Button>
                  ) : null}
                </Group>
              </Group>
              <Box mb="md">
                <Text size="sm" fw={600} mb={8}>
                  色
                </Text>
                <Group gap="sm" align="center" wrap="wrap">
                  {DEFAULT_LABEL_COLORS.map((color) => {
                    const selected = color === labelColor;
                    return (
                      <UnstyledButton
                        key={color}
                        type="button"
                        aria-label={`ラベル色 ${color}`}
                        onClick={() => setLabelColor(color)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          border: selected ? "3px solid #2f241b" : "2px solid rgba(74, 58, 44, 0.12)",
                          backgroundColor: color,
                          boxShadow: selected ? "0 0 0 4px rgba(212, 102, 44, 0.16)" : "none",
                        }}
                      />
                    );
                  })}
                  <TextInput
                    value={labelColor}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelColor(event.target.value)}
                    placeholder="#d4662c"
                    w={140}
                  />
                </Group>
              </Box>
              <StackedSettingsRows
                rows={(labels as ApiLabel[]).map((label) => ({
                  id: label.id,
                  left: (
                    <Group gap="sm">
                      <Badge variant="filled" style={getLabelBadgeStyle(label.color)}>
                        {label.name}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {label.color}
                      </Text>
                    </Group>
                  ),
                  action: {
                    label: "編集",
                    onClick: () => {
                      setEditingLabelId(label.id);
                      setLabelName(label.name);
                      setLabelColor(label.color);
                    },
                  },
                  onDelete: () => setDeleteTarget({ type: "label", id: label.id, name: label.name }),
                }))}
              />
            </>
          )}
        </Paper>

        <Paper className="settings-card" p="lg" radius="sm">
          <Title order={3} mb="md">
            Statuses
          </Title>
          {lesson?.lesson === "a" ? (
            <div className="empty-state">Lesson A では文字列ステータスを TODO に直接保持します。</div>
          ) : (
            <>
              <Group align="flex-end" mb="md" wrap="wrap">
                <TextInput
                  label="名前"
                  placeholder="blocked"
                  value={statusName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setStatusName(event.target.value)}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <Group mt={24} gap="sm">
                  <Button
                    radius="sm"
                    onClick={() => {
                      if (!statusName.trim()) return;
                      if (editingStatusId == null) {
                        addStatus.mutate();
                        return;
                      }
                      updateStatus.mutate();
                    }}
                    loading={addStatus.isPending || updateStatus.isPending}
                  >
                    {editingStatusId == null ? "追加" : "更新"}
                  </Button>
                  {editingStatusId != null ? (
                    <Button variant="default" radius="sm" onClick={resetStatusForm}>
                      キャンセル
                    </Button>
                  ) : null}
                </Group>
              </Group>
              <Box mb="md">
                <Text size="sm" fw={600} mb={8}>
                  色
                </Text>
                <Group gap="sm" align="center" wrap="wrap">
                  {DEFAULT_LABEL_COLORS.map((color) => {
                    const selected = color === statusColor;
                    return (
                      <UnstyledButton
                        key={color}
                        type="button"
                        aria-label={`ステータス色 ${color}`}
                        onClick={() => setStatusColor(color)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          border: selected ? "3px solid #2f241b" : "2px solid rgba(74, 58, 44, 0.12)",
                          backgroundColor: color,
                          boxShadow: selected ? "0 0 0 4px rgba(212, 102, 44, 0.16)" : "none",
                        }}
                      />
                    );
                  })}
                  <TextInput
                    value={statusColor}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setStatusColor(event.target.value)}
                    placeholder="#6b7280"
                    w={140}
                  />
                </Group>
              </Box>
              <Group mb="md" gap="xl" align="center" wrap="wrap">
                <Switch
                  label="このステータスに入ったら開始日時を設定"
                  checked={statusAutoStart}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setStatusAutoStart(event.currentTarget.checked)}
                />
                <Switch
                  label="このステータスに入ったら終了日時を設定"
                  checked={statusAutoEnd}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setStatusAutoEnd(event.currentTarget.checked)}
                />
              </Group>
              <DndContext sensors={sensors} onDragEnd={handleStatusDragEnd}>
                <div className="status-block-list">
                  {(statuses as ApiStatus[]).map((status) => (
                    <StatusBlock
                      key={status.id}
                      status={status}
                      isEditing={editingStatusId === status.id}
                      onEdit={(target) => {
                        setEditingStatusId(target.id);
                        setStatusName(target.name);
                        setStatusColor(target.color);
                        setStatusAutoStart(target.autoStart);
                        setStatusAutoEnd(target.autoEnd);
                      }}
                    />
                  ))}
                </div>
              </DndContext>
            </>
          )}
        </Paper>

        <Paper className="settings-card" p="lg" radius="sm">
          <Title order={3} mb="md">
            Projects
          </Title>
          <Group align="flex-end" mb="md" wrap="wrap">
            <TextInput
              label="名前"
              placeholder="Product"
              value={projectName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProjectName(event.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <Group mt={24} gap="sm">
              <Button
                radius="sm"
                onClick={() => {
                  if (!projectName.trim()) return;
                  if (editingProjectId == null) {
                    addProject.mutate();
                    return;
                  }
                  updateProject.mutate();
                }}
                loading={addProject.isPending || updateProject.isPending}
              >
                {editingProjectId == null ? "追加" : "更新"}
              </Button>
              {editingProjectId != null ? (
                <Button variant="default" radius="sm" onClick={resetProjectForm}>
                  キャンセル
                </Button>
              ) : null}
            </Group>
          </Group>
          <StackedSettingsRows
            rows={(projects as ApiProject[]).map((project) => ({
              id: project.id,
              left: (
                <Box>
                  <Text fw={700} size="sm">
                    {project.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    sort {project.sortOrder}
                  </Text>
                </Box>
              ),
              action: {
                label: "編集",
                onClick: () => {
                  setEditingProjectId(project.id);
                  setProjectName(project.name);
                },
              },
              onDelete: () => setDeleteTarget({ type: "project", id: project.id, name: project.name }),
            }))}
          />
        </Paper>

        <Paper className="settings-card" p="lg" radius="sm">
          <Title order={3} mb="md">
            Iterations
          </Title>
          <TextInput
            label="名前"
            mb="sm"
            value={iterationName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setIterationName(event.target.value)}
          />
          <Group grow align="flex-start" mb="md" wrap="nowrap">
            <TextInput
              label="開始"
              value={iterationStart}
              type="date"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setIterationStart(event.target.value)}
            />
            <TextInput
              label="終了"
              value={iterationEnd}
              type="date"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setIterationEnd(event.target.value)}
              error={iterationDateError}
            />
          </Group>
          <Group mb="lg">
            <Button
              radius="sm"
              onClick={() => {
                if (!iterationName.trim() || iterationDateError) return;
                if (editingIterationId == null) {
                  addIteration.mutate();
                  return;
                }
                updateIteration.mutate();
              }}
              loading={addIteration.isPending || updateIteration.isPending}
              disabled={Boolean(iterationDateError)}
            >
              {editingIterationId == null ? "追加" : "更新"}
            </Button>
            {editingIterationId != null ? (
              <Button variant="default" radius="sm" onClick={resetIterationForm}>
                キャンセル
              </Button>
            ) : null}
          </Group>
          <StackedSettingsRows
            rows={(iterations as ApiIteration[]).map((iteration) => ({
              id: iteration.id,
              left: (
                <Box>
                  <Text fw={700} size="sm">
                    {iteration.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {iteration.startsAt || "未設定"} {"->"} {iteration.endsAt || "未設定"}
                  </Text>
                </Box>
              ),
              action: {
                label: "編集",
                onClick: () => {
                  setEditingIterationId(iteration.id);
                  setIterationName(iteration.name);
                  setIterationStart(iteration.startsAt ?? "");
                  setIterationEnd(iteration.endsAt ?? "");
                },
              },
              onDelete: () => setDeleteTarget({ type: "iteration", id: iteration.id, name: iteration.name }),
            }))}
          />
        </Paper>
      </div>
    </div>
  );
}

function StackedSettingsRows({
  rows,
}: {
  rows: { id: number; left: ReactNode; action?: { label: string; onClick: () => void }; onDelete: () => void }[];
}) {
  if (!rows.length) {
    return <div className="empty-state">まだ登録されていません。</div>;
  }

  return (
    <Box className="list-stack">
      {rows.map((row) => (
        <div key={row.id} className="list-stack__row">
          {row.left}
          <Group gap="xs">
            {row.action ? (
              <Button
                variant="default"
                size="compact-sm"
                radius="sm"
                px={10}
                onClick={row.action.onClick}
                aria-label={row.action.label}
                title={row.action.label}
              >
                <PencilIcon />
              </Button>
            ) : null}
            <Button
              color="red"
              variant="light"
              size="compact-sm"
              radius="sm"
              px={10}
              onClick={row.onDelete}
              aria-label="削除"
              title="削除"
            >
              <TrashIcon />
            </Button>
          </Group>
        </div>
      ))}
    </Box>
  );
}
