export type Lesson = "a" | "b" | "c";
export type AppTimeZone = "UTC" | "Asia/Tokyo";

export type ApiTodo = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  statusId: number | null;
  labels: { id: number; name: string; color?: string }[];
  projectId: number | null;
  iterationId: number | null;
  parentId: number | null;
  plannedStartAt: string | null;
  startAt: string | null;
  dueAt: string | null;
  endAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiIteration = {
  id: number;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
};

export type ApiProject = {
  id: number;
  name: string;
  sortOrder: number;
};

export type ApiStatus = { id: number; name: string; sortOrder: number; color: string; autoStart: boolean; autoEnd: boolean };

export type ApiLabel = { id: number; name: string; color: string };

async function j<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json() as Promise<T>;
}

export const api = {
  lesson: () => j<{ lesson: Lesson }>("/api/meta/lesson"),
  settings: () => j<{ timeZone: AppTimeZone }>("/api/settings"),
  patchSettings: (body: { timeZone: AppTimeZone }) =>
    j<{ timeZone: AppTimeZone }>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  todos: (projectId?: number | null) => j<ApiTodo[]>(projectId == null ? "/api/todos" : `/api/todos?projectId=${projectId}`),
  todo: (id: number) => j<ApiTodo>(`/api/todos/${id}`),
  createTodo: (body: Record<string, unknown>) =>
    j<ApiTodo>("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patchTodo: (id: number, body: Record<string, unknown>) =>
    j<ApiTodo>(`/api/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  deleteTodo: (id: number) => fetch(`/api/todos/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
  }),
  iterations: () => j<ApiIteration[]>("/api/iterations"),
  createIteration: (body: Record<string, unknown>) =>
    j<ApiIteration>("/api/iterations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patchIteration: (id: number, body: Record<string, unknown>) =>
    j<ApiIteration>(`/api/iterations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  deleteIteration: (id: number) =>
    fetch(`/api/iterations/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
    }),
  projects: () => j<ApiProject[]>("/api/projects"),
  createProject: (body: Record<string, unknown>) =>
    j<ApiProject>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patchProject: (id: number, body: Record<string, unknown>) =>
    j<ApiProject>(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  deleteProject: (id: number) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
    }),
  labels: () => j<ApiLabel[]>("/api/labels"),
  createLabel: (body: { name: string; color?: string }) =>
    j<ApiLabel>("/api/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patchLabel: (id: number, body: { name?: string; color?: string }) =>
    j<ApiLabel>(`/api/labels/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  deleteLabel: (id: number) =>
    fetch(`/api/labels/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
    }),
  statuses: () => j<ApiStatus[]>("/api/statuses"),
  createStatus: (body: { name: string; sortOrder?: number; color?: string; autoStart?: boolean; autoEnd?: boolean }) =>
    j<ApiStatus>("/api/statuses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patchStatus: (id: number, body: { name?: string; sortOrder?: number; color?: string; autoStart?: boolean; autoEnd?: boolean }) =>
    j<ApiStatus>(`/api/statuses/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  insights: (iterationId: number, projectId?: number | null) =>
    j<{
      iterationId: number;
      projectId: number | null;
      labels: { name: string; count: number }[];
      events: { eventType: string; count: number }[];
      completionTimes: { todoId: number; title: string; startAt: string; endAt: string; durationHours: number }[];
      engine?: string;
    }>(projectId == null ? `/api/insights/iterations/${iterationId}` : `/api/insights/iterations/${iterationId}?projectId=${projectId}`),
  iterationTrends: (projectId?: number | null) =>
    j<{
      projectId: number | null;
      iterations: {
        iterationId: number;
        iterationName: string;
        startsAt: string | null;
        endsAt: string | null;
        total: number;
        completed: number;
        started: number;
      }[];
      engine?: string;
    }>(projectId == null ? "/api/insights/iteration-trends" : `/api/insights/iteration-trends?projectId=${projectId}`),
  replay: (iterationId: number, projectId?: number | null) =>
    j<{
      iterationId: number;
      projectId: number | null;
      events: {
        id: number;
        todoId: number | null;
        eventType: string;
        fieldName: string | null;
        fromValue: string | null;
        toValue: string | null;
        occurredAt: string;
        actor: string | null;
        projectId: number | null;
      }[];
    }>(
      projectId == null
        ? `/api/insights/iterations/${iterationId}/replay`
        : `/api/insights/iterations/${iterationId}/replay?projectId=${projectId}`,
    ),
};
