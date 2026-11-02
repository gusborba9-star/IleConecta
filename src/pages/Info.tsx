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
        <div className="-mx-6 -mt-6 mb-5 rounded-t-2xl px-6 py-5 page-hero !shadow-none border-0 border-b border-gold/40">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Normas e transparência</div>
          <h1 className="font-display font-bold text-2xl mt-1">{page.title}</h1>
        </div>
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
          <Link key={p.slug} to={`/sobre/${p.slug}`} className="text-forest font-semibold hover:underline">{p.title}</Link>
        ))}
      </Card>
    </div>
  );
}
