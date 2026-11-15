import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus } from "lucide-react";
import { LOW_STOCK_THRESHOLD, type CategoryResponse, type ProductResponse } from "@shared/api";
import type { InventoryMovement } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, fmtDateTime, ugx } from "./api";
import { PageHeader } from "./Layout";
import { useAdmin } from "./session";

type StockMode = "count" | "restock" | "adjustment";

function StockCell({ p }: { p: ProductResponse }) {
  if (p.stockQuantity == null) return <span className="text-muted-foreground">Not counted</span>;
  if (p.stockQuantity === 0) return <span className="text-destructive font-semibold">0</span>;
  if (p.stockQuantity <= LOW_STOCK_THRESHOLD) return <span className="text-amber-700 font-semibold">{p.stockQuantity}</span>;
  return <span>{p.stockQuantity}</span>;
}

export default function Products() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { isOwner } = useAdmin();
  const [filter, setFilter] = useState("");
  const [stockFor, setStockFor] = useState<ProductResponse | null>(null);
  const [editing, setEditing] = useState<ProductResponse | "new" | null>(null);
  const [historyFor, setHistoryFor] = useState<ProductResponse | null>(null);

  const products = useQuery({ queryKey: ["admin", "products"], queryFn: () => api<ProductResponse[]>("/products") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<CategoryResponse[]>("/categories") });
  const catName = (id: number | null) => categories.data?.find((c) => c.id === id)?.name ?? "—";

  const toggle = useMutation({
    mutationFn: (p: ProductResponse) => api(`/products/${p.id}`, { method: "PUT", body: { inStock: !(p.inStock ?? true) } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const rows = (products.data ?? []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Products & stock"
        description={`Stock changes are recorded in a ledger. 'Not counted' products sell without a limit.${isOwner ? "" : " Ask an owner to change products or prices."}`}
        actions={isOwner && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1" /> New product</Button>}
      />
      <Input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs mb-3" />

      {products.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>On sale</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{catName(p.categoryId)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{ugx(p.price)}</TableCell>
                  <TableCell className="text-right"><StockCell p={p} /></TableCell>
                  <TableCell>
                    <Switch checked={p.inStock !== false} onCheckedChange={() => toggle.mutate(p)} disabled={!isOwner} aria-label={`${p.name} on sale`} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap space-x-1">
                    <Button size="sm" variant="secondary" onClick={() => setStockFor(p)}>Stock</Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(p)} aria-label="Stock history"><History className="h-4 w-4" /></Button>
                    {isOwner && <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {stockFor && <StockDialog product={stockFor} onClose={() => setStockFor(null)} />}
      {editing && <ProductDialog product={editing === "new" ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      {historyFor && <HistoryDialog product={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function StockDialog({ product, onClose }: { product: ProductResponse; onClose: () => void }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<StockMode>(product.stockQuantity == null ? "count" : "restock");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && (mode === "count" ? n >= 0 : n > 0);

  const save = useMutation({
    mutationFn: () =>
      api<ProductResponse>(`/products/${product.id}/stock`, {
        method: "POST",
        body:
          mode === "count"
            ? { set: n, reason: "count", ...(note && { note }) }
            : { delta: mode === "restock" ? n : -n, reason: mode, ...(note && { note }) },
      }),
    onSuccess: (p) => {
      client.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: `${product.name}: ${p.stockQuantity} in stock` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't update stock", description: e.message, variant: "destructive" }),
  });

  const current = product.stockQuantity;
  const preview = !valid ? null : mode === "count" ? n : mode === "restock" ? (current ?? 0) + n : (current ?? 0) - n;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Stock: {product.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Current: {current == null ? "not counted (unlimited)" : current}</p>
        <div className="grid grid-cols-3 gap-2">
          {([["count", "Set count"], ["restock", "Delivery in"], ["adjustment", "Write off"]] as const).map(([m, label]) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)} disabled={m !== "count" && current == null}>
              {label}
            </Button>
          ))}
        </div>
        {current == null && <p className="text-xs text-muted-foreground">Enter a physical count first to start tracking this product.</p>}
        <div className="space-y-1">
          <Label htmlFor="qty">{mode === "count" ? "Units on the shelf" : mode === "restock" ? "Units received" : "Units removed (damaged, expired…)"}</Label>
          <Input id="qty" type="number" min={0} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier, reason…" />
        </div>
        {preview !== null && (
          <p className={`text-sm ${preview < 0 ? "text-destructive" : ""}`}>
            New stock: <span className="font-semibold">{preview}</span>{preview < 0 && " (can't go below zero)"}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!valid || (preview ?? 0) < 0 || save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductDialog({ product, categories, onClose }: { product: ProductResponse | null; categories: CategoryResponse[]; onClose: () => void }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(Math.round(Number(product.price))) : "",
    image: product?.image ?? "",
    categoryId: product?.categoryId ? String(product.categoryId) : "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const valid = form.name.trim().length > 1 && /^\d+(\.\d{1,2})?$/.test(form.price);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: form.price,
        image: form.image.trim() || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
      };
      return product ? api(`/products/${product.id}`, { method: "PUT", body }) : api("/products", { method: "POST", body });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: product ? "Product updated" : "Product created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{product ? `Edit ${product.name}` : "New product"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={set("name")} maxLength={200} /></div>
          <div className="space-y-1"><Label>Price (UGX)</Label><Input value={form.price} onChange={set("price")} inputMode="numeric" /></div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
              <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={set("description")} /></div>
          <div className="space-y-1"><Label>Image URL</Label><Input value={form.image} onChange={set("image")} placeholder="https://…" maxLength={500} /></div>
          {!product && <p className="text-xs text-muted-foreground">New products start as "not counted". Use Stock → Set count to start tracking.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const reasonLabel: Record<string, string> = {
  order: "Order", order_cancelled: "Order cancelled", count: "Count", restock: "Delivery in", adjustment: "Write-off",
};

function HistoryDialog({ product, onClose }: { product: ProductResponse; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "movements", product.id],
    queryFn: () => api<InventoryMovement[]>(`/products/${product.id}/stock-movements`),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Stock history: {product.name}</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-40" /> : !data?.length ? (
          <p className="text-sm text-muted-foreground">No stock changes yet.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Note</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{reasonLabel[m.reason] ?? m.reason}</Badge>
                      {m.orderId && <span className="text-xs text-muted-foreground ml-1">#{m.orderId}</span>}
                    </TableCell>
                    <TableCell className={`text-right ${m.delta < 0 ? "text-destructive" : "text-green-700"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</TableCell>
                    <TableCell className="text-right">{m.balance}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
