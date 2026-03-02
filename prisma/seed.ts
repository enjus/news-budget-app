import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { addHours, startOfDay } from "date-fns";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.visual.deleteMany();
  await prisma.storyAssignment.deleteMany();
  await prisma.story.deleteMany();
  await prisma.person.deleteMany();

  // People
  const alice = await prisma.person.create({
    data: { name: "Alice Chen", email: "alice@newsroom.com", defaultRole: "REPORTER" },
  });
  const bob = await prisma.person.create({
    data: { name: "Bob Martinez", email: "bob@newsroom.com", defaultRole: "EDITOR" },
  });
  const carol = await prisma.person.create({
    data: { name: "Carol Williams", email: "carol@newsroom.com", defaultRole: "REPORTER" },
  });
  const david = await prisma.person.create({
    data: { name: "David Kim", email: "david@newsroom.com", defaultRole: "PHOTOGRAPHER" },
  });
  const elena = await prisma.person.create({
    data: { name: "Elena Patel", email: "elena@newsroom.com", defaultRole: "GRAPHIC_DESIGNER" },
  });
  const frank = await prisma.person.create({
    data: { name: "Frank Johnson", email: "frank@newsroom.com", defaultRole: "EDITOR" },
  });

  const today = startOfDay(new Date());

  // Stories
  const s1 = await prisma.story.create({
    data: {
      slug: "city-budget-vote",
      budgetLine: "City council expected to pass $2.3B budget with cuts to parks and transit",
      isEnterprise: false,
      status: "DRAFT",
      onlinePubDate: addHours(today, 9), // 9 AM today
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 1,
    },
  });

  const s2 = await prisma.story.create({
    data: {
      slug: "tech-layoffs-local",
      budgetLine: "Regional tech firms announce 400 layoffs ahead of Q2",
      isEnterprise: false,
      status: "DRAFT",
      onlinePubDate: addHours(today, 11), // 11 AM today
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 2,
    },
  });

  const s3 = await prisma.story.create({
    data: {
      slug: "school-merger-probe",
      budgetLine: "State investigates whether school merger violated equity rules",
      isEnterprise: true,
      status: "DRAFT",
      onlinePubDateTBD: true,
      printPubDateTBD: true,
      notes: "Awaiting FOIA documents. Follow up with district spokesperson.",
      sortOrder: 1,
    },
  });

  const s4 = await prisma.story.create({
    data: {
      slug: "harbor-cleanup",
      budgetLine: "EPA orders emergency harbor cleanup after chemical spill",
      isEnterprise: false,
      status: "PUBLISHED_ITERATING",
      onlinePubDate: addHours(today, 8),
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 3,
    },
  });

  const s5 = await prisma.story.create({
    data: {
      slug: "transit-strike-deal",
      budgetLine: "Transit union and city reach tentative 3-year contract deal",
      isEnterprise: false,
      status: "PUBLISHED_FINAL",
      onlinePubDate: addHours(today, -24), // yesterday
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 4,
    },
  });

  const s6 = await prisma.story.create({
    data: {
      slug: "arts-funding-cut",
      budgetLine: "Mayor proposes 30% cut to arts council grants",
      isEnterprise: true,
      status: "DRAFT",
      onlinePubDate: addHours(today, 14), // 2 PM today
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 2,
    },
  });

  const s7 = await prisma.story.create({
    data: {
      slug: "water-main-break",
      budgetLine: "Downtown water main break disrupts morning commute",
      isEnterprise: false,
      status: "SHELVED",
      onlinePubDateTBD: true,
      printPubDateTBD: true,
      notes: "Story overtaken by events. Shelved pending further developments.",
      sortOrder: 5,
    },
  });

  const s8 = await prisma.story.create({
    data: {
      slug: "election-preview",
      budgetLine: "November primary: five key races to watch across the county",
      isEnterprise: true,
      status: "DRAFT",
      onlinePubDateTBD: true,
      printPubDateTBD: true,
      sortOrder: 3,
    },
  });

  const s9 = await prisma.story.create({
    data: {
      slug: "housing-data-2026",
      budgetLine: "New data: home prices up 12% year-over-year in metro area",
      isEnterprise: false,
      status: "DRAFT",
      onlinePubDate: addHours(today, 16), // 4 PM today
      onlinePubDateTBD: false,
      printPubDateTBD: true,
      sortOrder: 6,
    },
  });

  const s10 = await prisma.story.create({
    data: {
      slug: "fire-station-closure",
      budgetLine: "Two fire stations to close under proposed budget, union warns of safety risks",
      isEnterprise: true,
      status: "DRAFT",
      onlinePubDateTBD: true,
      printPubDateTBD: true,
      notes: "Confirm closure dates with fire chief office.",
      sortOrder: 4,
    },
  });

  // Assignments
  const assignments = [
    { storyId: s1.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: s1.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: s2.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: s2.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: s3.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: s3.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: s4.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: s5.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: s6.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: s6.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: s8.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: s9.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: s9.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: s10.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: s10.id, personId: frank.id, role: "EDITOR" as const },
  ];

  for (const a of assignments) {
    await prisma.storyAssignment.create({ data: a });
  }

  // Visuals
  await prisma.visual.createMany({
    data: [
      { storyId: s1.id, type: "PHOTO", description: "Council chamber vote", personId: david.id },
      { storyId: s2.id, type: "GRAPHIC", description: "Layoff timeline chart", personId: elena.id },
      { storyId: s3.id, type: "GRAPHIC", description: "District map overlay", personId: elena.id },
      { storyId: s4.id, type: "PHOTO", description: "Harbor aerial shot", personId: david.id },
      { storyId: s6.id, type: "PHOTO", description: "Arts center exterior", personId: david.id },
      { storyId: s9.id, type: "GRAPHIC", description: "Price trend chart", personId: elena.id },
    ],
  });

  console.log("Seed complete: 6 people, 10 stories, 15 assignments, 6 visuals");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
