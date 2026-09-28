import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMessages, deleteMessage } from "@/lib/api/messages";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/DataStates";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () => ({
    meta: [
      { title: "Messages — HABÄNE Admin" },
      { name: "description", content: "Customer contact messages." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const qc = useQueryClient();
  const msgs = useQuery({ queryKey: ["messages"], queryFn: () => getMessages() });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMessage(id),
    onSuccess: () => {
      toast.success("Message deleted");
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Communications"
        title="Contact Messages"
        description="Inquiries submitted via the store contact form."
      />

      {msgs.isLoading ? (
        <LoadingState />
      ) : msgs.error ? (
        <ErrorState error={msgs.error} onRetry={() => msgs.refetch()} />
      ) : msgs.data!.length === 0 ? (
        <EmptyState
          title="No messages"
          description="When customers use the contact form, their messages will appear here."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Message</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {msgs.data!.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{dateTime(m.created_at)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{m.name}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>{m.subject}</TableCell>
                  <TableCell className="max-w-[400px]">
                    <div className="truncate text-xs text-muted-foreground" title={m.message}>
                      {m.message}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove.mutate(m.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
