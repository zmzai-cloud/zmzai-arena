import type { LearnBlock } from "@/data/learn";
import { Diagram } from "./Diagrams";

// 学堂正文渲染器:受控 block → JSX,不引 MDX 引擎
export function LearnBlocks({ body }: { body: LearnBlock[] }) {
  return (
    <div className="text-[14.5px] leading-[1.9] text-ink-2">
      {body.map((b, i) => {
        switch (b.t) {
          case "h":
            return (
              <h2 key={i} className="mt-8 mb-2 text-[16px] font-bold text-ink">
                {b.x}
              </h2>
            );
          case "p":
            return (
              <p key={i} className="my-3">
                {b.x}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="my-3 list-disc space-y-1.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="my-3 list-decimal space-y-1.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <div key={i} className="my-4 rounded-r-lg border-l-4 border-accent bg-surface-2/50 px-4 py-3 text-[13px] text-ink-2">
                {b.x}
              </div>
            );
          case "table":
            return (
              <div key={i} className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {b.headers.map((h, j) => (
                        <th key={j} className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-b border-line/60">
                        {row.map((c, k) => (
                          <td key={k} className="px-3 py-2 align-top">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "diagram":
            return <Diagram key={i} id={b.id} />;
          case "case":
            return (
              <div key={i} className="my-4 rounded-xl border border-line bg-surface p-4">
                <div className="mb-2 text-[13px] font-bold text-ink">{b.title}</div>
                <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px]">
                  {b.lines.map((l, j) => (
                    <li key={j}>{l}</li>
                  ))}
                </ol>
              </div>
            );
          case "links":
            return (
              <div key={i} className="my-5 rounded-xl border border-line bg-surface-2/40 p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">延伸阅读</div>
                <div className="flex flex-col gap-1.5">
                  {b.items.map((l, j) => (
                    <a key={j} href={`/learn/${l.slug}`} className="text-[13.5px] font-medium text-accent hover:underline">
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
