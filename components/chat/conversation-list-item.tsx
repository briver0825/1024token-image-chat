"use client";

import {
  MessageSquareTextIcon,
  PinIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ConversationSummaryRecord } from "@/lib/image-chat/types";
import { cn } from "@/lib/utils";

type ConversationListItemProps = {
  conversation: ConversationSummaryRecord;
  active: boolean;
  onSelect: (conversationId: string) => void;
  onTogglePinned: (conversationId: string, pinned: boolean) => void;
  onDelete: (conversationId: string) => void;
};

export function ConversationListItem({
  conversation,
  active,
  onSelect,
  onTogglePinned,
  onDelete,
}: ConversationListItemProps) {
  return (
    <div
      className={cn(
        "group/row flex w-full min-w-0 items-start gap-0.5 overflow-hidden rounded-lg border p-0.5 transition-colors",
        active
          ? "border-primary/35 bg-primary/8"
          : "border-transparent hover:border-border/70 hover:bg-accent/30"
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={conversation.title}
            title="左键打开会话，右键打开操作菜单"
            className={cn(
              "h-auto min-w-0 flex-1 justify-start overflow-hidden rounded-md px-2 py-1.5 text-left",
              active
                ? "bg-transparent text-foreground hover:bg-transparent"
                : "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
            )}
            onClick={() => onSelect(conversation.id)}
            aria-pressed={active}
          >
            <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
              <div className="mt-0.5 shrink-0 rounded-md bg-primary/12 p-1 text-primary">
                <MessageSquareTextIcon className="size-3" />
              </div>
              <div className="w-0 min-w-0 flex-1 space-y-1">
                <div className="min-w-0 flex items-start gap-1.5">
                  <div
                    title={conversation.title}
                    className="min-w-0 flex-1 truncate overflow-hidden text-[13px] font-medium leading-[1.15rem] text-foreground"
                  >
                    {conversation.title}
                  </div>
                  {conversation.pinned ? (
                    <Badge
                      variant="secondary"
                      className="mt-0.5 h-4.5 shrink-0 gap-1 px-1.5 text-[10px] font-medium"
                    >
                      <PinIcon className="size-3" />
                      置顶
                    </Badge>
                  ) : null}
                </div>
                <div
                  className="text-[10px] leading-4 text-muted-foreground/85"
                  title="右键打开操作菜单"
                >
                  {conversation.messageCount} 条消息
                </div>
              </div>
            </div>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem
            onSelect={() => onTogglePinned(conversation.id, !conversation.pinned)}
          >
            <PinIcon className="size-4" />
            {conversation.pinned ? "取消置顶" : "置顶会话"}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDelete(conversation.id)}
          >
            <Trash2Icon className="size-4" />
            删除会话
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
