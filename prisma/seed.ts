import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { addDays, addHours, startOfDay } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.videoAssignment.deleteMany();
  await prisma.video.deleteMany();
  await prisma.visual.deleteMany();
  await prisma.storyAssignment.deleteMany();
  await prisma.story.deleteMany();
  await prisma.person.deleteMany();

  // ─── People ───────────────────────────────────────────────────────────────

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
  const maya = await prisma.person.create({
    data: { name: "Maya Singh", email: "maya@newsroom.com", defaultRole: "VIDEOGRAPHER" },
  });

  const today = startOfDay(new Date());
  const d = (offset: number, hour: number) => addHours(addDays(today, offset), hour);

  // ─── Stories ──────────────────────────────────────────────────────────────
  // 15 days: -7 to +7. ~2-3 stories per day, mix of statuses.
  // Past = mostly PUBLISHED_FINAL/ITERATING; today = DRAFT/ITERATING; future = DRAFT

  const stories = await Promise.all([

    // ── Day -7 ──
    prisma.story.create({ data: {
      slug: "TRANSIT STRIKE DEAL",
      budgetLine: "Transit union and city reach tentative 3-year contract deal",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-7, 8), onlinePubDateTBD: false,
      printPubDate: d(-7, 0), printPubDateTBD: false, wordCount: 820, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "HARBOR CLEANUP",
      budgetLine: "EPA orders emergency harbor cleanup after chemical spill near port",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-7, 14), onlinePubDateTBD: false,
      printPubDate: d(-7, 0), printPubDateTBD: false, wordCount: 610, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "SCHOOL BOARD VOTE",
      budgetLine: "School board approves controversial new curriculum standards 5-2",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-7, 17), onlinePubDateTBD: false,
      printPubDateTBD: true, wordCount: 740, sortOrder: 3,
    }}),

    // ── Day -6 ──
    prisma.story.create({ data: {
      slug: "WATER RATE HIKE",
      budgetLine: "City proposes 18% water rate increase over three years",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-6, 9), onlinePubDateTBD: false,
      printPubDate: d(-6, 0), printPubDateTBD: false, wordCount: 550, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "PARK RENOVATION DELAY",
      budgetLine: "Riverside Park renovation pushed to 2027 after contractor dispute",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-6, 13), onlinePubDateTBD: false,
      printPubDateTBD: true, wordCount: 430, sortOrder: 2,
    }}),

    // ── Day -5 ──
    prisma.story.create({ data: {
      slug: "POLICE CONTRACT",
      budgetLine: "City and police union resume contract talks after three-month standoff",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-5, 10), onlinePubDateTBD: false,
      printPubDate: d(-5, 0), printPubDateTBD: false, wordCount: 680, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "LIBRARY HOURS CUT",
      budgetLine: "Budget squeeze forces three branches to cut weekend hours",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-5, 15), onlinePubDateTBD: false,
      printPubDateTBD: true, wordCount: 390, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "STADIUM NAMING DEAL",
      budgetLine: "County sells stadium naming rights in $40M, 10-year deal",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-5, 11), onlinePubDateTBD: false,
      printPubDate: d(-5, 0), printPubDateTBD: false, wordCount: 510, sortOrder: 3,
    }}),

    // ── Day -4 ──
    prisma.story.create({ data: {
      slug: "HOSPITAL MERGER",
      budgetLine: "Two regional hospitals announce merger, raising antitrust questions",
      isEnterprise: true,
      status: "PUBLISHED_ITERATING", onlinePubDate: d(-4, 8), onlinePubDateTBD: false,
      printPubDate: d(-4, 0), printPubDateTBD: false, wordCount: 1100, sortOrder: 1,
      notes: "Follow-up with state AG office pending.",
    }}),
    prisma.story.create({ data: {
      slug: "FLOOD DAMAGE REPORT",
      budgetLine: "County releases damage assessment from February flooding: $12M",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-4, 11), onlinePubDateTBD: false,
      printPubDateTBD: true, wordCount: 490, sortOrder: 2,
    }}),

    // ── Day -3 ──
    prisma.story.create({ data: {
      slug: "TECH LAYOFFS LOCAL",
      budgetLine: "Regional tech firms announce 400 layoffs ahead of Q2",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-3, 9), onlinePubDateTBD: false,
      printPubDate: d(-3, 0), printPubDateTBD: false, wordCount: 720, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "FIRE CHIEF RESIGN",
      budgetLine: "Fire chief resigns amid investigation into department overtime abuse",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-3, 12), onlinePubDateTBD: false,
      printPubDate: d(-3, 0), printPubDateTBD: false, wordCount: 640, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "SCHOOL MERGER PROBE",
      budgetLine: "State investigates whether school merger violated equity rules",
      isEnterprise: true,
      status: "PUBLISHED_ITERATING", onlinePubDate: d(-3, 15), onlinePubDateTBD: false,
      printPubDate: d(-3, 0), printPubDateTBD: false, wordCount: 960,
      notes: "FOIA docs received. Second story in series.", sortOrder: 3,
    }}),

    // ── Day -2 ──
    prisma.story.create({ data: {
      slug: "HOUSING DATA 2026",
      budgetLine: "New data: home prices up 12% year-over-year in metro area",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-2, 8), onlinePubDateTBD: false,
      printPubDate: d(-2, 0), printPubDateTBD: false, wordCount: 580, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "ARTS FUNDING CUT",
      budgetLine: "Mayor proposes 30% cut to arts council grants",
      isEnterprise: true,
      status: "PUBLISHED_ITERATING", onlinePubDate: d(-2, 11), onlinePubDateTBD: false,
      printPubDate: d(-2, 0), printPubDateTBD: false, wordCount: 810, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "PEDESTRIAN SAFETY PLAN",
      budgetLine: "City unveils $8M plan to add crosswalks and speed cameras downtown",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-2, 16), onlinePubDateTBD: false,
      printPubDateTBD: true, wordCount: 470, sortOrder: 3,
    }}),

    // ── Day -1 ──
    prisma.story.create({ data: {
      slug: "ELECTION FILING DEADLINE",
      budgetLine: "Fifteen candidates file for November city council races",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-1, 9), onlinePubDateTBD: false,
      printPubDate: d(-1, 0), printPubDateTBD: false, wordCount: 530, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "JAIL OVERCROWDING",
      budgetLine: "County jail at 140% capacity; officials weigh early release program",
      isEnterprise: true,
      status: "PUBLISHED_ITERATING", onlinePubDate: d(-1, 13), onlinePubDateTBD: false,
      printPubDate: d(-1, 0), printPubDateTBD: false, wordCount: 1020, sortOrder: 2,
      notes: "Sheriff interview scheduled for tomorrow.",
    }}),

    // ── Day 0 (today) ──
    prisma.story.create({ data: {
      slug: "CITY BUDGET VOTE",
      budgetLine: "City council expected to pass $2.3B budget with cuts to parks and transit",
      status: "DRAFT", onlinePubDate: d(0, 9), onlinePubDateTBD: false,
      printPubDate: d(0, 0), printPubDateTBD: false, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "HOSPITAL MERGER RULING",
      budgetLine: "State AG clears hospital merger with conditions on pricing caps",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(0, 11), onlinePubDateTBD: false,
      printPubDate: d(0, 0), printPubDateTBD: false, sortOrder: 2,
      notes: "Confirm ruling details with AG press office by 10am.",
    }}),
    prisma.story.create({ data: {
      slug: "TEACHER SHORTAGE",
      budgetLine: "District reports 80 unfilled teaching positions heading into spring",
      status: "DRAFT", onlinePubDate: d(0, 15), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 3,
    }}),

    // ── Day +1 ──
    prisma.story.create({ data: {
      slug: "FIRE STATION CLOSURE",
      budgetLine: "Two fire stations to close under proposed budget, union warns of safety risks",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(1, 10), onlinePubDateTBD: false,
      printPubDate: d(1, 0), printPubDateTBD: false, sortOrder: 1,
      notes: "Confirm closure dates with fire chief office.",
    }}),
    prisma.story.create({ data: {
      slug: "AIRPORT EXPANSION",
      budgetLine: "County board votes on $220M terminal expansion proposal",
      status: "DRAFT", onlinePubDate: d(1, 14), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 2,
    }}),

    // ── Day +2 ──
    prisma.story.create({ data: {
      slug: "RENT CONTROL VOTE",
      budgetLine: "Council to vote on rent stabilization ordinance covering 40,000 units",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(2, 9), onlinePubDateTBD: false,
      printPubDate: d(2, 0), printPubDateTBD: false, sortOrder: 1,
      notes: "Need landlord and tenant advocate quotes.",
    }}),
    prisma.story.create({ data: {
      slug: "SPORTS COMPLEX BID",
      budgetLine: "City submits bid to host regional youth sports complex",
      status: "DRAFT", onlinePubDate: d(2, 13), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "BRIDGE INSPECTION FAIL",
      budgetLine: "Main Street bridge fails state inspection; partial closure expected",
      status: "DRAFT", onlinePubDate: d(2, 16), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 3,
    }}),

    // ── Day +3 ──
    prisma.story.create({ data: {
      slug: "ELECTION PREVIEW",
      budgetLine: "November primary: five key races to watch across the county",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(3, 10), onlinePubDateTBD: false,
      printPubDate: d(3, 0), printPubDateTBD: false, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "FOOD BANK DEMAND",
      budgetLine: "Regional food banks report 35% surge in demand, blame housing costs",
      status: "DRAFT", onlinePubDate: d(3, 14), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 2,
    }}),

    // ── Day +4 ──
    prisma.story.create({ data: {
      slug: "POLICE BODY CAM AUDIT",
      budgetLine: "Audit finds gaps in body camera footage retention policy",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(4, 9), onlinePubDateTBD: false,
      printPubDate: d(4, 0), printPubDateTBD: false, sortOrder: 1,
      notes: "Awaiting audit PDF from city clerk.",
    }}),
    prisma.story.create({ data: {
      slug: "DOWNTOWN REVIVAL PLAN",
      budgetLine: "New task force pitches incentives to fill vacant storefronts",
      status: "DRAFT", onlinePubDate: d(4, 13), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 2,
    }}),
    prisma.story.create({ data: {
      slug: "CLIMATE REPORT LOCAL",
      budgetLine: "New county climate report: average temps up 2.4°F since 1990",
      status: "DRAFT", onlinePubDateTBD: true, printPubDateTBD: true, sortOrder: 3,
      notes: "Targeting next week pending final data from county.",
    }}),

    // ── Day +5 ──
    prisma.story.create({ data: {
      slug: "BUDGET TOWN HALL",
      budgetLine: "Public weighs in on proposed cuts at packed town hall meeting",
      status: "DRAFT", onlinePubDate: d(5, 10), onlinePubDateTBD: false,
      printPubDate: d(5, 0), printPubDateTBD: false, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "TRANSIT EXPANSION",
      budgetLine: "Federal grant would fund two new bus rapid transit lines",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(5, 14), onlinePubDateTBD: false,
      printPubDate: d(5, 0), printPubDateTBD: false, sortOrder: 2,
    }}),

    // ── Day +6 ──
    prisma.story.create({ data: {
      slug: "SCHOOL LUNCH DEBT",
      budgetLine: "District cancels $180K in school lunch debt for low-income students",
      status: "DRAFT", onlinePubDate: d(6, 9), onlinePubDateTBD: false,
      printPubDateTBD: true, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "WATER MAIN BREAK",
      budgetLine: "Downtown water main break disrupts morning commute",
      status: "SHELVED", shelvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      onlinePubDateTBD: true, printPubDateTBD: true, sortOrder: 99,
      notes: "Story overtaken by events. Shelved pending further developments.",
    }}),

    // ── Day +7 ──
    prisma.story.create({ data: {
      slug: "COUNTY FAIR RETURN",
      budgetLine: "County fair returns after two-year hiatus with record vendor applications",
      status: "DRAFT", onlinePubDate: d(7, 11), onlinePubDateTBD: false,
      printPubDate: d(7, 0), printPubDateTBD: false, sortOrder: 1,
    }}),
    prisma.story.create({ data: {
      slug: "PENSION SHORTFALL",
      budgetLine: "City pension fund faces $340M shortfall, audit warns of insolvency risk",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(7, 13), onlinePubDateTBD: false,
      printPubDate: d(7, 0), printPubDateTBD: false, sortOrder: 2,
      notes: "Get comment from finance director and pension board chair.",
    }}),
  ]);

  // ─── Videos ───────────────────────────────────────────────────────────────

  const videos = await Promise.all([
    // Past
    prisma.video.create({ data: {
      slug: "TRANSIT STRIKE REACTION",
      budgetLine: "Commuters react to end of transit strike",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-7, 10), onlinePubDateTBD: false,
      sortOrder: 1, youtubeUrl: "https://youtube.com/watch?v=example1",
    }}),
    prisma.video.create({ data: {
      slug: "HARBOR CLEANUP AERIAL",
      budgetLine: "Drone footage of harbor cleanup operation",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-5, 12), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "HOSPITAL MERGER EXPLAINER",
      budgetLine: "What the hospital merger means for patients",
      isEnterprise: true,
      status: "PUBLISHED_FINAL", onlinePubDate: d(-4, 9), onlinePubDateTBD: false,
      sortOrder: 1, youtubeUrl: "https://youtube.com/watch?v=example2",
    }}),
    prisma.video.create({ data: {
      slug: "FIRE CHIEF INTERVIEW",
      budgetLine: "Outgoing fire chief speaks out on department issues",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-3, 14), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "HOUSING MARKET EXPLAINER",
      budgetLine: "Breaking down the metro housing market in 90 seconds",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-2, 10), onlinePubDateTBD: false,
      sortOrder: 1, reelsUrl: "https://instagram.com/reel/example1",
    }}),
    prisma.video.create({ data: {
      slug: "ARTS FUNDING REACTION",
      budgetLine: "Artists respond to proposed arts funding cuts",
      status: "PUBLISHED_FINAL", onlinePubDate: d(-1, 11), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),

    // Today
    prisma.video.create({ data: {
      slug: "BUDGET VOTE PREVIEW",
      budgetLine: "What's in the city's $2.3B budget proposal",
      status: "DRAFT", onlinePubDate: d(0, 8), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),

    // Future
    prisma.video.create({ data: {
      slug: "FIRE STATION TOUR",
      budgetLine: "Inside one of the fire stations slated for closure",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(1, 12), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "RENT CONTROL EXPLAINER",
      budgetLine: "Rent stabilization: what it would mean for renters and landlords",
      status: "DRAFT", onlinePubDate: d(2, 10), onlinePubDateTBD: false,
      sortOrder: 1, youtubeUrl: "https://youtube.com/watch?v=example3",
    }}),
    prisma.video.create({ data: {
      slug: "BRIDGE CLOSURE IMPACT",
      budgetLine: "Commuters react to Main Street bridge closure",
      status: "DRAFT", onlinePubDate: d(2, 15), onlinePubDateTBD: false,
      sortOrder: 2,
    }}),
    prisma.video.create({ data: {
      slug: "FOOD BANK VISIT",
      budgetLine: "A day at the region's busiest food bank",
      status: "DRAFT", onlinePubDate: d(3, 13), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "TRANSIT EXPANSION TOUR",
      budgetLine: "Riding the proposed BRT route with city planners",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(5, 11), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "PENSION CRISIS EXPLAINER",
      budgetLine: "The city's pension shortfall explained in two minutes",
      isEnterprise: true,
      status: "DRAFT", onlinePubDate: d(7, 10), onlinePubDateTBD: false,
      sortOrder: 1,
    }}),
    prisma.video.create({ data: {
      slug: "COUNTY FAIR PREVIEW",
      budgetLine: "Behind the scenes at the returning county fair",
      status: "DRAFT", onlinePubDate: d(7, 14), onlinePubDateTBD: false,
      sortOrder: 2,
    }}),
    prisma.video.create({ data: {
      slug: "CLIMATE DATA VIZ",
      budgetLine: "Visualizing 35 years of local temperature data",
      status: "DRAFT", onlinePubDateTBD: true, sortOrder: 3,
      notes: "Waiting on final climate report data.",
    }}),
  ]);

  // ─── Story Assignments ─────────────────────────────────────────────────────

  const [
    sTransitDeal, sHarbor, sSchoolBoard, sWaterRate, sParkDelay,
    sPoliceContract, sLibrary, sStadium, sHospitalMerger, sFlood,
    sTechLayoffs, sFireChief, sSchoolMerger, sHousingData, sArtsFunding,
    sPedestrian, sElectionFiling, sJailOvercrowding, sCityBudget,
    sHospitalRuling, sTeacher, sFireStation, sAirport, sRentControl,
    sSports, sBridge, sElectionPreview, sFoodBank, sPoliceAudit,
    sDowntown, sClimate, sBudgetTownHall, sTransitExpansion,
    sSchoolLunch, sWaterMainBreak, sCountyFair, sPension,
  ] = stories;

  const storyAssignments = [
    // Day -7
    { storyId: sTransitDeal.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sTransitDeal.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sHarbor.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sHarbor.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sSchoolBoard.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sSchoolBoard.id, personId: bob.id, role: "EDITOR" as const },
    // Day -6
    { storyId: sWaterRate.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sWaterRate.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sParkDelay.id, personId: carol.id, role: "REPORTER" as const },
    // Day -5
    { storyId: sPoliceContract.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sPoliceContract.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sLibrary.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sStadium.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sStadium.id, personId: frank.id, role: "EDITOR" as const },
    // Day -4
    { storyId: sHospitalMerger.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sHospitalMerger.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sFlood.id, personId: alice.id, role: "REPORTER" as const },
    // Day -3
    { storyId: sTechLayoffs.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sTechLayoffs.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sFireChief.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sFireChief.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sSchoolMerger.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sSchoolMerger.id, personId: frank.id, role: "EDITOR" as const },
    // Day -2
    { storyId: sHousingData.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sHousingData.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sArtsFunding.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sArtsFunding.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sPedestrian.id, personId: alice.id, role: "REPORTER" as const },
    // Day -1
    { storyId: sElectionFiling.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sElectionFiling.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sJailOvercrowding.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sJailOvercrowding.id, personId: frank.id, role: "EDITOR" as const },
    // Today
    { storyId: sCityBudget.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sCityBudget.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sHospitalRuling.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sHospitalRuling.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sTeacher.id, personId: carol.id, role: "REPORTER" as const },
    // Future
    { storyId: sFireStation.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sFireStation.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sAirport.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sRentControl.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sRentControl.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sBridge.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sElectionPreview.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sElectionPreview.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sFoodBank.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sPoliceAudit.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sPoliceAudit.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sBudgetTownHall.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sBudgetTownHall.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sTransitExpansion.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sTransitExpansion.id, personId: frank.id, role: "EDITOR" as const },
    { storyId: sSchoolLunch.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sPension.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sPension.id, personId: bob.id, role: "EDITOR" as const },
    { storyId: sCountyFair.id, personId: carol.id, role: "REPORTER" as const },
    { storyId: sClimate.id, personId: alice.id, role: "REPORTER" as const },
    { storyId: sClimate.id, personId: frank.id, role: "EDITOR" as const },
  ];

  for (const a of storyAssignments) {
    await prisma.storyAssignment.create({ data: a });
  }

  // ─── Visuals ──────────────────────────────────────────────────────────────

  await prisma.visual.createMany({
    data: [
      { storyId: sTransitDeal.id, type: "PHOTO", description: "Commuters at main station", personId: david.id },
      { storyId: sHarbor.id, type: "PHOTO", description: "Harbor aerial shot", personId: david.id },
      { storyId: sTechLayoffs.id, type: "GRAPHIC", description: "Layoff timeline chart", personId: elena.id },
      { storyId: sHospitalMerger.id, type: "GRAPHIC", description: "Hospital network map", personId: elena.id },
      { storyId: sHospitalMerger.id, type: "PHOTO", description: "Hospital entrance", personId: david.id },
      { storyId: sSchoolMerger.id, type: "GRAPHIC", description: "District map overlay", personId: elena.id },
      { storyId: sArtsFunding.id, type: "PHOTO", description: "Arts center exterior", personId: david.id },
      { storyId: sHousingData.id, type: "GRAPHIC", description: "Price trend chart", personId: elena.id },
      { storyId: sJailOvercrowding.id, type: "GRAPHIC", description: "Capacity over time chart", personId: elena.id },
      { storyId: sCityBudget.id, type: "PHOTO", description: "Council chamber", personId: david.id },
      { storyId: sCityBudget.id, type: "GRAPHIC", description: "Budget breakdown graphic", personId: elena.id },
      { storyId: sRentControl.id, type: "GRAPHIC", description: "Affected units map", personId: elena.id },
      { storyId: sBridge.id, type: "PHOTO", description: "Bridge inspection photos", personId: david.id },
      { storyId: sPoliceAudit.id, type: "GRAPHIC", description: "Body cam compliance chart", personId: elena.id },
      { storyId: sTransitExpansion.id, type: "GRAPHIC", description: "BRT route map", personId: elena.id },
      { storyId: sPension.id, type: "GRAPHIC", description: "Pension fund projections", personId: elena.id },
      { storyId: sClimate.id, type: "GRAPHIC", description: "Temperature trend chart", personId: elena.id },
    ],
  });

  // ─── Video Assignments ─────────────────────────────────────────────────────

  const [
    vTransit, vHarborDrone, vHospital, vFireChief, vHousing,
    vArts, vBudgetPreview, vFireStation, vRentControl, vBridge,
    vFoodBank, vTransitExp, vPension, vCountyFair, vClimate,
  ] = videos;

  const videoAssignments = [
    { videoId: vTransit.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vHarborDrone.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vHospital.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vHospital.id, personId: bob.id, role: "EDITOR" as const },
    { videoId: vFireChief.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vHousing.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vArts.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vBudgetPreview.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vBudgetPreview.id, personId: bob.id, role: "EDITOR" as const },
    { videoId: vFireStation.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vRentControl.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vBridge.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vFoodBank.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vTransitExp.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vTransitExp.id, personId: frank.id, role: "EDITOR" as const },
    { videoId: vPension.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vPension.id, personId: bob.id, role: "EDITOR" as const },
    { videoId: vCountyFair.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
    { videoId: vClimate.id, personId: maya.id, role: "VIDEOGRAPHER" as const },
  ];

  for (const a of videoAssignments) {
    await prisma.videoAssignment.create({ data: a });
  }

  console.log(
    `Seed complete: 7 people, ${stories.length} stories, ${videos.length} videos, ` +
    `${storyAssignments.length} story assignments, ${videoAssignments.length} video assignments, 17 visuals`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
