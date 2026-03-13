"use client";

import { useState } from "react";
import type { Nation, GameState, ResourceType } from "@historia/shared";
import { useTranslation } from "@/i18n";

type Tab = "economy" | "military" | "diplomacy" | "trade";

interface NationDashboardProps {
  nation: Nation;
  game: GameState;
}

export function NationDashboard({ nation, game }: NationDashboardProps) {
  const [tab, setTab] = useState<Tab>("economy");
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #222",
          backgroundColor: "#111",
        }}
      >
        {(["economy", "military", "diplomacy", "trade"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            style={{
              flex: 1,
              padding: "0.5rem 0",
              background: tab === tabKey ? "#1a1a2e" : "transparent",
              border: "none",
              borderBottom: tab === tabKey ? "2px solid #60a5fa" : "2px solid transparent",
              color: tab === tabKey ? "#60a5fa" : "#666",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {t(`nation_dashboard.${tabKey}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "0.75rem 1rem", overflowY: "auto", fontSize: "0.82rem" }}>
        {tab === "economy" && <EconomyPanel nation={nation} game={game} />}
        {tab === "military" && <MilitaryPanel nation={nation} game={game} />}
        {tab === "diplomacy" && <DiplomacyPanel nation={nation} game={game} />}
        {tab === "trade" && <TradePanel nation={nation} game={game} />}
      </div>
    </div>
  );
}

function EconomyPanel({ nation, game }: { nation: Nation; game: GameState }) {
  const { t } = useTranslation();
  const eco = nation.economy;
  const netIncome = eco.monthlyIncome - eco.monthlyExpenses;
  const provinceCount = nation.provinces.length;
  const totalTax = nation.provinces.reduce(
    (sum, pid) => sum + (game.provinces[pid]?.baseTax ?? 0),
    0
  );
  const totalProd = nation.provinces.reduce(
    (sum, pid) => sum + (game.provinces[pid]?.baseProduction ?? 0),
    0
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Treasury */}
      <Section title={t("nation_dashboard.treasury")}>
        <BigStat value={eco.treasury.toFixed(0)} label={t("nation_dashboard.gold")} color="#fbbf24" />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem" }}>
          <MiniStat label={t("nation_dashboard.income")} value={`+${eco.monthlyIncome.toFixed(1)}`} color="#4ade80" />
          <MiniStat label={t("nation_dashboard.expenses")} value={`-${eco.monthlyExpenses.toFixed(1)}`} color="#f87171" />
          <MiniStat
            label={t("nation_dashboard.net")}
            value={`${netIncome >= 0 ? "+" : ""}${netIncome.toFixed(1)}`}
            color={netIncome >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
      </Section>

      {/* Indicators */}
      <Section title={t("nation_dashboard.indicators")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <StatRow label={t("nation_dashboard.tax_rate")} value={`${(eco.taxRate * 100).toFixed(0)}%`} />
          <StatRow label={t("nation_dashboard.inflation")} value={`${(eco.inflation * 100).toFixed(1)}%`} />
          <StatRow label={t("nation_dashboard.trade_power")} value={String(eco.tradePower)} />
          <StatRow label={t("nation_dashboard.provinces")} value={String(provinceCount)} />
        </div>
      </Section>

      {/* Province Breakdown */}
      <Section title={t("nation_dashboard.province_values")}>
        <BarRow label={t("nation_dashboard.total_tax")} value={totalTax} max={80} color="#fbbf24" />
        <BarRow label={t("nation_dashboard.total_production")} value={totalProd} max={80} color="#60a5fa" />
      </Section>
    </div>
  );
}

function MilitaryPanel({ nation, game }: { nation: Nation; game: GameState }) {
  const { t } = useTranslation();
  const mil = nation.military;
  const totalTroops = mil.armies.reduce(
    (sum, a) => sum + a.units.infantry + a.units.cavalry + a.units.artillery,
    0
  );

  const activeWars = game.activeWars.filter(
    (w) => w.attackers.includes(nation.id) || w.defenders.includes(nation.id)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Overview */}
      <Section title={t("nation_dashboard.forces")}>
        <BigStat value={formatNumber(totalTroops)} label={t("nation_dashboard.total_troops")} color="#60a5fa" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem" }}>
          <StatRow label={t("nation_dashboard.manpower")} value={formatNumber(mil.manpower)} />
          <StatRow label={t("nation_dashboard.max_manpower")} value={formatNumber(mil.maxManpower)} />
          <StatRow label={t("nation_dashboard.force_limit")} value={formatNumber(mil.forceLimit)} />
          <StatRow label={t("nation_dashboard.mil_tech")} value={String(mil.militaryTechnology)} />
        </div>
      </Section>

      {/* Armies */}
      <Section title={t("nation_dashboard.armies", { count: mil.armies.length })}>
        {mil.armies.map((army) => {
          const total = army.units.infantry + army.units.cavalry + army.units.artillery;
          const provName = game.provinces[army.location]?.displayName ?? army.location;
          return (
            <div
              key={army.id}
              style={{
                padding: "0.4rem 0.5rem",
                marginBottom: "0.3rem",
                backgroundColor: "#1a1a2e",
                borderRadius: "4px",
                border: "1px solid #222",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                <span style={{ fontWeight: 600 }}>{army.name}</span>
                <span style={{ color: "#888" }}>{formatNumber(total)}</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#888" }}>
                <span>{provName}</span>
                <span style={{ margin: "0 0.5rem" }}>|</span>
                <span>{t("nation_dashboard.morale")}: {(army.morale * 100).toFixed(0)}%</span>
                <span style={{ margin: "0 0.5rem" }}>|</span>
                <span>{t("nation_dashboard.supply")}: {(army.supply * 100).toFixed(0)}%</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", fontSize: "0.75rem" }}>
                <UnitBadge label="INF" count={army.units.infantry} color="#4ade80" />
                <UnitBadge label="CAV" count={army.units.cavalry} color="#fbbf24" />
                <UnitBadge label="ART" count={army.units.artillery} color="#f87171" />
              </div>
            </div>
          );
        })}
      </Section>

      {/* Active Wars */}
      {activeWars.length > 0 && (
        <Section title={t("nation_dashboard.active_wars", { count: activeWars.length })}>
          {activeWars.map((war) => {
            const isAttacker = war.attackers.includes(nation.id);
            return (
              <div
                key={war.id}
                style={{
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.3rem",
                  backgroundColor: "#2a1a1a",
                  borderRadius: "4px",
                  border: "1px solid #3a2222",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>
                  {war.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#888" }}>
                  <span style={{ color: isAttacker ? "#f87171" : "#60a5fa" }}>
                    {isAttacker ? t("nation_dashboard.attacker") : t("nation_dashboard.defender")}
                  </span>
                  <span style={{ margin: "0 0.5rem" }}>|</span>
                  <span>{t("nation_dashboard.war_score")}: {war.warScore}</span>
                  <span style={{ margin: "0 0.5rem" }}>|</span>
                  <span>{t("nation_dashboard.battles")}: {war.battles.length}</span>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* War Exhaustion & Stability */}
      <Section title={t("nation_dashboard.morale_status")}>
        <BarRow
          label={t("nation_dashboard.war_exhaustion")}
          value={nation.population.warExhaustion}
          max={100}
          color="#f87171"
        />
        <BarRow
          label={t("nation_dashboard.stability")}
          value={nation.population.stability}
          max={100}
          color="#4ade80"
        />
      </Section>
    </div>
  );
}

function DiplomacyPanel({ nation, game }: { nation: Nation; game: GameState }) {
  const { t } = useTranslation();
  const dip = nation.diplomacy;

  const sortedRelations = Object.entries(dip.relations)
    .filter(([nId]) => game.nations[nId])
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Ruler */}
      <Section title={t("nation_dashboard.ruler")}>
        <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{nation.ruler.name}</div>
        <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.3rem" }}>
          {nation.government.replace(/_/g, " ")} | {t("nation_dashboard.age")}: {nation.ruler.age}
          {nation.ruler.traits.length > 0 && ` | ${nation.ruler.traits.join(", ")}`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.3rem" }}>
          <SkillBadge label="ADM" value={nation.ruler.adminSkill} color="#4ade80" />
          <SkillBadge label="DIP" value={nation.ruler.diplomacySkill} color="#60a5fa" />
          <SkillBadge label="MIL" value={nation.ruler.militarySkill} color="#f87171" />
        </div>
      </Section>

      {/* Alliances & Marriages */}
      <Section title={t("nation_dashboard.alliances_ties")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
          {dip.alliances.map((id) => (
            <Badge key={id} label={game.nations[id]?.name ?? id} color="#4ade80" icon="A" />
          ))}
          {dip.royalMarriages.map((id) => (
            <Badge key={id} label={game.nations[id]?.name ?? id} color="#e879f9" icon="M" />
          ))}
          {dip.rivals.map((id) => (
            <Badge key={id} label={game.nations[id]?.name ?? id} color="#f87171" icon="R" />
          ))}
          {dip.alliances.length === 0 && dip.royalMarriages.length === 0 && dip.rivals.length === 0 && (
            <span style={{ color: "#555" }}>{t("nation_dashboard.no_diplomatic_ties")}</span>
          )}
        </div>
      </Section>

      {/* Relations */}
      {sortedRelations.length > 0 && (
        <Section title={t("nation_dashboard.relations")}>
          {sortedRelations.map(([nId, value]) => (
            <RelationRow
              key={nId}
              name={game.nations[nId]?.name ?? nId}
              value={value}
              color={game.nations[nId]?.color}
            />
          ))}
        </Section>
      )}

      {/* Treaties */}
      {game.activeTreaties.filter(tr => tr.parties.includes(nation.id)).length > 0 && (
        <Section title={t("nation_dashboard.active_treaties")}>
          {game.activeTreaties
            .filter(tr => tr.parties.includes(nation.id))
            .map(tr => (
              <div key={tr.id} style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.2rem" }}>
                {tr.type.replace(/_/g, " ")} with{" "}
                {tr.parties.filter(p => p !== nation.id).map(p => game.nations[p]?.name ?? p).join(", ")}
              </div>
            ))}
        </Section>
      )}

      {/* Population */}
      <Section title={t("nation_dashboard.population")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <StatRow label={t("nation_dashboard.population")} value={formatNumber(nation.population.total)} />
          <StatRow label={t("nation_dashboard.growth")} value={`${(nation.population.growthRate * 100).toFixed(1)}%`} />
          <StatRow label={t("nation_dashboard.culture")} value={nation.population.culture} />
          <StatRow label={t("nation_dashboard.religion")} value={nation.population.religion} />
        </div>
      </Section>
    </div>
  );
}

function TradePanel({ nation, game }: { nation: Nation; game: GameState }) {
  const { t } = useTranslation();

  // Compute resource portfolio
  const resources: Partial<Record<ResourceType, number>> = {};
  for (const provId of nation.provinces) {
    const prov = game.provinces[provId];
    if (!prov) continue;
    for (const res of prov.resources) {
      resources[res] = (resources[res] ?? 0) + 1;
    }
  }
  const resourceEntries = Object.entries(resources).sort(
    (a, b) => b[1] - a[1]
  ) as [ResourceType, number][];

  // Trade agreements
  const tradeAgreements = game.activeTreaties.filter(
    (tr) => tr.type === "trade_agreement" && tr.parties.includes(nation.id)
  );

  // Embargoes (imposed by or on us)
  const embargoes = game.activeTreaties.filter(
    (tr) => tr.terms?.isEmbargo && tr.parties.includes(nation.id)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Trade Power */}
      <Section title={t("nation_dashboard.trade_overview")}>
        <BigStat value={nation.economy.tradePower.toFixed(0)} label={t("nation_dashboard.trade_power")} color="#fbbf24" />
        <BarRow label={t("nation_dashboard.trade_power")} value={nation.economy.tradePower} max={100} color="#fbbf24" />
      </Section>

      {/* Resources */}
      <Section title={t("nation_dashboard.resources", { count: resourceEntries.length })}>
        {resourceEntries.length === 0 ? (
          <span style={{ color: "#555", fontSize: "0.8rem" }}>{t("nation_dashboard.no_resources")}</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
            {resourceEntries.map(([res, count]) => (
              <span
                key={res}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.2rem",
                  padding: "0.15rem 0.4rem",
                  backgroundColor: "#fbbf2415",
                  border: "1px solid #fbbf2433",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  color: "#fbbf24",
                }}
              >
                {res} x{count}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Trade Agreements */}
      <Section title={t("nation_dashboard.trade_agreements", { count: tradeAgreements.length })}>
        {tradeAgreements.length === 0 ? (
          <span style={{ color: "#555", fontSize: "0.8rem" }}>{t("nation_dashboard.no_trade_agreements")}</span>
        ) : (
          tradeAgreements.map((tr) => {
            const partnerId = tr.parties.find((p) => p !== nation.id);
            const partner = partnerId ? game.nations[partnerId] : null;
            return (
              <div
                key={tr.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.3rem 0.5rem",
                  marginBottom: "0.2rem",
                  backgroundColor: "#0a1a0f",
                  borderRadius: 4,
                  border: "1px solid #4ade8033",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {partner?.color && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: partner.color,
                        display: "inline-block",
                      }}
                    />
                  )}
                  <span style={{ fontSize: "0.8rem" }}>{partner?.name ?? partnerId}</span>
                </div>
                <span style={{ color: "#4ade80", fontSize: "0.72rem", fontWeight: 600 }}>
                  {t("nation_dashboard.active")}
                </span>
              </div>
            );
          })
        )}
      </Section>

      {/* Embargoes */}
      {embargoes.length > 0 && (
        <Section title={t("nation_dashboard.embargoes", { count: embargoes.length })}>
          {embargoes.map((tr) => {
            const isImposer = tr.parties[0] === nation.id;
            const otherId = isImposer ? tr.parties[1] : tr.parties[0];
            const other = game.nations[otherId];
            return (
              <div
                key={tr.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.3rem 0.5rem",
                  marginBottom: "0.2rem",
                  backgroundColor: "#2a1a1a",
                  borderRadius: 4,
                  border: "1px solid #f8717133",
                }}
              >
                <span style={{ fontSize: "0.8rem" }}>{other?.name ?? otherId}</span>
                <span
                  style={{
                    color: isImposer ? "#fbbf24" : "#f87171",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                >
                  {isImposer ? t("nation_dashboard.imposed_by_us") : t("nation_dashboard.against_us")}
                </span>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}

// --- Reusable components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function BigStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
      <span style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</span>
      <span style={{ color: "#666", fontSize: "0.8rem" }}>{label}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "0.75rem", color: "#555" }}>{label}</div>
      <div style={{ fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: "0.3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
        <span style={{ color: "#888" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 4, backgroundColor: "#222", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function UnitBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span style={{ color, fontWeight: 600 }}>
      {label}: {formatNumber(count)}
    </span>
  );
}

function SkillBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0.25rem", backgroundColor: "#1a1a2e", borderRadius: 4 }}>
      <div style={{ fontSize: "0.7rem", color: "#666" }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Badge({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.15rem 0.4rem",
        backgroundColor: `${color}22`,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        fontSize: "0.75rem",
        color,
      }}
    >
      <span style={{ fontWeight: 700 }}>{icon}</span>
      {label}
    </span>
  );
}

function RelationRow({ name, value, color }: { name: string; value: number; color?: string }) {
  const relColor = value > 50 ? "#4ade80" : value > 0 ? "#a3e635" : value > -50 ? "#fbbf24" : "#f87171";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.2rem 0",
        borderBottom: "1px solid #1a1a1a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {color && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, display: "inline-block" }} />
        )}
        <span>{name}</span>
      </div>
      <span style={{ fontWeight: 600, color: relColor }}>{value > 0 ? `+${value}` : value}</span>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
