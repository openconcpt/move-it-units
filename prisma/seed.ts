import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const packages = [
  { name: "Studio/1BR", binCount: 20, dollyCount: 1, basePrice: 14900 },
  { name: "2BR", binCount: 40, dollyCount: 2, basePrice: 19900 },
  { name: "3BR", binCount: 60, dollyCount: 3, basePrice: 27900 },
];

async function main() {
  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: { ...pkg, active: true },
    });
  }

  await prisma.inventoryConfig.upsert({
    where: { id: 1 },
    update: { totalBins: 100, totalDollies: 5 },
    create: { id: 1, totalBins: 100, totalDollies: 5 },
  });

  console.log("Seed complete: 3 packages + inventory config (100 bins, 5 dollies).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
