import { useState } from "react";
import type { Post } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { Heart, MessageCircle, Share2, MoreHorizontal, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, timeAgo } from "@/lib/utils";
import RitualCard from "./RitualCard";

export default function PostCard({ post }: { post: Post }) {
  const { users, currentUser, toggleLike, commentPost, rituals } = useApp();
  const [text, setText] = useState("");
  const [showComments, setShowComments] = useState(false);

  const author = users.find((u) => u.id === post.houseId);
  const isHouse = author?.type === "commercial";
  const liked = currentUser ? post.likes.includes(currentUser.id) : false;
  const ritual = post.ritualId ? rituals.find((r) => r.id === post.ritualId) : null;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <Link to={isHouse ? `/casa/${author?.id}` : "#"}>
          <Avatar src={author?.avatar} name={author?.name} size={44} ring={isHouse ? "gold" : "none"} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={isHouse ? `/casa/${author?.id}` : "#"} className="font-semibold hover:underline">
              {author?.name}
            </Link>
            {isHouse && (author as any)?.verified && <Badge tone="primary">Verificada</Badge>}
            {post.kind !== "geral" && (
              <Badge tone={post.kind === "ritual" ? "gold" : post.kind === "buzios" ? "forest" : "muted"}>
                {post.kind === "buzios" ? "Búzios" : post.kind === "trabalho" ? "Trabalho" : post.kind === "ritual" ? "Ritual" : ""}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {isHouse ? `${(author as any).city} · ${(author as any).category}` : "Cliente"} · {timeAgo(post.createdAt)}
          </div>
        </div>
        <button className="h-8 w-8 rounded-full hover:bg-muted grid place-items-center text-muted-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</div>

      {post.image && (
        <div className="border-t border-border">
          <img src={post.image} alt="" className="w-full max-h-[520px] object-cover" />
        </div>
      )}

      {ritual && (
        <div className="p-4 pt-3 border-t border-border">
          <RitualCard ritual={ritual} compact />
        </div>
      )}

      <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{post.likes.length} curtidas</span>
        <button onClick={() => setShowComments((v) => !v)}>{post.comments.length} comentários</button>
      </div>

      <div className="px-2 pb-2 border-t border-border grid grid-cols-3">
        <ActionBtn active={liked} onClick={() => toggleLike(post.id)} icon={Heart} label="Curtir" activeClass="text-primary" />
        <ActionBtn onClick={() => setShowComments((v) => !v)} icon={MessageCircle} label="Comentar" />
        <ActionBtn icon={Share2} label="Compartilhar" />
      </div>

      {showComments && (
        <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/40">
          {post.comments.map((c) => {
            const u = users.find((x) => x.id === c.userId);
            return (
              <div key={c.id} className="flex gap-2">
                <Avatar src={u?.avatar} name={u?.name} size={32} />
                <div className="bg-card rounded-2xl px-3 py-2 border border-border">
                  <div className="text-xs font-semibold">{u?.name}</div>
                  <div className="text-sm">{c.text}</div>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2">
            <Avatar src={currentUser?.avatar} name={currentUser?.name} size={32} />
            <div className="flex-1 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) {
                    commentPost(post.id, text.trim());
                    setText("");
                  }
                }}
                placeholder="Escreva um comentário..."
                className="flex-1 h-10 px-4 rounded-full bg-card border border-input text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (text.trim()) {
                    commentPost(post.id, text.trim());
                    setText("");
                  }
                }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  active,
  activeClass,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  activeClass?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-muted transition",
        active ? activeClass : "text-muted-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "fill-current" : "")} />
      {label}
    </button>
  );
}
