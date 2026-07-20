export function priorityBadgeVariant(
  priority: string | undefined,
): "destructive" | "outline" {
  return priority === "stat" || priority === "urgent" ? "destructive" : "outline";
}
