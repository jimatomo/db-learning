import { Alert, Group, Loader, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import TodoSidePanel from "../ui/TodoSidePanel";

export default function TodoDetailPage({ selectedProjectId }: { selectedProjectId: number | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const todoId = Number(id);
  const canFetch = Number.isInteger(todoId) && todoId > 0;
  const closeTo = typeof location.state?.from === "string" ? location.state.from : "/backlog";
  const { data: todo, error, isLoading } = useQuery({
    queryKey: ["todo", todoId],
    queryFn: () => api.todo(todoId),
    enabled: canFetch,
  });

  const handleClose = () => {
    navigate(closeTo, { replace: true });
  };

  if (!canFetch) {
    return (
      <Alert color="red" title="TODO が見つかりません">
        URL の TODO 番号を確認してください。
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          TODO を読み込み中…
        </Text>
      </Group>
    );
  }

  if (error || !todo) {
    return (
      <Alert color="red" title="TODO を開けません">
        {String((error as Error | undefined)?.message ?? "指定された TODO は存在しません。")}
      </Alert>
    );
  }

  return <TodoSidePanel opened todo={todo} selectedProjectId={selectedProjectId} onClose={handleClose} variant="page" />;
}
