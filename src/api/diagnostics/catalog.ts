export interface DiagnosticRoute {
  path: string;
  purpose: string;
  drillDown?: string[];
}

export const DIAGNOSTIC_ROUTES:
DiagnosticRoute[] = [
  {
    path: "/api/debug/overview",
    purpose: "Sistemin tek bakista genel durumu",
    drillDown: [
      "/api/debug/health/deep",
      "/api/debug/invariants",
      "/api/debug/pipeline"
    ]
  },
  {
    path: "/api/debug/routes",
    purpose: "Tum diagnostic endpoint katalogu"
  },
  {
    path: "/api/debug/config",
    purpose: "Secret icermeyen runtime/model config"
  },
  {
    path: "/api/debug/health/deep",
    purpose: "D1 + data integrity + pipeline health"
  },
  {
    path: "/api/debug/db/schema",
    purpose: "Tum D1 table/index/view DDL"
  },
  {
    path: "/api/debug/db/counts",
    purpose: "Tum D1 table row count"
  },
  {
    path: "/api/debug/table?name=TABLE&limit=50",
    purpose: "Herhangi bir D1 table read-only inceleme"
  },
  {
    path: "/api/debug/card",
    purpose: "Bugunku canonical card sehir/yaris/runner ozeti"
  },
  {
    path: "/api/debug/race?city=CITY&race=N",
    purpose: "Tek yarisi en ince seviyede inceleme"
  },
  {
    path: "/api/debug/runner?city=CITY&race=N&horse=N",
    purpose: "Tek atin cross-pipeline trace'i"
  },
  {
    path: "/api/debug/data-quality",
    purpose: "Eksik AGF/form/HP/weight ve source coverage"
  },
  {
    path: "/api/debug/date-contract",
    purpose: "Cross-layer canonical race date diagnostics"
  },
  {
    path: "/api/debug/invariants",
    purpose: "Sistemin bozulmamasi gereken kurallari"
  },
  {
    path: "/api/debug/pipeline",
    purpose: "Refresh/result/learning/coupon pipeline durumu",
    drillDown: [
      "/api/debug/results"
    ]
  },
  {
    path: "/api/debug/results",
    purpose: "Official result run ve stage bazli hata/uyari diagnostigi"
  },
  {
    path: "/api/debug/scoring-config",
    purpose: "Scoring weight ve model policy versiyonlari"
  },
  {
    path: "/api/debug/sixfold",
    purpose: "Altılı windows ve coupon snapshots"
  },
  {
    path: "/api/debug/sources",
    purpose: "Expert source health"
  },
  {
    path: "/api/debug/learning",
    purpose: "Learning gate performansi"
  },
  {
    path: "/api/debug/learning-pipeline",
    purpose: "Candidate/promotion/label zinciri"
  },
  {
    path: "/api/debug/model",
    purpose: "Advanced model diagnostics"
  },
  {
    path: "/api/debug/coverage",
    purpose: "AGF/form/expert/market/field coverage"
  },
  {
    path: "/api/debug/refresh-state",
    purpose: "Pipeline freshness state"
  }
];
