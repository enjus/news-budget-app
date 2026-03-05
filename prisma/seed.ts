import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Date helper ──────────────────────────────────────────────────────────────
// All pub times stored as newsroom-time-as-UTC: "9:00 AM" → T09:00:00.000Z
// We read local date parts and construct a UTC timestamp so the daily-view
// bucket logic (which uses getUTCHours) sees the correct hour.

const now = new Date();
const todayY = now.getFullYear();
const todayM = now.getMonth();
const todayD = now.getDate();

function d(offsetDays: number, hour: number): Date {
  const base = addDays(new Date(todayY, todayM, todayD), offsetDays);
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), hour, 0, 0));
}

// Wrap-around pick from an array
function pick<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

// ─── Content pools (used for past days) ──────────────────────────────────────

const PAST_STORY_POOL: Array<{ slug: string; budgetLine: string; isEnterprise?: boolean }> = [
  // City government
  { slug: "CITY BUDGET VOTE",       budgetLine: "City council approves $2.4B annual budget with cuts to parks and transit" },
  { slug: "COUNCIL REDISTRICTING",  budgetLine: "Redistricting commission approves new city council maps after public outcry" },
  { slug: "MAYOR INITIATIVE",       budgetLine: "Mayor announces $12M workforce development initiative targeting youth unemployment" },
  { slug: "ZONING OVERHAUL",        budgetLine: "Planning commission approves first major zoning rewrite in 20 years" },
  { slug: "CITY HALL SECURITY",     budgetLine: "New security measures installed at city hall after series of threats" },
  // Public safety
  { slug: "POLICE OVERTIME AUDIT",  budgetLine: "Audit: police overtime costs exceed budget by $3M for third consecutive year" },
  { slug: "FIRE RESPONSE TIMES",    budgetLine: "Fire department response times worsen as staffing levels fall to decade low" },
  { slug: "COURTHOUSE EXPANSION",   budgetLine: "County votes to expand courthouse with $28M addition to ease case backlog" },
  { slug: "JAIL INSPECTION",        budgetLine: "State inspectors flag overcrowding and medical care deficiencies at county jail" },
  { slug: "DUI CHECKPOINT DATA",    budgetLine: "Annual DUI enforcement data shows arrests up 18% in metro corridor" },
  // Education
  { slug: "SCHOOL BUDGET SHORTFALL", budgetLine: "Schools face $14M shortfall heading into next year; cuts to sports, arts likely" },
  { slug: "TEST SCORES REPORT",     budgetLine: "State releases standardized test results; local district scores fall below state average" },
  { slug: "TEACHER SHORTAGE",       budgetLine: "District reports 80 unfilled teaching positions; substitutes covering core classes" },
  { slug: "SCHOOL LUNCH DEBT",      budgetLine: "District cancels $180K in student meal debt for 3,000 low-income families" },
  { slug: "UNIVERSITY EXPANSION",   budgetLine: "State university breaks ground on $90M science and engineering complex" },
  // Business & economy
  { slug: "FACTORY CLOSING",        budgetLine: "Auto parts plant announces closure, eliminating 340 local manufacturing jobs" },
  { slug: "HOUSING DATA",           budgetLine: "New report: home prices up 11% year-over-year in metro; rental vacancy at 3%" },
  { slug: "DOWNTOWN VACANCY",       budgetLine: "Downtown storefront vacancy rate reaches 12-year high at 22%" },
  { slug: "TECH JOBS REPORT",       budgetLine: "Regional tech employment up 8% despite national layoffs, new data shows" },
  { slug: "MIXED USE DEVELOPMENT",  budgetLine: "Developer proposes 400-unit mixed-use project near downtown transit hub" },
  // Environment
  { slug: "AIR QUALITY ALERT",      budgetLine: "Multi-day air quality advisory issued; vulnerable residents urged to stay indoors" },
  { slug: "STORMWATER PROJECT",     budgetLine: "City begins $30M stormwater system overhaul to reduce flood risk in low-lying areas" },
  { slug: "RIVER CLEANUP",          budgetLine: "Volunteers remove 12 tons of debris from 8-mile river corridor in annual cleanup" },
  { slug: "PARK LAND ACQUISITION",  budgetLine: "County acquires 140 acres near reservoir for new regional park" },
  { slug: "CLIMATE AUDIT",          budgetLine: "County climate audit: average temperatures up 2.4°F since 1990, report finds" },
  // Health
  { slug: "FOOD BANK DEMAND",       budgetLine: "Regional food banks report 35% surge in demand; blame rising rents, grocery costs" },
  { slug: "MENTAL HEALTH FUNDING",  budgetLine: "County adds $5M to mental health crisis response after record call volume" },
  { slug: "HOSPITAL STAFFING",      budgetLine: "Nurses union raises staffing concerns at regional medical center" },
  { slug: "OVERDOSE REPORT",        budgetLine: "Annual overdose deaths hold steady at 94; fentanyl involved in 80% of cases" },
  { slug: "SENIOR CENTER OPENING",  budgetLine: "New $6M senior center opens in underserved neighborhood after six-year campaign" },
  // Transportation
  { slug: "BRIDGE INSPECTION",      budgetLine: "Three local bridges flagged in state inspection; one requires immediate repairs" },
  { slug: "BUS ROUTE CUTS",         budgetLine: "Transit agency proposes eliminating 8 low-ridership routes to close $18M deficit" },
  { slug: "ROAD RESURFACING",       budgetLine: "City earmarks $18M for road improvements; 42 miles to be resurfaced this summer" },
  { slug: "AIRPORT PARKING HIKE",   budgetLine: "Airport authority raises parking rates for first time in seven years" },
  { slug: "BIKE LANE EXPANSION",    budgetLine: "City council approves 20-mile bike lane expansion over three-year timeline" },
];

const PAST_VIDEO_POOL: Array<{ slug: string; budgetLine: string }> = [
  { slug: "BUDGET EXPLAINER",       budgetLine: "Breaking down the city's budget proposal in 90 seconds" },
  { slug: "COMMUTER REACTION",      budgetLine: "Commuters react to latest transit changes" },
  { slug: "NEIGHBORHOOD PROFILE",   budgetLine: "Inside a neighborhood as development transforms the area" },
  { slug: "OFFICIAL INTERVIEW",     budgetLine: "Local official on the issues facing the region" },
  { slug: "DATA VISUALIZATION",     budgetLine: "Visualizing a decade of local housing and income data" },
  { slug: "AERIAL FOOTAGE",         budgetLine: "Drone footage documents changes along the waterfront" },
  { slug: "COMMUNITY MEETING",      budgetLine: "Residents speak out at packed public meeting" },
  { slug: "SMALL BUSINESS OWNERS",  budgetLine: "Small business owners on navigating the changing economy" },
  { slug: "FIRST RESPONDERS",       budgetLine: "A day on the job with local first responders" },
  { slug: "ELECTION PREVIEW",       budgetLine: "Previewing key November races across the county" },
];

// ─── Enterprise story pool (scheduled out 180 days) ───────────────────────────

const ENTERPRISE_STORIES: Array<{ slug: string; budgetLine: string; notes?: string; offsetDays: number }> = [
  { slug: "PENSION CRISIS",         budgetLine: "City pension fund faces $340M shortfall — what it means for workers and taxpayers", offsetDays: 12, notes: "Need actuary interview and finance director response." },
  { slug: "AFFORDABLE HOUSING",     budgetLine: "Why the affordable housing crisis keeps getting worse despite record investment", offsetDays: 25, isEnterprise: true },
  { slug: "SCHOOL EQUITY REPORT",   budgetLine: "Disparities in school funding, outcomes across the district examined", offsetDays: 38, notes: "FOIA for per-pupil spending data by school submitted." },
  { slug: "TRANSIT FUTURE",         budgetLine: "The case for — and against — a major regional transit expansion", offsetDays: 50 },
  { slug: "CLIMATE ADAPTATION",     budgetLine: "How the city is (and isn't) preparing for the next decade of climate impacts", offsetDays: 63, notes: "Coordinate with county sustainability director." },
  { slug: "POLICE ACCOUNTABILITY",  budgetLine: "A year-long review of use-of-force incidents and departmental oversight", offsetDays: 75, notes: "Awaiting response to FOIA for incident reports." },
  { slug: "ARTS AND ECONOMY",       budgetLine: "The economic impact of the arts community — and what losing it would cost", offsetDays: 88 },
  { slug: "WATER INFRASTRUCTURE",   budgetLine: "Aging water system faces $500M upgrade — and a political battle over who pays", offsetDays: 100, notes: "Engineering report obtained. Water dept reviewing draft." },
  { slug: "ELECTION DEEP DIVE",     budgetLine: "Who's running the city: mapping the money and influence behind local elections", offsetDays: 113 },
  { slug: "OPIOID RESPONSE",        budgetLine: "Five years into the opioid crisis: what's changed, what hasn't, and why", offsetDays: 125 },
  { slug: "HOMELESSNESS SYSTEM",    budgetLine: "A year inside the region's homelessness response system", offsetDays: 138, notes: "Ongoing reporting. First installment targets Q3." },
  { slug: "FOOD SYSTEM",            budgetLine: "Where the region's food comes from — and who profits from how it gets here", offsetDays: 150 },
  { slug: "DEVELOPER INFLUENCE",    budgetLine: "How real estate money shapes local politics, zoning, and public spending", offsetDays: 163, notes: "Campaign finance data analysis underway." },
  { slug: "HOSPITAL PRICES",        budgetLine: "Price comparison: what area hospitals charge for the same procedures", offsetDays: 175 },
  { slug: "YOUTH VIOLENCE",         budgetLine: "Understanding the surge in youth violence and what the research says about solutions", offsetDays: 180 },
] as Array<{ slug: string; budgetLine: string; notes?: string; offsetDays: number; isEnterprise?: boolean }>;

// ─── Today's specific content ─────────────────────────────────────────────────

const TODAY_STORIES: Array<{
  slug: string; budgetLine: string; status: string;
  hour?: number; tbd?: boolean; isEnterprise?: boolean;
  printHour?: number; wordCount?: number; notes?: string; shelved?: boolean;
}> = [
  // Already published this morning
  { slug: "CITY BUDGET VOTE",      budgetLine: "City council passes $2.3B budget with cuts to parks, transit, and public health", status: "PUBLISHED_FINAL",      hour: 7,  printHour: 0, wordCount: 820 },
  { slug: "TRANSIT UPDATE",        budgetLine: "Bus service restored on 12 routes after overnight maintenance delays",             status: "PUBLISHED_FINAL",      hour: 8,  wordCount: 380 },
  { slug: "SCHOOL BOARD RULING",   budgetLine: "School board approves new literacy curriculum over union objections, 5-2",         status: "PUBLISHED_FINAL",      hour: 9,  printHour: 0, wordCount: 610 },
  // Live and updating
  { slug: "HOSPITAL MERGER RULING", budgetLine: "State AG clears hospital merger with conditions on pricing caps and staffing",    status: "PUBLISHED_ITERATING",  hour: 10, printHour: 0, wordCount: 940, isEnterprise: true, notes: "Updating with hospital and AG responses." },
  { slug: "FIRE STATION THREAT",   budgetLine: "Union warns two fire station closures in budget will raise response times citywide", status: "PUBLISHED_ITERATING", hour: 11, wordCount: 700, notes: "Fire chief response expected at 2pm presser." },
  { slug: "HOUSING AFFORDABILITY", budgetLine: "New metro data: median rent now exceeds 40% of median income in four zip codes",   status: "PUBLISHED_ITERATING",  hour: 12, printHour: 0, wordCount: 580 },
  // Drafted, scheduled for later today
  { slug: "POLICE CHIEF INTERVIEW", budgetLine: "New police chief outlines priorities: community policing, body cam compliance",   status: "DRAFT",                hour: 13, printHour: 0 },
  { slug: "ELECTION CANDIDATES",   budgetLine: "Profiles of the five candidates vying for the open council seat in District 4",   status: "DRAFT",                hour: 14 },
  { slug: "ARTS CENTER FUTURE",    budgetLine: "Community meeting draws 200 residents to debate arts center redevelopment plan",   status: "DRAFT",                hour: 15 },
  { slug: "WATER RATE HEARING",    budgetLine: "Hundreds testify at hearing on proposed 18% water rate increase",                 status: "DRAFT",                hour: 16, printHour: 0 },
  { slug: "TEACHER CONTRACT",      budgetLine: "Union and district resume contract talks after three-week standoff",               status: "DRAFT",                hour: 17 },
  // In the works — no time set yet
  { slug: "TECH CAMPUS PROPOSAL",  budgetLine: "Major tech firm eyes downtown campus; city offering $30M in incentives",          status: "DRAFT",                tbd: true, notes: "Source confirms announcement expected this week." },
  { slug: "CLIMATE ACTION PLAN",   budgetLine: "City releases updated climate action plan with 2035 carbon neutrality goal",      status: "DRAFT",                tbd: true },
  // Enterprise in progress — TBD pub date
  { slug: "PENSION SHORTFALL",     budgetLine: "City pension fund faces $340M shortfall; actuaries warn of insolvency risk",      status: "DRAFT",                tbd: true, isEnterprise: true, notes: "Finance director interview scheduled Thursday." },
  { slug: "EVICTION SURGE",        budgetLine: "Eviction filings up 34% since pandemic-era protections expired — a regional accountability look", status: "DRAFT", tbd: true, isEnterprise: true, notes: "Pulling court records. Need comment from housing authority." },
  { slug: "LEAD PIPE RECKONING",   budgetLine: "Thousands of lead service lines remain in use; city timelines for replacement keep slipping",    status: "DRAFT", tbd: true, isEnterprise: true, notes: "EPA deadline looming. Engineering sources lined up." },
  // Shelved
  { slug: "WATER MAIN BREAK",      budgetLine: "Downtown water main break caused morning commute disruption — story overtaken by events", status: "SHELVED", tbd: true, notes: "Shelved. Monitor for infrastructure follow-up angle." },
];

const TODAY_VIDEOS: Array<{ slug: string; budgetLine: string; status: string; hour?: number; tbd?: boolean; isEnterprise?: boolean }> = [
  { slug: "COUNCIL MEETING PREVIEW", budgetLine: "What to watch at today's city council budget vote",                            status: "PUBLISHED_FINAL",     hour: 7  },
  { slug: "BUDGET BREAKDOWN",        budgetLine: "What's in the city's $2.3B budget proposal — and what got cut",               status: "PUBLISHED_FINAL",     hour: 9  },
  { slug: "FIRE STATION TOUR",       budgetLine: "Inside one of the fire stations slated for closure under the proposed budget", status: "DRAFT",               hour: 12, isEnterprise: true },
  { slug: "RENTER STORIES",          budgetLine: "Metro renters share how rising housing costs are forcing them to move",        status: "DRAFT",               hour: 14 },
  { slug: "CLIMATE PLAN EXPLAINER",  budgetLine: "The city's 2035 climate goals — explained in two minutes",                    status: "DRAFT",               tbd: true },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...");

  // Clear all data in dependency order
  await prisma.user.deleteMany();
  await prisma.videoAssignment.deleteMany();
  await prisma.video.deleteMany();
  await prisma.visual.deleteMany();
  await prisma.storyAssignment.deleteMany();
  await prisma.story.deleteMany();
  await prisma.person.deleteMany();

  // ─── People ───────────────────────────────────────────────────────────────

  const alice = await prisma.person.create({ data: { name: "Alice Chen",      email: "alice@newsroom.com",  defaultRole: "REPORTER"            } });
  const bob   = await prisma.person.create({ data: { name: "Bob Martinez",    email: "bob@newsroom.com",    defaultRole: "EDITOR"              } });
  const carol = await prisma.person.create({ data: { name: "Carol Williams",  email: "carol@newsroom.com",  defaultRole: "REPORTER"            } });
  const david = await prisma.person.create({ data: { name: "David Kim",       email: "david@newsroom.com",  defaultRole: "PHOTOGRAPHER"        } });
  const elena = await prisma.person.create({ data: { name: "Elena Patel",     email: "elena@newsroom.com",  defaultRole: "GRAPHIC_DESIGNER"    } });
  const frank = await prisma.person.create({ data: { name: "Frank Johnson",   email: "frank@newsroom.com",  defaultRole: "EDITOR"              } });
  const maya  = await prisma.person.create({ data: { name: "Maya Singh",      email: "maya@newsroom.com",   defaultRole: "VIDEOGRAPHER"        } });

  const reporters = [alice, carol];
  const editors   = [bob, frank];

  // ─── Past 14 days: ~10 stories + 3 videos per day ─────────────────────────

  const pastStories: Array<{ id: string }> = [];
  const pastVideos:  Array<{ id: string }> = [];

  // Hours spread across the day for 10 stories: morning through evening
  const storyHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 17];
  // 3 videos per day
  const videoHours = [9, 12, 15];

  let poolIdx = 0;

  for (let day = -14; day <= -1; day++) {
    for (let si = 0; si < 10; si++) {
      const tmpl = pick(PAST_STORY_POOL, poolIdx++);
      const hour = storyHours[si];
      // Most past stories are PUBLISHED_FINAL; every 5th is PUBLISHED_ITERATING
      const status = si % 5 === 4 ? "PUBLISHED_ITERATING" : "PUBLISHED_FINAL";
      const hasPrint = si % 3 !== 2; // ~2/3 have print dates

      const story = await prisma.story.create({
        data: {
          slug:             tmpl.slug,
          budgetLine:       tmpl.budgetLine,
          isEnterprise:     !!tmpl.isEnterprise,
          status,
          onlinePubDate:    d(day, hour),
          onlinePubDateTBD: false,
          printPubDate:     hasPrint ? d(day, 0) : null,
          printPubDateTBD:  !hasPrint,
          wordCount:        400 + Math.floor((poolIdx * 137) % 800), // deterministic variety
          sortOrder:        si + 1,
        },
      });
      pastStories.push(story);

      // Assign reporter + editor (rotate)
      const reporter = pick(reporters, poolIdx);
      const editor   = pick(editors,   poolIdx);
      await prisma.storyAssignment.createMany({
        data: [
          { storyId: story.id, personId: reporter.id, role: "REPORTER" },
          { storyId: story.id, personId: editor.id,   role: "EDITOR"   },
        ],
      });

      // Add a visual to every 4th story (photo) or every 7th (graphic)
      if (poolIdx % 4 === 0) {
        await prisma.visual.create({ data: { storyId: story.id, type: "PHOTO",   personId: david.id } });
      } else if (poolIdx % 7 === 0) {
        await prisma.visual.create({ data: { storyId: story.id, type: "GRAPHIC", personId: elena.id } });
      }
    }

    for (let vi = 0; vi < 3; vi++) {
      const tmpl = pick(PAST_VIDEO_POOL, poolIdx++);
      const video = await prisma.video.create({
        data: {
          slug:             tmpl.slug,
          budgetLine:       tmpl.budgetLine,
          status:           "PUBLISHED_FINAL",
          onlinePubDate:    d(day, videoHours[vi]),
          onlinePubDateTBD: false,
          sortOrder:        vi + 1,
        },
      });
      pastVideos.push(video);

      await prisma.videoAssignment.create({
        data: { videoId: video.id, personId: maya.id, role: "VIDEOGRAPHER" },
      });
    }
  }

  // ─── Today: 15 stories + 5 videos with mixed statuses ─────────────────────

  const todayStoryRecords: Array<{ id: string }> = [];
  for (let i = 0; i < TODAY_STORIES.length; i++) {
    const t = TODAY_STORIES[i];
    const story = await prisma.story.create({
      data: {
        slug:             t.slug,
        budgetLine:       t.budgetLine,
        isEnterprise:     !!t.isEnterprise,
        status:           t.status,
        onlinePubDate:    t.tbd || t.hour === undefined ? null : d(0, t.hour),
        onlinePubDateTBD: !!t.tbd || t.hour === undefined,
        printPubDate:     t.printHour !== undefined ? d(0, t.printHour) : null,
        printPubDateTBD:  t.printHour === undefined,
        notes:            t.notes ?? null,
        shelvedAt:        t.status === "SHELVED" ? new Date() : null,
        sortOrder:        i + 1,
      },
    });
    todayStoryRecords.push(story);

    const reporter = pick(reporters, i);
    const editor   = pick(editors,   i);
    await prisma.storyAssignment.createMany({
      data: [
        { storyId: story.id, personId: reporter.id, role: "REPORTER" },
        { storyId: story.id, personId: editor.id,   role: "EDITOR"   },
      ],
    });

    // Visuals for select today stories
    if (i % 3 === 0) await prisma.visual.create({ data: { storyId: story.id, type: "PHOTO",   description: "Photo for today story",   personId: david.id } });
    if (i % 4 === 0) await prisma.visual.create({ data: { storyId: story.id, type: "GRAPHIC", description: "Graphic for today story", personId: elena.id } });
  }

  const todayVideoRecords: Array<{ id: string }> = [];
  for (let i = 0; i < TODAY_VIDEOS.length; i++) {
    const t = TODAY_VIDEOS[i];
    const video = await prisma.video.create({
      data: {
        slug:             t.slug,
        budgetLine:       t.budgetLine,
        isEnterprise:     !!t.isEnterprise,
        status:           t.status,
        onlinePubDate:    t.tbd || t.hour === undefined ? null : d(0, t.hour),
        onlinePubDateTBD: !!t.tbd || t.hour === undefined,
        sortOrder:        i + 1,
      },
    });
    todayVideoRecords.push(video);
    await prisma.videoAssignment.create({ data: { videoId: video.id, personId: maya.id, role: "VIDEOGRAPHER" } });
    if (i % 2 === 0) {
      await prisma.videoAssignment.create({ data: { videoId: video.id, personId: pick(editors, i).id, role: "EDITOR" } });
    }
  }

  // ─── Enterprise stories: 15 pieces spread over next 180 days ─────────────

  const enterpriseRecords: Array<{ id: string }> = [];
  for (let i = 0; i < ENTERPRISE_STORIES.length; i++) {
    const t = ENTERPRISE_STORIES[i];
    const story = await prisma.story.create({
      data: {
        slug:             t.slug,
        budgetLine:       t.budgetLine,
        isEnterprise:     true,
        status:           "DRAFT",
        onlinePubDate:    d(t.offsetDays, 9),
        onlinePubDateTBD: false,
        printPubDate:     i % 2 === 0 ? d(t.offsetDays, 0) : null,
        printPubDateTBD:  i % 2 !== 0,
        notes:            t.notes ?? null,
        sortOrder:        i + 1,
      },
    });
    enterpriseRecords.push(story);

    const reporter = pick(reporters, i + 7);
    const editor   = pick(editors,   i + 7);
    await prisma.storyAssignment.createMany({
      data: [
        { storyId: story.id, personId: reporter.id, role: "REPORTER" },
        { storyId: story.id, personId: editor.id,   role: "EDITOR"   },
      ],
    });

    // Enterprise pieces get graphics
    if (i % 2 === 0) {
      await prisma.visual.create({ data: { storyId: story.id, type: "GRAPHIC", description: "Enterprise graphic", personId: elena.id } });
    }
  }

  // ─── Admin user ───────────────────────────────────────────────────────────

  const adminHash = await bcrypt.hash("newsbudget2026", 12);
  await prisma.user.create({
    data: { email: "admin@newsroom.com", name: "Admin", passwordHash: adminHash, appRole: "ADMIN" },
  });
  await prisma.user.create({
    data: { email: "director@newsroom.com", name: "Director", passwordHash: adminHash, appRole: "ADMIN" },
  });
  const editorHash = await bcrypt.hash("newsbudget2026", 12);
  await prisma.user.create({
    data: { email: "editor@newsroom.com",       name: "Editor",       passwordHash: editorHash, appRole: "EDITOR" },
  });
  await prisma.user.create({
    data: { email: "reporter@newsroom.com",     name: "Reporter",     passwordHash: editorHash, appRole: "EDITOR" },
  });
  await prisma.user.create({
    data: { email: "videographer@newsroom.com", name: "Videographer", passwordHash: editorHash, appRole: "EDITOR" },
  });
  const viewerHash = await bcrypt.hash("newsbudget2026", 12);
  await prisma.user.create({
    data: { email: "photographer@newsroom.com", name: "Photographer", passwordHash: viewerHash, appRole: "VIEWER" },
  });
  await prisma.user.create({
    data: { email: "designer@newsroom.com",     name: "Designer",     passwordHash: viewerHash, appRole: "VIEWER" },
  });
  await prisma.user.create({
    data: { email: "social@newsroom.com",       name: "Social",       passwordHash: viewerHash, appRole: "VIEWER" },
  });
  await prisma.user.create({
    data: { email: "audience@newsroom.com",     name: "Audience",     passwordHash: viewerHash, appRole: "VIEWER" },
  });

  const totalStories  = pastStories.length + todayStoryRecords.length + enterpriseRecords.length;
  const totalVideos   = pastVideos.length  + todayVideoRecords.length;

  console.log(
    `Seed complete: 9 users (2 admin, 3 editor, 4 viewer), 7 people,\n` +
    `  ${pastStories.length} past stories (14 days × 10/day)\n` +
    `  ${todayStoryRecords.length} today stories (mixed statuses)\n` +
    `  ${enterpriseRecords.length} enterprise stories (next 180 days)\n` +
    `  ${totalStories} stories total\n` +
    `  ${pastVideos.length} past videos + ${todayVideoRecords.length} today videos = ${totalVideos} videos total`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
