/**
 * Seeds the database with clearly-fake sample data so the dashboard is
 * viewable before any real brokerage/market-data integration is connected.
 * Nothing here should ever be mistaken for real account data — symbols and
 * numbers are illustrative only.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { externalId: 'MOCK-ACCOUNT-1' },
    update: {},
    create: {
      provider: 'mock',
      externalId: 'MOCK-ACCOUNT-1',
      cashBalance: 4200.5,
      buyingPower: 4200.5,
      lastSyncedAt: new Date(),
    },
  });

  const holdingsData = [
    { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'Semiconductors', quantity: 25, avgCostBasis: 118.4 },
    { symbol: 'MSFT', name: 'Microsoft Corp', sector: 'Software', quantity: 15, avgCostBasis: 402.1 },
    { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Defense', quantity: 8, avgCostBasis: 452.75 },
  ];

  const holdings = [];
  for (const h of holdingsData) {
    holdings.push(
      await prisma.holding.upsert({
        where: { accountId_symbol: { accountId: account.id, symbol: h.symbol } },
        update: {},
        create: { ...h, accountId: account.id },
      })
    );
  }

  const nvda = holdings.find((h) => h.symbol === 'NVDA')!;
  await prisma.recommendation.upsert({
    where: { id: 'seed-rec-nvda-1' },
    update: {},
    create: {
      id: 'seed-rec-nvda-1',
      holdingId: nvda.id,
      symbol: 'NVDA',
      thesis: 'Sample thesis: durable AI-accelerator demand and data-center capex cycle. (Mock data — replace once market-data/news integrations are connected.)',
      thesisChanged: false,
      bullCase: 'Sample: sustained hyperscaler capex, expanding software/inference revenue mix.',
      bearCase: 'Sample: customer concentration, custom-silicon competition, export restrictions.',
      catalysts: 'Sample: next earnings print, major hyperscaler capex guidance.',
      risks: 'Sample: valuation multiple compression risk, geopolitical/export risk.',
      confidenceScore: 6,
      action: 'HOLD',
    },
  });

  await prisma.opportunity.upsert({
    where: { id: 'seed-opp-1' },
    update: {},
    create: {
      id: 'seed-opp-1',
      symbol: 'TSM',
      name: 'Taiwan Semiconductor',
      category: 'HIGH_CONVICTION',
      thesis: 'Sample placeholder opportunity — not a real recommendation until connected to live fundamentals/valuation data.',
      confidenceScore: 5,
    },
  });

  await prisma.riskAssessment.upsert({
    where: { id: 'seed-risk-1' },
    update: {},
    create: {
      id: 'seed-risk-1',
      concentrationRisk: 55,
      sectorRisk: 60,
      valuationRisk: 50,
      earningsRisk: 40,
      regulatoryRisk: 35,
      liquidityRisk: 10,
      macroRisk: 45,
      overallScore: 45,
      notes: 'Sample risk snapshot from seed data — recompute once real holdings/prices are synced.',
    },
  });

  console.log('Seed complete:', { account: account.externalId, holdings: holdings.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
