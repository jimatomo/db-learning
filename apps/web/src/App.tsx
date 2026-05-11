import {
  AppShell,
  Badge,
  Box,
  Burger,
  Container,
  Drawer,
  Group,
  Loader,
  Select,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Lesson } from "./api";
import BacklogPage from "./pages/BacklogPage";
import InsightsPage from "./pages/InsightsPage";
import SettingsPage from "./pages/SettingsPage";
import TodoDetailPage from "./pages/TodoDetailPage";

const KanbanPage = lazy(() => import("./pages/KanbanPage"));

const nav = [
  { to: "/", end: true, label: "Kanban", icon: "kanban" },
  { to: "/backlog", label: "Backlog", icon: "backlog" },
  { to: "/insights", label: "Insights", icon: "insights" },
  { to: "/settings", label: "Settings", icon: "settings" },
] as const;

type NavIconName = (typeof nav)[number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "kanban") {
    return (
      <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 3.5h3v9h-3v-9Zm4 0h3v5h-3v-5Zm4 0h3v7h-3v-7Z" />
      </svg>
    );
  }

  if (name === "backlog") {
    return (
      <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 4h10v1.5H3V4Zm0 3.25h10v1.5H3v-1.5Zm0 3.25h6.5V12H3v-1.5Z" />
      </svg>
    );
  }

  if (name === "insights") {
    return (
      <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 12.5V8h2v4.5H3Zm4 0V4h2v8.5H7Zm4 0V6.5h2v6h-2Z" />
      </svg>
    );
  }

  return (
    <svg className="top-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7.25 2.5h1.5l.35 1.6c.33.12.64.3.93.54l1.56-.5.75 1.3-1.2 1.1c.03.15.04.3.04.46s-.01.31-.04.46l1.2 1.1-.75 1.3-1.56-.5c-.29.24-.6.42-.93.54l-.35 1.6h-1.5L6.9 9.9a3.55 3.55 0 0 1-.93-.54l-1.56.5-.75-1.3 1.2-1.1A2.9 2.9 0 0 1 4.82 7c0-.16.01-.31.04-.46l-1.2-1.1.75-1.3 1.56.5c.29-.24.6-.42.93-.54l.35-1.6ZM8 5.75A1.25 1.25 0 1 0 8 8.25 1.25 1.25 0 0 0 8 5.75Z" />
    </svg>
  );
}

function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Group gap={4} className="top-nav" wrap="wrap">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={"end" in item ? item.end : false}
          className="top-nav__link"
          onClick={onNavigate}
        >
          {({ isActive }) => (
            <Box className={`top-nav__pill${isActive ? " top-nav__pill--active" : ""}`}>
              <NavIcon name={item.icon} />
              <Text className="top-nav__label">{item.label}</Text>
            </Box>
          )}
        </NavLink>
      ))}
    </Group>
  );
}

export default function App() {
  const fallbackLesson = "c" as Lesson;
  const [opened, { toggle, close }] = useDisclosure(false);
  const { data: meta } = useQuery({ queryKey: ["lesson"], queryFn: api.lesson });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [selectedProject, setSelectedProject] = useState<string>(() => window.localStorage.getItem("selectedProjectId") ?? "");
  const lessonLabel = (meta?.lesson ?? fallbackLesson).toUpperCase();
  const location = useLocation();
  const currentNav = nav.find((item) => item.to === location.pathname || (item.to === "/" && location.pathname === "/"));
  const selectedProjectId = selectedProject ? Number(selectedProject) : null;
  const projectData = useMemo(
    () => [{ value: "", label: "All projects" }, ...projects.map((project) => ({ value: String(project.id), label: project.name }))],
    [projects],
  );

  useEffect(() => {
    if (selectedProject && !projects.some((project) => String(project.id) === selectedProject)) {
      setSelectedProject("");
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      window.localStorage.setItem("selectedProjectId", selectedProject);
      return;
    }
    window.localStorage.removeItem("selectedProjectId");
  }, [selectedProject]);

  return (
    <AppShell
      header={{ height: 64 }}
      padding={0}
      styles={{
        main: {
          background: "linear-gradient(180deg, #f8f7f4 0%, #f2f1ed 100%)",
          minHeight: "100dvh",
        },
        header: {
          borderBottom: "1px solid rgba(30, 36, 50, 0.08)",
          background: "rgba(248, 247, 244, 0.94)",
          backdropFilter: "blur(12px)",
        },
      }}
    >
      <AppShell.Header>
        <Container fluid h="100%" px={20}>
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="md" wrap="nowrap">
              <Box className="brand-mark">
                <Text className="brand-mark__eyebrow">db learning</Text>
                <Text className="brand-mark__title">Tasks</Text>
              </Box>
              <Box visibleFrom="sm">
                <AppNav />
              </Box>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Select
                aria-label="Project filter"
                data={projectData}
                value={selectedProject}
                onChange={(value) => setSelectedProject(value ?? "")}
                size="xs"
                w={{ base: 160, sm: 220 }}
                comboboxProps={{ withinPortal: true }}
              />
              {currentNav ? (
                <Text size="sm" c="dimmed" visibleFrom="sm">
                  {currentNav.label}
                </Text>
              ) : null}
              <Badge variant="filled" color="brand" size="lg" radius="sm">
                Lesson {lessonLabel}
              </Badge>
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" aria-label="Open navigation" />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} hiddenFrom="sm" size="100%" padding="lg" title="Navigation">
        <AppNav onNavigate={close} />
      </Drawer>

      <AppShell.Main>
        <Container fluid py={20} px={20}>
          <Routes>
            <Route
              path="/"
              element={
                <Suspense
                  fallback={
                    <Group justify="center" py="xl">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        読み込み中…
                      </Text>
                    </Group>
                  }
                >
                  <KanbanPage selectedProjectId={selectedProjectId} />
                </Suspense>
              }
            />
            <Route path="/backlog" element={<BacklogPage selectedProjectId={selectedProjectId} />} />
            <Route path="/todos/:id" element={<TodoDetailPage selectedProjectId={selectedProjectId} />} />
            <Route path="/insights" element={<InsightsPage selectedProjectId={selectedProjectId} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
