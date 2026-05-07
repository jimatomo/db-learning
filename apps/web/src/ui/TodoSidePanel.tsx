import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { $createCodeNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { $convertFromMarkdownString, $convertToMarkdownString, CHECK_LIST, TRANSFORMERS } from "@lexical/markdown";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode } from "@lexical/list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { $getSelection, $isRangeSelection, type EditorState, FORMAT_TEXT_COMMAND } from "lexical";
import { type ChangeEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type ApiTodo, type AppTimeZone } from "../api";
import { dateTimeInputValueToUtc, utcToDateTimeInputValue } from "../dateTime";

type Props = {
  opened: boolean;
  onClose: () => void;
  selectedProjectId: number | null;
  todo?: ApiTodo | null;
  variant?: "drawer" | "page";
};

const formFieldClassNames = {
  root: "todo-sidepanel__field",
  label: "todo-sidepanel__field-label",
  wrapper: "todo-sidepanel__field-control",
};

const leftFieldClassNames = {
  ...formFieldClassNames,
  root: "todo-sidepanel__field todo-sidepanel__field--left",
};

const wideFieldClassNames = {
  ...formFieldClassNames,
  root: "todo-sidepanel__field todo-sidepanel__field--wide",
};

function createInitialState() {
  return {
    title: "",
    description: "",
    labelsCsv: "",
    status: "inbox",
    statusId: null as string | null,
    projectId: null as string | null,
    iterationId: null as string | null,
    parentId: null as string | null,
    plannedStartAt: "",
    startAt: "",
    dueAt: "",
    endAt: "",
    pickedLabels: [] as number[],
  };
}

function createFormFromTodo(todo: ApiTodo, timeZone: AppTimeZone) {
  return {
    title: todo.title,
    description: todo.description ?? "",
    labelsCsv: todo.labels.map((label) => label.name).join(","),
    status: todo.status,
    statusId: todo.statusId != null ? String(todo.statusId) : null,
    projectId: todo.projectId != null ? String(todo.projectId) : null,
    iterationId: todo.iterationId != null ? String(todo.iterationId) : null,
    parentId: todo.parentId != null ? String(todo.parentId) : null,
    plannedStartAt: utcToDateTimeInputValue(todo.plannedStartAt, timeZone),
    startAt: utcToDateTimeInputValue(todo.startAt, timeZone),
    dueAt: utcToDateTimeInputValue(todo.dueAt, timeZone),
    endAt: utcToDateTimeInputValue(todo.endAt, timeZone),
    pickedLabels: todo.labels.map((label) => label.id).filter((id) => id > 0),
  };
}

function scheduleFormFieldsFromTodo(todo: ApiTodo, timeZone: AppTimeZone) {
  return {
    plannedStartAt: utcToDateTimeInputValue(todo.plannedStartAt, timeZone),
    startAt: utcToDateTimeInputValue(todo.startAt, timeZone),
    dueAt: utcToDateTimeInputValue(todo.dueAt, timeZone),
    endAt: utcToDateTimeInputValue(todo.endAt, timeZone),
  };
}

function collectDescendantIds(todos: ApiTodo[], rootId: number) {
  const byParent = new Map<number | null, ApiTodo[]>();
  for (const todo of todos) {
    const key = todo.parentId ?? null;
    const current = byParent.get(key) ?? [];
    current.push(todo);
    byParent.set(key, current);
  }

  const descendants = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const currentId = stack.pop()!;
    for (const child of byParent.get(currentId) ?? []) {
      if (descendants.has(child.id)) continue;
      descendants.add(child.id);
      stack.push(child.id);
    }
  }

  return descendants;
}

function getAutoSaveStatus(state: "idle" | "saving" | "saved" | "error") {
  if (state === "error") return { label: "保存失敗", tone: "error" };
  if (state === "saving") return { label: "保存中", tone: "saving" };
  if (state === "saved") return { label: "保存済み", tone: "saved" };
  return { label: "未保存", tone: "idle" };
}

const lexicalTheme = {
  code: "markdown-editor__code",
  heading: {
    h1: "markdown-editor__heading markdown-editor__heading--h1",
    h2: "markdown-editor__heading markdown-editor__heading--h2",
    h3: "markdown-editor__heading markdown-editor__heading--h3",
  },
  list: {
    checklist: "markdown-editor__checklist",
    listitem: "markdown-editor__list-item",
    listitemChecked: "markdown-editor__list-item--checked",
    listitemUnchecked: "markdown-editor__list-item--unchecked",
    nested: {
      listitem: "markdown-editor__nested-list-item",
    },
    ol: "markdown-editor__list markdown-editor__list--ordered",
    ul: "markdown-editor__list markdown-editor__list--bullet",
  },
  paragraph: "markdown-editor__paragraph",
  quote: "markdown-editor__quote",
  text: {
    bold: "markdown-editor__text--bold",
    code: "markdown-editor__text--code",
    italic: "markdown-editor__text--italic",
    strikethrough: "markdown-editor__text--strikethrough",
  },
};

const markdownTransformers = [CHECK_LIST, ...TRANSFORMERS];
const PROPERTY_AUTOSAVE_DELAY_MS = 650;
const NOTE_AUTOSAVE_DELAY_MS = 60_000;
const EMPTY_TODOS: ApiTodo[] = [];
const EMPTY_PROJECTS: { id: number; name: string; sortOrder: number }[] = [];
const EMPTY_ITERATIONS: { id: number; name: string; startsAt: string | null; endsAt: string | null; sortOrder: number }[] = [];
const EMPTY_LABELS: { id: number; name: string; color: string }[] = [];
const EMPTY_STATUSES: { id: number; name: string; sortOrder: number; color: string; autoStart: boolean; autoEnd: boolean }[] = [];

function normalizeMarkdownNote(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
}

function readEditorMarkdown() {
  return normalizeMarkdownNote($convertToMarkdownString(markdownTransformers, undefined, true));
}

function MarkdownEditorToolbar() {
  const [editor] = useLexicalComposerContext();

  const setHeading = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode("h1"));
    });
  };

  const setCode = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createCodeNode("sql"));
    });
  };

  return (
    <Group gap={4} wrap="wrap">
      <Tooltip label="見出し">
        <ActionIcon variant="subtle" color="gray" aria-label="見出しを挿入" onClick={setHeading}>
          #
        </ActionIcon>
      </Tooltip>
      <Tooltip label="太字">
        <ActionIcon variant="subtle" color="gray" aria-label="太字" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>
          B
        </ActionIcon>
      </Tooltip>
      <Tooltip label="コードブロック">
        <ActionIcon variant="subtle" color="gray" aria-label="コードブロックを挿入" onClick={setCode}>
          {"</>"}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="箇条書き">
        <ActionIcon variant="subtle" color="gray" aria-label="箇条書きを挿入" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>
          -
        </ActionIcon>
      </Tooltip>
      <Tooltip label="番号付きリスト">
        <ActionIcon variant="subtle" color="gray" aria-label="番号付きリストを挿入" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>
          1.
        </ActionIcon>
      </Tooltip>
      <Tooltip label="チェックリスト">
        <ActionIcon variant="subtle" color="gray" aria-label="チェックリストを挿入" onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}>
          []
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function MarkdownChangePlugin({ initialMarkdown, onChange }: { initialMarkdown: string; onChange: (value: string) => void }) {
  const lastMarkdownRef = useRef(initialMarkdown);

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState: EditorState) => {
        editorState.read(() => {
          const markdown = readEditorMarkdown();
          if (markdown === lastMarkdownRef.current) return;
          lastMarkdownRef.current = markdown;
          onChange(markdown);
        });
      }}
    />
  );
}

function MarkdownBlurCommitPlugin({ onCommit }: { onCommit: (value: string) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let currentRootElement: HTMLElement | null = null;
    const handleBlur = () => {
      editor.getEditorState().read(() => {
        onCommit(readEditorMarkdown());
      });
    };

    const unregister = editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener("blur", handleBlur, true);
      rootElement?.addEventListener("blur", handleBlur, true);
      currentRootElement = rootElement;
    });

    return () => {
      currentRootElement?.removeEventListener("blur", handleBlur, true);
      unregister();
    };
  }, [editor, onCommit]);

  return null;
}

function MarkdownNoteEditor({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const initialMarkdownRef = useRef(value);
  const initialConfig = useMemo(
    () => ({
      editorState: () => {
        $convertFromMarkdownString(initialMarkdownRef.current || "", markdownTransformers, undefined, true);
      },
      namespace: "TodoNotesEditor",
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
      onError(error: Error) {
        throw error;
      },
      theme: lexicalTheme,
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="markdown-editor markdown-editor--inline">
        <div className="markdown-editor__bar">
          <MarkdownEditorToolbar />
        </div>
        <div className="markdown-editor__body markdown-editor__body--inline markdown-editor__body--lexical">
          <RichTextPlugin
            contentEditable={<ContentEditable className="markdown-editor__lexical-input" aria-placeholder="# Context" />}
            placeholder={<div className="markdown-editor__lexical-placeholder"># Context</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <MarkdownShortcutPlugin transformers={markdownTransformers} />
          <MarkdownChangePlugin initialMarkdown={initialMarkdownRef.current} onChange={onChange} />
          <MarkdownBlurCommitPlugin onCommit={onCommit} />
        </div>
      </div>
    </LexicalComposer>
  );
}

export default function TodoSidePanel({ opened, onClose, selectedProjectId, todo, variant = "drawer" }: Props) {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: lesson } = useQuery({ queryKey: ["lesson"], queryFn: api.lesson });
  const { data: todosData } = useQuery({ queryKey: ["todos", "all"], queryFn: () => api.todos() });
  const { data: projectsData } = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const { data: iterationsData } = useQuery({ queryKey: ["iterations"], queryFn: api.iterations });
  const { data: labelsData } = useQuery({ queryKey: ["labels"], queryFn: api.labels });
  const { data: statusesData } = useQuery({ queryKey: ["statuses"], queryFn: api.statuses });
  const todos = todosData ?? EMPTY_TODOS;
  const projects = projectsData ?? EMPTY_PROJECTS;
  const iterations = iterationsData ?? EMPTY_ITERATIONS;
  const labels = labelsData ?? EMPTY_LABELS;
  const statuses = statusesData ?? EMPTY_STATUSES;

  const [form, setForm] = useState(createInitialState);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [hydratedTodoId, setHydratedTodoId] = useState<number | null>(null);
  const lastAutoSavedBodyRef = useRef("");
  const latestDescriptionRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const noteAutoSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const flushPendingAutoSaveRef = useRef<(includeDescription: boolean) => void>(() => {});
  const activeTodoRef = useRef<ApiTodo | null>(null);
  const isA = lesson?.lesson === "a";
  const timeZone = settings?.timeZone ?? "Asia/Tokyo";
  const isEditing = Boolean(todo);
  const autoSaveStatus = getAutoSaveStatus(autoSaveState);
  const todoUrl = todo ? `/todos/${todo.id}` : "";

  const reset = () => {
    latestDescriptionRef.current = "";
    setForm({ ...createInitialState(), projectId: selectedProjectId != null ? String(selectedProjectId) : null });
  };

  const readPendingDescription = () => {
    return latestDescriptionRef.current;
  };

  const flushDescriptionValue = async (description: string, targetTodo = todo) => {
    if (!targetTodo) return null;
    const nextValue = description || null;
    const currentSaved = lastAutoSavedBodyRef.current ? (JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>) : {};
    if ((currentSaved.description ?? targetTodo.description ?? null) === nextValue) return null;

    latestDescriptionRef.current = description;
    if (noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
    if (activeTodoRef.current?.id === targetTodo.id) setAutoSaveState("saving");
    try {
      const response = await fetch(`/api/todos/${targetTodo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: nextValue }),
      keepalive: true,
      });
      if (!response.ok) throw new Error(response.statusText);
      const updated = (await response.json()) as ApiTodo;
      const savedDescription = updated.description ?? null;
      qc.setQueryData(["todo", targetTodo.id], updated);
      if (activeTodoRef.current?.id === targetTodo.id && (latestDescriptionRef.current || null) === savedDescription) {
        const savedBody = lastAutoSavedBodyRef.current ? (JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>) : {};
        lastAutoSavedBodyRef.current = JSON.stringify({ ...savedBody, description: savedDescription });
        setAutoSaveState("saved");
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["todo", targetTodo.id] }),
        qc.invalidateQueries({ queryKey: ["todos"] }),
      ]);
      return updated;
    } catch (error) {
      if (activeTodoRef.current?.id === targetTodo.id) setAutoSaveState("error");
      throw error;
    }
  };

  const flushDescriptionOnClose = () => {
    void flushDescriptionValue(readPendingDescription());
  };

  const handleClose = (options: { flush?: boolean } = { flush: true }) => {
    if (options.flush) {
      flushDescriptionOnClose();
      flushPendingAutoSaveRef.current(false);
    }
    reset();
    onClose();
  };

  const handleTodoLinkClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!todo || location.pathname === todoUrl) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await flushDescriptionValue(readPendingDescription());
    flushPendingAutoSaveRef.current(false);
    navigate(todoUrl, { state: { from: `${location.pathname}${location.search}` } });
  };

  const statusOptions = useMemo(() => statuses.map((status) => ({ value: String(status.id), label: status.name })), [statuses]);
  const labelOptions = useMemo(() => labels.map((label) => ({ value: String(label.id), label: label.name })), [labels]);
  const projectOptions = useMemo(
    () => [{ value: "", label: "なし" }, ...projects.map((project) => ({ value: String(project.id), label: project.name }))],
    [projects],
  );

  useEffect(() => {
    if (!isA && form.statusId == null && statusOptions[0]?.value) {
      setForm((current) => ({ ...current, statusId: statusOptions[0]?.value ?? null }));
    }
  }, [form.statusId, isA, statusOptions]);

  const buildTodoBody = (source = form) => {
    const body: Record<string, unknown> = {
      title: source.title.trim(),
      description: source.description || null,
      projectId: source.projectId ? Number(source.projectId) : null,
      iterationId: source.iterationId ? Number(source.iterationId) : null,
      parentId: source.parentId ? Number(source.parentId) : null,
      plannedStartAt: dateTimeInputValueToUtc(source.plannedStartAt, timeZone),
      startAt: dateTimeInputValueToUtc(source.startAt, timeZone),
      dueAt: dateTimeInputValueToUtc(source.dueAt, timeZone),
      endAt: dateTimeInputValueToUtc(source.endAt, timeZone),
    };

    if (isA) {
      body.labelsCsv = source.labelsCsv;
      body.status = source.status;
    } else {
      const sid = source.statusId ?? statusOptions[0]?.value ?? null;
      body.statusId = sid != null ? Number(sid) : null;
      body.labelIds = source.pickedLabels;
    }

    return body;
  };

  const buildChangedTodoPatch = (previousBody: Record<string, unknown>, nextBody: Record<string, unknown>) => {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(nextBody)) {
      if (JSON.stringify(previousBody[key]) !== JSON.stringify(value)) {
        patch[key] = value;
      }
    }
    return patch;
  };

  const buildTodoBodyWithLatestDescription = () => buildTodoBody({ ...form, description: latestDescriptionRef.current });

  useEffect(() => {
    if (!opened) {
      reset();
      setAutoSaveState("idle");
      setDeleteConfirmOpen(false);
      setHydratedTodoId(null);
      lastAutoSavedBodyRef.current = "";
      activeTodoRef.current = null;
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
      if (noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
      return;
    }

    if (todo) {
      const previousTodo = activeTodoRef.current;
      if (previousTodo && previousTodo.id !== todo.id) {
        void flushDescriptionValue(readPendingDescription(), previousTodo);
      }
      const nextForm = createFormFromTodo(todo, timeZone);
      activeTodoRef.current = todo;
      latestDescriptionRef.current = nextForm.description;
      setForm(nextForm);
      setHydratedTodoId(todo.id);
      lastAutoSavedBodyRef.current = JSON.stringify(buildTodoBody(nextForm));
      setAutoSaveState("saved");
      return;
    }

    reset();
    setAutoSaveState("idle");
    setDeleteConfirmOpen(false);
    setHydratedTodoId(null);
    lastAutoSavedBodyRef.current = "";
    activeTodoRef.current = null;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    if (noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
  }, [opened, selectedProjectId, timeZone, todo, statusOptions]);

  const save = useMutation({
    mutationFn: () => {
      const body = buildTodoBody();
      return todo ? api.patchTodo(todo.id, body) : api.createTodo(body);
    },
    onSuccess: async () => {
      if (todo) await qc.invalidateQueries({ queryKey: ["todo", todo.id] });
      await qc.invalidateQueries({ queryKey: ["todos"] });
      handleClose({ flush: false });
    },
  });

  const deleteTodo = useMutation({
    mutationFn: () => {
      if (!todo) throw new Error("Delete requires an existing TODO");
      return api.deleteTodo(todo.id);
    },
    onSuccess: async () => {
      if (todo) await qc.invalidateQueries({ queryKey: ["todo", todo.id] });
      await qc.invalidateQueries({ queryKey: ["todos"] });
      setDeleteConfirmOpen(false);
      handleClose({ flush: false });
    },
  });

  const autoSave = useMutation({
    mutationFn: ({ patch }: { patch: Record<string, unknown>; savedBody: Record<string, unknown> }) => {
      if (!todo) throw new Error("Auto-save requires an existing TODO");
      return api.patchTodo(todo.id, patch);
    },
    onMutate: () => {
      setAutoSaveState("saving");
    },
    onSuccess: async (updated, { savedBody }) => {
      const scheduleFields = scheduleFormFieldsFromTodo(updated, timeZone);
      setForm((current) => ({ ...current, ...scheduleFields }));
      const currentSaved = lastAutoSavedBodyRef.current ? (JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>) : {};
      const nextSaved = { ...currentSaved, ...savedBody };
      if ("plannedStartAt" in savedBody) nextSaved.plannedStartAt = dateTimeInputValueToUtc(scheduleFields.plannedStartAt, timeZone);
      if ("startAt" in savedBody) nextSaved.startAt = dateTimeInputValueToUtc(scheduleFields.startAt, timeZone);
      if ("dueAt" in savedBody) nextSaved.dueAt = dateTimeInputValueToUtc(scheduleFields.dueAt, timeZone);
      if ("endAt" in savedBody) nextSaved.endAt = dateTimeInputValueToUtc(scheduleFields.endAt, timeZone);
      lastAutoSavedBodyRef.current = JSON.stringify(nextSaved);
      setAutoSaveState("saved");
      qc.setQueryData(["todo", updated.id], updated);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["todo", updated.id] }),
        qc.invalidateQueries({ queryKey: ["todos"] }),
      ]);
    },
    onError: () => {
      setAutoSaveState("error");
    },
  });

  flushPendingAutoSaveRef.current = (includeDescription: boolean) => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    if (includeDescription && noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
    if (!opened || !todo || !form.title.trim()) return;

    const body = includeDescription ? buildTodoBodyWithLatestDescription() : buildTodoBody();
    if (!lastAutoSavedBodyRef.current) {
      lastAutoSavedBodyRef.current = JSON.stringify(body);
      return;
    }

    const previousBody = JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>;
    const patch = buildChangedTodoPatch(previousBody, body);
    if (!includeDescription) delete patch.description;
    if (Object.keys(patch).length === 0) return;

    const savedBody = { ...patch };
    setAutoSaveState("saving");
    void api
      .patchTodo(todo.id, patch)
      .then(async (updated) => {
        const scheduleFields = scheduleFormFieldsFromTodo(updated, timeZone);
        const currentSaved = lastAutoSavedBodyRef.current ? (JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>) : {};
        const nextSaved = { ...currentSaved, ...savedBody };
        if ("plannedStartAt" in savedBody) nextSaved.plannedStartAt = dateTimeInputValueToUtc(scheduleFields.plannedStartAt, timeZone);
        if ("startAt" in savedBody) nextSaved.startAt = dateTimeInputValueToUtc(scheduleFields.startAt, timeZone);
        if ("dueAt" in savedBody) nextSaved.dueAt = dateTimeInputValueToUtc(scheduleFields.dueAt, timeZone);
        if ("endAt" in savedBody) nextSaved.endAt = dateTimeInputValueToUtc(scheduleFields.endAt, timeZone);
        lastAutoSavedBodyRef.current = JSON.stringify(nextSaved);
        setAutoSaveState("saved");
        qc.setQueryData(["todo", updated.id], updated);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["todo", updated.id] }),
          qc.invalidateQueries({ queryKey: ["todos"] }),
        ]);
      })
      .catch(() => {
        setAutoSaveState("error");
      });
  };

  useEffect(() => {
    if (!opened || !todo || !form.title.trim()) return;
    const body = buildTodoBody();

    if (!lastAutoSavedBodyRef.current) {
      lastAutoSavedBodyRef.current = JSON.stringify(body);
      return;
    }

    const previousBody = JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>;
    const patch = buildChangedTodoPatch(previousBody, body);
    delete patch.description;
    if (Object.keys(patch).length === 0) {
      return;
    }

    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSave.mutate({ patch, savedBody: { ...patch } });
    }, PROPERTY_AUTOSAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    form.dueAt,
    form.endAt,
    form.iterationId,
    form.labelsCsv,
    form.parentId,
    form.pickedLabels,
    form.plannedStartAt,
    form.projectId,
    form.startAt,
    form.status,
    form.statusId,
    form.title,
    isA,
    opened,
    statusOptions,
    timeZone,
    todo,
  ]);

  useEffect(() => {
    if (!opened || !todo || !form.title.trim()) return;
    const body = buildTodoBody();
    const nextDescription = body.description ?? null;

    if (!lastAutoSavedBodyRef.current) {
      lastAutoSavedBodyRef.current = JSON.stringify(body);
      return;
    }

    const previousBody = JSON.parse(lastAutoSavedBodyRef.current) as Record<string, unknown>;
    if ((previousBody.description ?? null) === nextDescription) return;

    setAutoSaveState("idle");
    if (noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
    noteAutoSaveTimerRef.current = window.setTimeout(() => {
      autoSave.mutate({ patch: { description: nextDescription }, savedBody: { description: nextDescription } });
    }, NOTE_AUTOSAVE_DELAY_MS);

    return () => {
      if (noteAutoSaveTimerRef.current) window.clearTimeout(noteAutoSaveTimerRef.current);
    };
  }, [form.description, isA, opened, statusOptions, timeZone, todo]);

  const iterationSelectData = useMemo(
    () => [{ value: "", label: "なし" }, ...iterations.map((iteration) => ({ value: String(iteration.id), label: iteration.name }))],
    [iterations],
  );

  const disabledParentIds = useMemo(() => {
    if (!todo) return new Set<number>();
    const blocked = collectDescendantIds(todos as ApiTodo[], todo.id);
    blocked.add(todo.id);
    return blocked;
  }, [todo, todos]);

  const parentSelectData = useMemo(
    () => [
      { value: "", label: "なし" },
      ...(todos as ApiTodo[])
        .filter((item) => !disabledParentIds.has(item.id) && String(item.projectId ?? "") === (form.projectId ?? ""))
        .map((item) => ({ value: String(item.id), label: `#${item.id} ${item.title}` })),
    ],
    [disabledParentIds, form.projectId, todos],
  );

  const content = (
    <>
      <div className="todo-sidepanel__frame">
        <div className="todo-sidepanel__topbar">
          <Tooltip label="閉じる" position="right">
            <ActionIcon className="todo-sidepanel__close" variant="subtle" aria-label="詳細を閉じる" onClick={() => handleClose()}>
              <span className="todo-sidepanel__close-icon" aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
          <div className="todo-sidepanel__heading">
            <TextInput
              aria-label="タイトル"
              required
              placeholder={isEditing ? "Untitled TODO" : "新しい TODO"}
              value={form.title}
              variant="unstyled"
              classNames={{
                root: "todo-sidepanel__title-field",
                wrapper: "todo-sidepanel__title-wrapper",
                input: "todo-sidepanel__title-input",
              }}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
          <Group className="todo-sidepanel__actions" gap="xs">
            {isEditing && todo ? (
              <a
                className="todo-sidepanel__todo-link"
                href={todoUrl}
                aria-label={`TODO #${todo.id} の詳細を開く`}
                onClick={handleTodoLinkClick}
              >
                #{todo.id}
              </a>
            ) : null}
            {isEditing ? (
              <Tooltip label={autoSaveStatus.label}>
                <span
                  className={`todo-sidepanel__autosave todo-sidepanel__autosave--${autoSaveStatus.tone}`}
                  role="img"
                  aria-label={autoSaveStatus.label}
                >
                  <span className="todo-sidepanel__autosave-mark" aria-hidden="true" />
                </span>
              </Tooltip>
            ) : null}
            {!isEditing ? (
              <Button loading={save.isPending} disabled={!form.title.trim()} onClick={() => save.mutate()}>
                作成
              </Button>
            ) : null}
          </Group>
        </div>

        {save.isError ? (
          <Alert color="red" title={isEditing ? "更新に失敗しました" : "作成に失敗しました"} mx="lg" mt="md">
            {String((save.error as Error).message)}
          </Alert>
        ) : null}

        {deleteTodo.isError ? (
          <Alert color="red" title="削除に失敗しました" mx="lg" mt="md">
            {String((deleteTodo.error as Error).message)}
          </Alert>
        ) : null}

        <div className="todo-sidepanel__properties">
          {isA ? (
            <>
              <TextInput
                label="ステータス"
                value={form.status}
                classNames={leftFieldClassNames}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, status: event.target.value }))}
              />
              <Select
                label="イテレーション"
                data={iterationSelectData}
                value={form.iterationId ?? ""}
                onChange={(value: string | null) => setForm((current) => ({ ...current, iterationId: value || null }))}
                classNames={formFieldClassNames}
              />
              <TextInput
                label="labels_csv"
                value={form.labelsCsv}
                classNames={wideFieldClassNames}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setForm((current) => ({ ...current, labelsCsv: event.target.value }))
                }
                placeholder="docs, feature"
              />
            </>
          ) : (
            <>
              <Select
                label="ステータス"
                data={statusOptions}
                value={form.statusId ?? statusOptions[0]?.value ?? null}
                onChange={(value: string | null) => setForm((current) => ({ ...current, statusId: value }))}
                disabled={statusOptions.length === 0}
                classNames={leftFieldClassNames}
              />
              <Select
                label="イテレーション"
                data={iterationSelectData}
                value={form.iterationId ?? ""}
                onChange={(value: string | null) => setForm((current) => ({ ...current, iterationId: value || null }))}
                classNames={formFieldClassNames}
              />
              <MultiSelect
                label="ラベル"
                data={labelOptions}
                value={form.pickedLabels.map(String)}
                onChange={(values) =>
                  setForm((current) => ({
                    ...current,
                    pickedLabels: values.map(Number).filter((value) => !Number.isNaN(value)),
                  }))
                }
                placeholder="ラベルを選択"
                searchable
                clearable
                disabled={labelOptions.length === 0}
                classNames={wideFieldClassNames}
              />
            </>
          )}

          <Select
            label="プロジェクト"
            data={projectOptions}
            value={form.projectId ?? ""}
            onChange={(value: string | null) => setForm((current) => ({ ...current, projectId: value || null, parentId: null }))}
            searchable
            classNames={leftFieldClassNames}
          />
          <Select
            label="親 TODO"
            data={parentSelectData}
            value={form.parentId ?? ""}
            onChange={(value: string | null) => setForm((current) => ({ ...current, parentId: value || null }))}
            searchable
            classNames={formFieldClassNames}
          />

          <TextInput
            label="開始予定"
            type="datetime-local"
            value={form.plannedStartAt}
            classNames={leftFieldClassNames}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setForm((current) => ({ ...current, plannedStartAt: event.target.value }))
            }
          />
          <TextInput
            label="開始"
            type="datetime-local"
            value={form.startAt}
            classNames={formFieldClassNames}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, startAt: event.target.value }))}
          />
          <TextInput
            label="期限"
            type="datetime-local"
            value={form.dueAt}
            classNames={leftFieldClassNames}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
          />
          <TextInput
            label="終了"
            type="datetime-local"
            value={form.endAt}
            classNames={formFieldClassNames}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, endAt: event.target.value }))}
          />
        </div>

        <div className="todo-sidepanel__editor">
          <Stack gap="xs" className="todo-sidepanel__notes">
            <Group justify="space-between" align="center">
              <Text className="todo-sidepanel__section-title">Notes</Text>
              <Text size="xs" c="dimmed">
                # + Space で見出し / [] + Space でチェックリスト / Enter でリスト継続
              </Text>
            </Group>
            {!isEditing || hydratedTodoId === todo?.id ? (
              <MarkdownNoteEditor
                key={todo ? `todo-${todo.id}` : `new-${selectedProjectId ?? "all"}`}
                value={form.description}
                onChange={(description) => {
                  latestDescriptionRef.current = description;
                  setForm((current) => ({ ...current, description }));
                }}
                onCommit={(description) => {
                  latestDescriptionRef.current = description;
                  flushDescriptionValue(description);
                }}
              />
            ) : null}
          </Stack>
        </div>
        {isEditing ? (
          <div className="todo-sidepanel__footer">
            <Button color="red" variant="light" loading={deleteTodo.isPending} onClick={() => setDeleteConfirmOpen(true)}>
              削除
            </Button>
          </div>
        ) : null}
      </div>
      <Modal
        opened={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="TODO を削除しますか？"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            「{form.title || "Untitled TODO"}」を削除します。この操作は元に戻せません。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button color="red" loading={deleteTodo.isPending} onClick={() => deleteTodo.mutate()}>
              削除する
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );

  if (variant === "page") {
    return <div className="todo-sidepanel todo-sidepanel--page">{content}</div>;
  }

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      position="right"
      size="min(960px, 100vw)"
      padding={0}
      withCloseButton={false}
      classNames={{ content: "todo-sidepanel", body: "todo-sidepanel__body", header: "todo-sidepanel__header" }}
    >
      {content}
    </Drawer>
  );
}
