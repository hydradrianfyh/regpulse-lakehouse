import { useEffect, useState } from 'react';
import { getOntology } from '../lib/api-client';

interface OntologyResponse {
  jurisdictions: string[];
  source_types: string[];
  statuses: string[];
  topics: string[];
  impacted_areas: string[];
  priorities: string[];
  trust_tiers: string[];
  monitoring_stages: string[];
  allowed_domains: string[];
}

export function OntologyBrowser() {
  const [ontology, setOntology] = useState<OntologyResponse | null>(null);

  useEffect(() => {
    getOntology().then(setOntology).catch(() => setOntology(null));
  }, []);

  if (!ontology) {
    return (
      <div className="p-8 text-slate-500">加载本体中...</div>
    );
  }

  const sections: Array<{ title: string; items: string[] }> = [
    { title: 'Jurisdictions', items: ontology.jurisdictions },
    { title: 'Source Types', items: ontology.source_types },
    { title: 'Statuses', items: ontology.statuses },
    { title: 'Topics', items: ontology.topics },
    { title: 'Impacted Areas', items: ontology.impacted_areas },
    { title: 'Priorities', items: ontology.priorities },
    { title: 'Trust Tiers', items: ontology.trust_tiers },
    { title: 'Monitoring Stages', items: ontology.monitoring_stages },
    { title: 'Allowed Domains', items: ontology.allowed_domains }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Ontology 浏览</h2>
        <p className="mt-1 text-slate-500">用于约束结构化输出，防止幻觉</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{section.title}</h3>
            <div className="flex flex-wrap gap-2">
              {section.items.map((item) => (
                <span key={item} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
