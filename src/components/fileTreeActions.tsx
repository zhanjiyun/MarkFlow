import { FilePlus, Pencil, Trash2 } from "lucide-react";
import type { ContextMenuAction } from "./ContextMenu";

export function getFileTreeActions(
  filePath: string,
  isDir: boolean,
  onCreateFile: (parentPath: string) => void,
  onRename: (filePath: string) => void,
  onDelete: (filePath: string, isDir: boolean) => void
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  if (isDir) {
    actions.push({
      label: "新建文件",
      icon: <FilePlus size={14} />,
      onClick: () => onCreateFile(filePath),
    });
  }

  actions.push({
    label: "重命名",
    icon: <Pencil size={14} />,
    onClick: () => onRename(filePath),
  });

  actions.push({
    label: "删除",
    icon: <Trash2 size={14} />,
    destructive: true,
    onClick: () => onDelete(filePath, isDir),
  });

  return actions;
}
