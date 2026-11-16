import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { issueCategoryLabels, type IssueResponse } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, fmtDateTime } from "./api";
import { PageHeader } from "./Layout";

type Row = IssueResponse & { customerPhone: string | null; customerEmail: string | null };

export default function Issues() {
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "issues", status],
    queryFn: () => api<Row[]>(`/admin/issues?status=${status}`),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader title="Support issues" description="Problems customers reported from the app." />
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? <Skeleton className="h-40" /> : !data?.length ? (
        <p className="text-muted-foreground">No {status === "all" ? "" : status} issues.</p>
      ) : (
        <div className="space-y-3">{data.map((i) => <IssueCard key={i.id} issue={i} />)}</div>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: Row }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [resolution, setResolution] = useState("");
  const update = useMutation({
    mutationFn: (status: "open" | "resolved") =>
      api(`/admin/issues/${issue.id}`, { method: "PATCH", body: { status, ...(resolution.trim() && { resolution: resolution.trim() }) } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={issue.status === "open" ? "destructive" : "secondary"}>{issue.status}</Badge>
          <span className="font-semibold">{issueCategoryLabels[issue.category as keyof typeof issueCategoryLabels] ?? issue.category}</span>
          {issue.orderId && <span className="text-muted-foreground">Order #{issue.orderId}</span>}
          {issue.customerPhone && <a className="text-primary" href={`tel:${issue.customerPhone}`}>{issue.customerPhone}</a>}
          {issue.customerEmail && <a className="text-primary" href={`mailto:${issue.customerEmail}`}>{issue.customerEmail}</a>}
          <span className="ml-auto text-muted-foreground">{fmtDateTime(issue.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap">{issue.message}</p>
        {issue.status === "resolved" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">Resolved {fmtDateTime(issue.resolvedAt)}{issue.resolution ? `: ${issue.resolution}` : ""}</p>
            <Button size="sm" variant="ghost" onClick={() => update.mutate("open")}>Reopen</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-end">
            <Textarea
              rows={2}
              className="flex-1 min-w-[240px]"
              placeholder="What was done (e.g. refunded UGX 2,500 cash, replacement sent)"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
            <Button onClick={() => update.mutate("resolved")} disabled={update.isPending}>Mark resolved</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
