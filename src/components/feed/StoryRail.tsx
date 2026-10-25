import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/base";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

export default function StoryRail() {
  const { stories, users, currentUser } = useApp();

  const byHouse = new Map<string, { story: any; house: any }>();
  stories.forEach((s) => {
    const h = users.find((u) => u.id === s.houseId);
    if (h && !byHouse.has(h.id)) byHouse.set(h.id, { story: s, house: h });
  });
  const items = Array.from(byHouse.values()).slice(0, 12);

  return (
    <div className="scroll-x -mx-1 px-1">
      <div className="flex gap-3 pb-1">
        <button className="shrink-0 w-28 h-44 rounded-2xl border-2 border-dashed border-border bg-card hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center">
            <Plus className="h-5 w-5" />
          </div>
          <div className="text-xs font-semibold text-center px-2">
            {currentUser?.type === "commercial" ? "Novo story da casa" : "Publicar momento"}
          </div>
        </button>
        {items.map(({ story, house }) => (
          <Link
            key={story.id}
            to={`/casa/${house.id}`}
            className="relative shrink-0 w-28 h-44 rounded-2xl overflow-hidden shadow-card group"
            style={{
              backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.7)), url(${story.image})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute top-2 left-2">
              <Avatar src={house.avatar} name={house.name} size={34} ring="gold" />
            </div>
            <div className="absolute inset-x-2 bottom-2">
              <div className="text-white text-xs font-semibold line-clamp-2 drop-shadow">{house.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
