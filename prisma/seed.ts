import { PrismaClient } from "@prisma/client";
import { ADD_ON_SLUGS } from "../lib/addOns";

const prisma = new PrismaClient();

const packages = [
  { name: "Studio/1BR", binCount: 20, dollyCount: 2, basePrice: 14900 },
  { name: "2BR", binCount: 40, dollyCount: 2, basePrice: 19900 },
  { name: "3BR", binCount: 60, dollyCount: 3, basePrice: 27900 },
];

const addOns = [
  {
    slug: ADD_ON_SLUGS.extraBins,
    name: "Extra bin pack",
    unitPrice: 2900,
    binsPerUnit: 10,
    dolliesPerUnit: 0,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    slug: ADD_ON_SLUGS.extraDolly,
    name: "Extra dolly",
    unitPrice: 1900,
    binsPerUnit: 0,
    dolliesPerUnit: 1,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    slug: ADD_ON_SLUGS.blankets,
    name: "Blanket pack",
    unitPrice: 2500,
    binsPerUnit: 0,
    dolliesPerUnit: 0,
    blanketsPerUnit: 6,
    // We don't own any blankets yet — inactive add-ons don't render on the
    // booking form. Flip to true once inventory exists.
    active: false,
  },
];

async function main() {
  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: { ...pkg, active: true },
    });
  }

  for (const addOn of addOns) {
    await prisma.addOn.upsert({
      where: { slug: addOn.slug },
      update: addOn,
      create: addOn,
    });
  }

  await prisma.inventoryConfig.upsert({
    where: { id: 1 },
    update: { totalBins: 100, totalDollies: 5, totalBlankets: 0 },
    create: { id: 1, totalBins: 100, totalDollies: 5, totalBlankets: 0 },
  });

  console.log(
    "Seed complete: 3 packages, 3 add-ons (blankets inactive), inventory config (100 bins, 5 dollies, 0 blankets)."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
