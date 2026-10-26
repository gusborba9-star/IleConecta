import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/base";
import { INFO_PAGES, REVIEW_PENDING, findInfoPage } from "@/content/institutional";
import NotFound from "@/pages/NotFound";

export default function Info() {
  const { slug } = useParams();
  const page = findInfoPage(slug);
  if (!page) return <NotFound />;
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6">
        <h1 className="font-display font-bold text-2xl">{page.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{page.summary}</p>
        {REVIEW_PENDING && <p className="text-xs text-muted-foreground mt-3">Versão preliminar, em revisão.</p>}
        <div className="mt-5 space-y-5">
          {page.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2 className="font-display font-bold text-lg mb-1">{s.heading}</h2>}
              {s.paragraphs?.map((p, j) => (
                <p key={j} className="text-sm leading-relaxed mb-2">{p}</p>
              ))}
              {s.bullets && (
                <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
                  {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </Card>
      <Card className="p-4 text-sm flex flex-wrap gap-x-4 gap-y-1">
        {INFO_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
          <Link key={p.slug} to={`/sobre/${p.slug}`} className="text-primary hover:underline">{p.title}</Link>
        ))}
      </Card>
    </div>
  );
}
