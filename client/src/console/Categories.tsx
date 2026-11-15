import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminCategory } from "@shared/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "./api";
import { PageHeader } from "./Layout";

const KEY = ["admin", "categories"];
/** Quick picks for grocery categories; any emoji can be typed instead. */
const ICONS = ["🥬", "🍎", "🍌", "🥕", "🧅", "🥔", "🍅", "🥛", "🧀", "🥚", "🥩", "🍗", "🐟", "🍞", "🍚", "🌽", "🫘", "🥜", "🧂", "🫒", "🍯", "🧃", "☕", "🍫", "🧴", "🧻", "🧼", "👶"];

/** Owner-only: the categories customers browse in the app. */
export default function Categories() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const list = useQuery({ queryKey: KEY, queryFn: () => api<AdminCategory[]>("/admin/categories") });
  const refresh = () => {
    client.invalidateQueries({ queryKey: KEY });
    client.invalidateQueries({ queryKey: ["categories"] }); // product dialog's dropdown
  };
  const fail = (title: string) => (e: Error) => toast({ title, description: e.message, variant: "destructive" });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api<AdminCategory[]>("/admin/categories/order", { method: "PUT", body: { ids } }),
    onMutate: (ids) => {
      // Move rows straight away; the server's answer replaces this.
      const prev = client.getQueryData<AdminCategory[]>(KEY) ?? [];
      client.setQueryData(KEY, ids.map((id) => prev.find((c) => c.id === id)!));
      return { prev };
    },
    onSuccess: (rows) => client.setQueryData(KEY, rows),
    onError: (e: Error, _ids, ctx) => {
      if (ctx) client.setQueryData(KEY, ctx.prev);
      fail("Couldn't reorder")(e);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["categories"] }),
  });

  const remove = useMutation({
    mutationFn: (c: AdminCategory) => api(`/admin/categories/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      setDeleting(null);
    },
    onError: (e: Error) => {
      setDeleting(null);
      fail("Couldn't delete")(e);
    },
  });

  const rows = list.data ?? [];
  const move = (i: number, by: -1 | 1) => {
    const ids = rows.map((c) => c.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        description="What customers browse in the app, in this order. A category can only be deleted once it has no products."
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1" /> New category</Button>}
      />
      {list.isLoading ? (
        <Skeleton className="h-48 w-full max-w-2xl" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet. Add one to start grouping products.</p>
      ) : (
        <ol className="max-w-2xl rounded-md border bg-background divide-y">
          {rows.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-6 text-sm text-muted-foreground text-right">{i + 1}</span>
              <span className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xl" aria-hidden>{c.icon || "🧺"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.productCount} product{c.productCount === 1 ? "" : "s"}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={i === rows.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleting(c)}
                  disabled={c.productCount > 0}
                  title={c.productCount > 0 ? "Move its products to another category first" : undefined}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing && <CategoryDialog category={editing === "new" ? null : editing} onDone={refresh} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from the app straight away. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting); }} disabled={remove.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryDialog({ category, onDone, onClose }: { category: AdminCategory | null; onDone: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), icon: icon.trim() || null };
      return category
        ? api(`/admin/categories/${category.id}`, { method: "PATCH", body })
        : api("/admin/categories", { method: "POST", body });
    },
    onSuccess: () => {
      onDone();
      toast({ title: category ? "Category saved" : "Category added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? `Edit ${category.name}` : "New category"}</DialogTitle></DialogHeader>
        <form id="category-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus placeholder="e.g. Fruits" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-icon">Icon</Label>
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-2xl" aria-hidden>{icon || "🧺"}</span>
              <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} className="w-28 text-xl" placeholder="🧺" aria-describedby="icon-help" />
              {icon && <Button type="button" variant="ghost" size="sm" onClick={() => setIcon("")}>Clear</Button>}
            </div>
            <p id="icon-help" className="text-xs text-muted-foreground">Pick one below or type any emoji. Shown in the app's category bubbles.</p>
            <div className="flex flex-wrap gap-1">
              {ICONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`h-9 w-9 rounded-md text-xl hover:bg-muted ${icon === e ? "bg-primary/15 ring-1 ring-primary" : ""}`}
                  aria-label={`Use ${e}`}
                  aria-pressed={icon === e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="category-form" disabled={!name.trim() || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
