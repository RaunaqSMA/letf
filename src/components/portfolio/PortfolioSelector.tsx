import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortfolioMutations } from "@/lib/portfolio/hooks";
import type { Portfolio } from "@/lib/portfolio/types";

export function PortfolioSelector({
  portfolios,
  value,
  onChange,
  allowCreate = true,
}: {
  portfolios: Portfolio[];
  value: string | undefined;
  onChange: (id: string) => void;
  allowCreate?: boolean;
}) {
  const { create } = usePortfolioMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="flex items-center gap-2">
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="num min-w-44">
          <SelectValue placeholder="Select portfolio" />
        </SelectTrigger>
        <SelectContent>
          {portfolios.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {allowCreate ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" aria-label="New portfolio">
              <Plus className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New portfolio</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="label-xs">Name</Label>
              <Input
                value={name}
                placeholder="LETF Experiments"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={!name.trim() || create.isPending}
                onClick={async () => {
                  try {
                    const p = await create.mutateAsync({ name: name.trim() });
                    onChange(p.id);
                    setName("");
                    setOpen(false);
                    toast.success(`Created ${p.name}`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
