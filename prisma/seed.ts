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

// Returns the next occurrence of targetDow (0=Sun, 3=Wed) strictly after `date`
function nextEditionDay(date: Date, targetDow: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const daysUntil = (targetDow - result.getDay() + 7) % 7 || 7;
  result.setDate(result.getDate() + daysUntil);
  return result;
}

// Returns the nearer of the next Wednesday or next Sunday after `date`
function nextEnterpriseEdition(date: Date): Date {
  const nextWed = nextEditionDay(date, 3);
  const nextSun = nextEditionDay(date, 0);
  return nextWed <= nextSun ? nextWed : nextSun;
}

// ─── Content pools (used for past days) ──────────────────────────────────────

const PAST_STORY_POOL: Array<{ slug: string; budgetLine: string; isEnterprise?: boolean }> = [
  // City government
  { slug: "CITY BUDGET VOTE",       budgetLine: "City council votes 7-4 to approve a $2.4B annual budget that cuts parks maintenance funding by 15% and delays two planned transit expansion projects. The approved spending plan also freezes hiring across most city departments." },
  { slug: "COUNCIL REDISTRICTING",  budgetLine: "The city's redistricting commission has approved new council maps that redraw boundaries in four of nine districts following contentious public hearings. Critics say the new lines dilute minority voting strength on the east side." },
  { slug: "MAYOR INITIATIVE",       budgetLine: "Mayor unveils a $12M workforce development initiative aimed at reducing youth unemployment, which currently sits at 22% for residents under 24. The program targets job training in construction, healthcare, and tech." },
  { slug: "ZONING OVERHAUL",        budgetLine: "Planning commission approves the city's first comprehensive zoning rewrite in two decades, easing density restrictions across dozens of neighborhoods near transit corridors." },
  { slug: "CITY HALL SECURITY",     budgetLine: "City hall is installing new security screening equipment and adding two full-time guard positions after a series of threatening incidents over the past three months. Officials declined to detail the nature of the threats." },
  // Public safety
  { slug: "POLICE OVERTIME AUDIT",  budgetLine: "A city auditor's report finds police overtime costs exceeded budget projections by $3M for the third consecutive year, driven largely by a backlog of special event assignments and department understaffing. The audit recommends tighter scheduling controls and a staffing review." },
  { slug: "FIRE RESPONSE TIMES",    budgetLine: "Average fire department response times have increased by nearly two minutes over the past four years as staffing levels have fallen to their lowest point in a decade. Union officials blame a hiring freeze and a wave of retirements that hasn't been offset by new recruits." },
  { slug: "COURTHOUSE EXPANSION",   budgetLine: "County commissioners vote 5-2 to move forward with a $28M courthouse expansion that would add three courtrooms and a new clerk's office. Supporters say the addition is needed to address a case backlog that has grown 40% since 2019." },
  { slug: "JAIL INSPECTION",        budgetLine: "State inspectors who toured the county jail last month flagged serious concerns about overcrowding, inadequate medical staffing, and a broken HVAC system in two housing units. County officials have 90 days to submit a corrective action plan." },
  { slug: "DUI CHECKPOINT DATA",    budgetLine: "New data from the sheriff's office shows DUI arrests at enforcement checkpoints are up 18% along the metro corridor compared to the same period last year. Officials credit expanded weekend patrols funded through a federal highway safety grant." },
  // Education
  { slug: "SCHOOL BUDGET SHORTFALL", budgetLine: "District administrators are warning that a projected $14M shortfall heading into next school year will likely require cuts to athletic programs, arts classes, and after-school activities. The deficit stems from declining enrollment and rising healthcare costs for staff." },
  { slug: "TEST SCORES REPORT",     budgetLine: "State test results show students in the local district scoring below state averages in reading and math for the second consecutive year. District officials point to pandemic-era learning loss and high teacher turnover as the primary drivers." },
  { slug: "TEACHER SHORTAGE",       budgetLine: "The district enters the fall semester with 80 teaching positions unfilled, forcing principals to use substitutes in core academic classes at multiple schools. Administrators say salaries that trail neighboring districts by as much as $8,000 are making recruitment difficult." },
  { slug: "SCHOOL LUNCH DEBT",      budgetLine: "The district has canceled $180K in accumulated school meal debt owed by roughly 3,000 low-income students, using funds from a state grant designed to eliminate lunch shaming. Officials say no student will be denied a meal over an unpaid balance going forward." },
  { slug: "UNIVERSITY EXPANSION",   budgetLine: "The state university broke ground on a $90M science and engineering complex that will consolidate six academic departments when it opens in 2027. University officials say the building is designed to attract federally funded research programs currently spread across aging facilities." },
  // Business & economy
  { slug: "FACTORY CLOSING",        budgetLine: "An auto parts manufacturer has announced it will close its local plant by year's end, eliminating 340 union jobs that pay an average of $28 an hour with benefits. Company officials cited rising materials costs and a shift in production to a facility in another state." },
  { slug: "HOUSING DATA",           budgetLine: "A new market report shows home prices in the metro area rose 11% year-over-year, pushing the median sale price to $387,000. The rental market is also tight, with vacancy rates falling to 3% — a level housing economists associate with significant upward rent pressure." },
  { slug: "DOWNTOWN VACANCY",       budgetLine: "The downtown storefront vacancy rate has climbed to 22%, its highest level in 12 years, as several long-standing retailers have closed or relocated to suburban strip malls. A new report from the business improvement district blames high rents, construction disruption, and reduced foot traffic." },
  { slug: "TECH JOBS REPORT",       budgetLine: "Regional tech employment grew 8% over the past year even as national tech giants laid off tens of thousands of workers, according to new data from the state labor department. Analysts attribute the local growth to a cluster of mid-size firms in cybersecurity and health technology." },
  { slug: "MIXED USE DEVELOPMENT",  budgetLine: "A development company has proposed a 400-unit mixed-use project near the downtown transit hub, combining apartments, retail, and office space on a surface parking lot the city has been trying to redevelop for years. The project requires a zoning variance and city council approval before moving forward." },
  // Environment
  { slug: "AIR QUALITY ALERT",      budgetLine: "Officials have issued a multi-day air quality advisory as smoke from wildfires several states away combines with local vehicle emissions to push particulate levels into the unhealthy range. Residents with respiratory conditions, young children, and older adults are urged to stay indoors." },
  { slug: "STORMWATER PROJECT",     budgetLine: "The city has begun a $30M overhaul of its stormwater infrastructure in three low-lying neighborhoods that have flooded repeatedly during heavy rains. The project, funded through a federal resilience grant, will add underground retention basins and replace aging drainage pipes." },
  { slug: "RIVER CLEANUP",          budgetLine: "More than 600 volunteers turned out over the weekend to remove 12 tons of trash and debris from an 8-mile stretch of the river corridor. Organizers called it the largest turnout in the event's history and said illegal dumping remains the biggest ongoing challenge." },
  { slug: "PARK LAND ACQUISITION",  budgetLine: "The county has finalized the purchase of 140 acres of wooded land near the reservoir that will become the foundation of a new regional park. Trail development and public access could begin as early as next year, pending an environmental study." },
  { slug: "CLIMATE AUDIT",          budgetLine: "A new county climate audit finds average local temperatures have risen 2.4 degrees Fahrenheit since 1990, a rate faster than the global average. The report also documents increases in extreme heat days and a measurable decline in annual snowpack." },
  // Health
  { slug: "FOOD BANK DEMAND",       budgetLine: "Regional food banks are reporting a 35% surge in demand compared to the same period last year, with pantry directors attributing the increase to rising rents and grocery prices squeezing working-class families. Several locations have had to limit the frequency of client visits." },
  { slug: "MENTAL HEALTH FUNDING",  budgetLine: "The county is adding $5M to its mental health crisis response budget after the 988 crisis line received a record number of calls last year. The funds will pay for mobile response teams that can be dispatched as an alternative to law enforcement in non-violent situations." },
  { slug: "HOSPITAL STAFFING",      budgetLine: "The nurses union at the regional medical center has filed a formal complaint with state regulators alleging the hospital is routinely operating below minimum nurse-to-patient ratios. Hospital administrators say they are working to fill vacancies through a national recruitment program." },
  { slug: "OVERDOSE REPORT",        budgetLine: "The county's annual overdose report shows 94 deaths last year — roughly flat compared to the prior year — with fentanyl detected in about 80% of cases. Public health officials say expanded naloxone distribution has likely prevented many additional deaths." },
  { slug: "SENIOR CENTER OPENING",  budgetLine: "A new $6M senior center has opened in a neighborhood that lacked any dedicated facility for older residents, following a six-year organizing campaign by local advocates. The center offers meals, transportation assistance, and health screenings five days a week." },
  // Transportation
  { slug: "BRIDGE INSPECTION",      budgetLine: "The state transportation department's latest inspection report has flagged three local bridges with structural deficiencies, including one that requires immediate lane restrictions until repairs can be scheduled. Officials say none of the spans is at risk of imminent failure." },
  { slug: "BUS ROUTE CUTS",         budgetLine: "The regional transit agency is proposing to eliminate eight bus routes with low ridership as part of an effort to close an $18M budget deficit. Opponents say the cuts would disproportionately affect lower-income riders who depend on the routes to reach jobs and medical appointments." },
  { slug: "ROAD RESURFACING",       budgetLine: "The city has earmarked $18M to resurface 42 miles of roads this summer, targeting corridors that received the lowest scores in the annual pavement condition survey. Work begins next month on residential streets on the east side that have gone more than a decade without major maintenance." },
  { slug: "AIRPORT PARKING HIKE",   budgetLine: "The airport authority has voted to increase parking rates by an average of 12% — the first increase in seven years — citing rising operating costs and a need to fund terminal upgrades. The changes take effect next month." },
  { slug: "BIKE LANE EXPANSION",    budgetLine: "City council has approved a three-year plan to add 20 miles of protected bike lanes across several major corridors, following a traffic study that found the city's cycling network is among the least connected of any comparable metro area. Construction begins on the first phase next spring." },
];

const PAST_VIDEO_POOL: Array<{ slug: string; budgetLine: string }> = [
  { slug: "BUDGET EXPLAINER",       budgetLine: "A 90-second breakdown of where the city's money goes and what the proposed cuts would mean for residents. Graphics illustrate spending by department and how this year's plan compares to last." },
  { slug: "COMMUTER REACTION",      budgetLine: "We talked to bus and train riders about the latest round of service changes. Their frustration about delayed routes and crowded platforms is on the record." },
  { slug: "NEIGHBORHOOD PROFILE",   budgetLine: "A visual portrait of a longtime neighborhood as new development reshapes its character. Long-time residents and newcomers reflect on what's changing and what they hope will stay." },
  { slug: "OFFICIAL INTERVIEW",     budgetLine: "A sit-down with a key local official on the top issues facing the region, covering the budget, housing costs, and the upcoming election." },
  { slug: "DATA VISUALIZATION",     budgetLine: "Animated graphics track ten years of housing prices, median income, and displacement across the metro. The widening gap between the two trend lines tells the story." },
  { slug: "AERIAL FOOTAGE",         budgetLine: "Drone footage documents construction activity and landscape changes along the waterfront over the past three years. Narrated by a city planner who oversaw the permitting process." },
  { slug: "COMMUNITY MEETING",      budgetLine: "Residents packed a school auditorium to weigh in on a proposed development project. The meeting ran three hours; we captured the most pointed exchanges." },
  { slug: "SMALL BUSINESS OWNERS",  budgetLine: "Three small business owners — a restaurant, a laundry, and a bookshop — talk about navigating rising rents, supply costs, and changing foot traffic. All three have been operating for more than a decade." },
  { slug: "FIRST RESPONDERS",       budgetLine: "We spent a shift with a fire crew and a paramedic team documenting the calls, the pace, and the pressure of public safety work in a city with a thinning budget." },
  { slug: "ELECTION PREVIEW",       budgetLine: "With the November ballot taking shape, we break down the key races across the county and the issues likely to decide them. Includes on-camera interviews with candidates from two contested seats." },
];

// ─── Enterprise story pool (scheduled out 180 days) ───────────────────────────

const ENTERPRISE_STORIES: Array<{ slug: string; budgetLine: string; notes?: string; offsetDays: number }> = [
  { slug: "PENSION CRISIS",         budgetLine: "The city's pension fund is facing a $340M shortfall that actuaries say will grow significantly unless contribution rates are raised or benefits restructured. We examine what the deficit means for city workers counting on retirement security and for taxpayers who may be asked to make up the difference.", offsetDays: 12, notes: "Need actuary interview and finance director response." },
  { slug: "AFFORDABLE HOUSING",     budgetLine: "Despite record levels of state and federal investment in affordable housing over the past decade, the shortage of units at the lowest income levels has grown worse in this region. A deep look at where the money went, who benefited, and why the gap keeps widening.", offsetDays: 25, isEnterprise: true },
  { slug: "SCHOOL EQUITY REPORT",   budgetLine: "An analysis of per-pupil spending, teacher experience, and test outcomes across the district reveals significant disparities between schools in wealthier and lower-income neighborhoods. We requested five years of budget and assignment data to document how resource allocation shapes opportunity.", offsetDays: 38, notes: "FOIA for per-pupil spending data by school submitted." },
  { slug: "TRANSIT FUTURE",         budgetLine: "A proposed $2B regional transit expansion has support from urbanists and business groups — and fierce opposition from suburban officials and some fiscal conservatives. We lay out the competing arguments, the financing questions, and what comparable expansions have delivered in other metros.", offsetDays: 50 },
  { slug: "CLIMATE ADAPTATION",     budgetLine: "City planning documents project a significant increase in extreme heat days and flood risk over the next 25 years, but infrastructure investment has not kept pace with those projections. We examine the gap between what the city's own reports say is needed and what is actually being funded and built.", offsetDays: 63, notes: "Coordinate with county sustainability director." },
  { slug: "POLICE ACCOUNTABILITY",  budgetLine: "A year-long examination of use-of-force incidents, complaint dispositions, and discipline records at the police department. The reporting draws on records obtained through public records requests and interviews with officers, oversight officials, and community members.", offsetDays: 75, notes: "Awaiting response to FOIA for incident reports." },
  { slug: "ARTS AND ECONOMY",       budgetLine: "The region's arts and cultural sector contributes an estimated $380M annually to the local economy through direct employment, tourism, and adjacent spending — yet receives less than 1% of the city budget. We document the economic case and examine what peer cities invest by comparison.", offsetDays: 88 },
  { slug: "WATER INFRASTRUCTURE",   budgetLine: "Much of the city's water distribution system was built before 1960 and is approaching the end of its service life. An engineering assessment obtained by the newsroom estimates $500M in upgrades are needed over the next decade, touching off a debate over who bears the cost.", offsetDays: 100, notes: "Engineering report obtained. Water dept reviewing draft." },
  { slug: "ELECTION DEEP DIVE",     budgetLine: "A data-driven look at who funds local campaigns, who wins, and what policies follow. We mapped contributions from real estate developers, police unions, and business associations against voting records over the past three election cycles.", offsetDays: 113 },
  { slug: "OPIOID RESPONSE",        budgetLine: "Five years after the county declared a public health emergency over opioid overdoses, we take stock of what the response has accomplished and where it has fallen short. Spending is up significantly; deaths have not dropped proportionately.", offsetDays: 125 },
  { slug: "HOMELESSNESS SYSTEM",    budgetLine: "We spent a year documenting the region's homelessness response — from emergency shelters and transitional housing to the legal and political battles over encampments. The series examines outcomes, funding, and the human toll of a system under sustained strain.", offsetDays: 138, notes: "Ongoing reporting. First installment targets Q3." },
  { slug: "FOOD SYSTEM",            budgetLine: "A regional investigation into the supply chains, land ownership, and corporate structures behind the food that ends up on local tables. We track the distance from farm to store and document who captures the margin at each step.", offsetDays: 150 },
  { slug: "DEVELOPER INFLUENCE",    budgetLine: "An analysis of campaign finance records, zoning decisions, and public contracts reveals a pattern of significant political giving by real estate developers in the years before major approvals. We examine the relationships and the decisions that followed.", offsetDays: 163, notes: "Campaign finance data analysis underway." },
  { slug: "HOSPITAL PRICES",        budgetLine: "We submitted the same list of 20 common procedures to the five major hospital systems in the region and compared what they charge. The price differences — often by a factor of two or more — reveal how little transparency governs what patients and insurers pay.", offsetDays: 175 },
  { slug: "YOUTH VIOLENCE",         budgetLine: "After a year in which youth homicides reached a decade high, we examine the research on what interventions reduce violence among young people and how well-funded those programs are locally. Includes interviews with young people, advocates, and researchers.", offsetDays: 180 },
] as Array<{ slug: string; budgetLine: string; notes?: string; offsetDays: number; isEnterprise?: boolean }>;

// ─── Today's specific content ─────────────────────────────────────────────────

const TODAY_STORIES: Array<{
  slug: string; budgetLine: string; status: string;
  hour?: number; tbd?: boolean; isEnterprise?: boolean;
  hasPrint?: boolean; wordCount?: number; notes?: string; shelved?: boolean;
  unassigned?: boolean;
}> = [
  // Already published this morning
  { slug: "CITY BUDGET VOTE",      budgetLine: "City council passed a $2.3B spending plan on a 6-5 vote after months of negotiations, with final cuts falling heavily on parks maintenance, bus service expansion, and a planned public health clinic. The vote came after more than four hours of public testimony.", status: "PUBLISHED_FINAL", hour: 7, hasPrint: true, wordCount: 820 },
  { slug: "TRANSIT UPDATE",        budgetLine: "Bus service has been restored on 12 routes that were suspended overnight due to a maintenance emergency affecting the agency's east depot. The disruption stranded thousands of morning commuters; the transit authority is offering fare refunds.", status: "PUBLISHED_FINAL", hour: 8, wordCount: 380 },
  { slug: "SCHOOL BOARD RULING",   budgetLine: "The school board voted 5-2 to adopt a new literacy curriculum despite strong opposition from the teachers union, which argued the materials were not age-appropriate and were selected without adequate classroom input. The new curriculum takes effect in the fall.", status: "PUBLISHED_FINAL", hour: 9, hasPrint: true, wordCount: 610 },
  // Live and updating
  { slug: "HOSPITAL MERGER RULING", budgetLine: "The state attorney general has cleared a merger between two major hospital systems, imposing conditions that require the combined entity to cap price increases and maintain current staffing levels for five years. Health advocates say the conditions don't go far enough. UPDATING.", status: "PUBLISHED_ITERATING", hour: 10, hasPrint: true, wordCount: 940, isEnterprise: true, notes: "Updating with hospital and AG responses." },
  { slug: "FIRE STATION THREAT",   budgetLine: "The firefighters union is warning that two fire station closures proposed in the city budget would meaningfully increase response times in the affected districts, contradicting assurances from the fire chief. Union officials plan to present their own data at a council hearing this afternoon. UPDATING.", status: "PUBLISHED_ITERATING", hour: 11, wordCount: 700, notes: "Fire chief response expected at 2pm presser." },
  { slug: "HOUSING AFFORDABILITY", budgetLine: "New data from a regional housing research group shows that median monthly rents now exceed 40% of median household income in four metro zip codes — a threshold economists use as a marker of severe cost burden. The figures are the worst since the group began tracking the metric in 2012. UPDATING.", status: "PUBLISHED_ITERATING", hour: 12, hasPrint: true, wordCount: 580 },
  // Drafted, scheduled for later today
  { slug: "POLICE CHIEF INTERVIEW", budgetLine: "The city's newly confirmed police chief sat down with us to discuss his priorities for the department, including a push to expand community policing assignments and a timeline for full body camera compliance. We also pressed him on the department's use-of-force numbers.", status: "DRAFT", hour: 13, hasPrint: true },
  { slug: "ELECTION CANDIDATES",   budgetLine: "With the filing deadline now passed, we profile the five candidates seeking the open District 4 council seat: a former school board member, two community organizers, a small business owner, and a political newcomer backed by a prominent developer.", status: "DRAFT", hour: 14 },
  { slug: "ARTS CENTER FUTURE",    budgetLine: "More than 200 residents turned out for a community meeting on competing proposals for the arts center site, with opinions running sharply along generational and neighborhood lines. The city must choose between a preservation-focused plan and a full redevelopment proposal by year's end.", status: "DRAFT", hour: 15 },
  { slug: "WATER RATE HEARING",    budgetLine: "Hundreds of residents testified at a public hearing on the utility's proposal to raise water rates by 18% over three years. Testimony ranged from support for infrastructure investment to concern about affordability for fixed-income households. The utility board votes next month.", status: "DRAFT", hour: 16, hasPrint: true },
  { slug: "FISTICUFFS",            budgetLine: "In an extraordinary scene, two city councilors broke out in fisticuffs Thursday at Portland City Hall, injuring not only the politicians physically but the elected body reputationally.", status: "DRAFT", hour: 17, wordCount: 950 },
  { slug: "TEACHER CONTRACT",      budgetLine: "The teachers union and school district have returned to the bargaining table after a three-week standoff over salary proposals, according to a joint statement released this morning. Both sides declined to detail the terms under discussion.", status: "DRAFT", hour: 17 },
  // In the works — no time set yet
  { slug: "TECH CAMPUS PROPOSAL",  budgetLine: "A major technology firm is in early discussions with the city about locating a regional campus downtown, with city officials offering a package that includes tax increment financing and expedited permitting worth up to $30M. A source with knowledge of the talks says an announcement could come as soon as this week.", status: "DRAFT", tbd: true, notes: "Source confirms announcement expected this week." },
  { slug: "CLIMATE ACTION PLAN",   budgetLine: "The city has released an updated climate action plan setting a goal of carbon neutrality by 2035, a more aggressive target than its previous plan. Environmental advocates called the document encouraging but noted it lacks enforceable milestones or dedicated funding streams.", status: "DRAFT", tbd: true },
  // Enterprise in progress — TBD pub date
  { slug: "PENSION SHORTFALL",     budgetLine: "The city pension fund's latest actuarial report projects a $340M shortfall that will grow to more than $500M within a decade under current contribution rates. We're seeking comment from the finance director and union leadership; a full accountability story is in progress.", status: "DRAFT", tbd: true, isEnterprise: true, notes: "Finance director interview scheduled Thursday." },
  { slug: "EVICTION SURGE",        budgetLine: "Eviction filings in the region have increased 34% since the expiration of pandemic-era tenant protections, according to court records we obtained and analyzed. The increase is concentrated in ZIP codes with older rental housing stock and lower median incomes — a pattern we're documenting through court filings and tenant interviews.", status: "DRAFT", tbd: true, isEnterprise: true, notes: "Pulling court records. Need comment from housing authority." },
  { slug: "LEAD PIPE RECKONING",   budgetLine: "Thousands of homes in the city are still connected to the water main through lead service lines, and city timelines for replacing them have slipped repeatedly. With an EPA compliance deadline approaching, we're examining the gap between the city's stated commitments and the pace of actual replacement.", status: "DRAFT", tbd: true, isEnterprise: true, notes: "EPA deadline looming. Engineering sources lined up." },
  // Unassigned — no reporter yet
  { slug: "STADIUM FINANCING",     budgetLine: "City officials are weighing a request from a professional sports franchise for $150M in public financing toward a new stadium, a proposal that has drawn sharp criticism from fiscal watchdogs and neighborhood groups near the proposed site.", status: "DRAFT", tbd: true, unassigned: true },
  // Shelved
  { slug: "WATER MAIN BREAK",      budgetLine: "A downtown water main break caused significant morning commute disruption before crews repaired the line — story overtaken by events.", status: "SHELVED", tbd: true, notes: "Shelved. Monitor for infrastructure follow-up angle." },
];

const TODAY_VIDEOS: Array<{ slug: string; budgetLine: string; status: string; hour?: number; tbd?: boolean; isEnterprise?: boolean }> = [
  { slug: "COUNCIL MEETING PREVIEW", budgetLine: "A quick guide to what's at stake at today's city council budget vote — which departments are facing cuts, who's expected to testify, and what a yes or no vote would mean for city services. Shot this morning ahead of the session.", status: "PUBLISHED_FINAL", hour: 7 },
  { slug: "BUDGET BREAKDOWN",        budgetLine: "We walk through the major line items in the city's $2.3B budget proposal, explain what got cut from last year's plan, and ask a city budget analyst to help make sense of the numbers for everyday residents.", status: "PUBLISHED_FINAL", hour: 9 },
  { slug: "FIRE STATION TOUR",       budgetLine: "We spent a morning at one of the two fire stations the city is proposing to close. Crew members walked us through their response area, the calls they handle, and what closure would mean for coverage in the surrounding neighborhoods. Part of our enterprise reporting on fire department staffing.", status: "DRAFT", hour: 12, isEnterprise: true },
  { slug: "RENTER STORIES",          budgetLine: "We spoke with five metro-area renters whose housing situations have changed significantly in the past two years — people who have moved farther out, taken in roommates, or left the region entirely because of rising costs.", status: "DRAFT", hour: 14 },
  { slug: "CLIMATE PLAN EXPLAINER",  budgetLine: "A two-minute explainer on the city's newly released 2035 carbon neutrality goal: what the plan commits to, what it leaves out, and how it compares to what other cities of similar size have pledged. In production.", status: "DRAFT", tbd: true },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...");

  // Clear all data in dependency order
  await prisma.user.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.videoAssignment.deleteMany();
  await prisma.video.deleteMany();
  await prisma.visual.deleteMany();
  await prisma.storyAssignment.deleteMany();
  await prisma.story.deleteMany();
  await prisma.person.deleteMany();

  // ─── People ───────────────────────────────────────────────────────────────

  const alice = await prisma.person.create({ data: { name: "Alice Chen",      email: "alice@newsroom.com",     defaultRole: "REPORTER"            } });
  const bob   = await prisma.person.create({ data: { name: "Bob Martinez",    email: "bob@newsroom.com",       defaultRole: "EDITOR"              } });
  const carol = await prisma.person.create({ data: { name: "Carol Williams",  email: "carol@newsroom.com",     defaultRole: "REPORTER"            } });
  const david = await prisma.person.create({ data: { name: "David Kim",       email: "david@newsroom.com",     defaultRole: "PHOTOGRAPHER"        } });
  const elena = await prisma.person.create({ data: { name: "Elena Patel",     email: "elena@newsroom.com",     defaultRole: "GRAPHIC_DESIGNER"    } });
  const frank = await prisma.person.create({ data: { name: "Frank Johnson",   email: "frank@newsroom.com",     defaultRole: "EDITOR"              } });
  const maya  = await prisma.person.create({ data: { name: "Maya Singh",      email: "maya@newsroom.com",      defaultRole: "VIDEOGRAPHER"        } });
  // Linked to admin/director user accounts
  const sam   = await prisma.person.create({ data: { name: "Sam Okafor",      email: "admin@newsroom.com",     defaultRole: "EDITOR"              } });
  const jamie = await prisma.person.create({ data: { name: "Jamie Rivera",    email: "director@newsroom.com",  defaultRole: "EDITOR"              } });

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
          printPubDate:     hasPrint ? d(day + 1, 0) : null,
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
        printPubDate:     t.hasPrint ? d(1, 0) : null,
        printPubDateTBD:  !t.hasPrint,
        notes:            t.notes ?? null,
        shelvedAt:        t.status === "SHELVED" ? new Date() : null,
        sortOrder:        i + 1,
      },
    });
    todayStoryRecords.push(story);

    if (!t.unassigned) {
      const reporter = pick(reporters, i);
      const editor   = pick(editors,   i);
      await prisma.storyAssignment.createMany({
        data: [
          { storyId: story.id, personId: reporter.id, role: "REPORTER" },
          { storyId: story.id, personId: editor.id,   role: "EDITOR"   },
        ],
      });
    }

    // Sam (managing editor) on key today stories
    if ([0, 3, 9, 14].includes(i)) {
      await prisma.storyAssignment.create({ data: { storyId: story.id, personId: sam.id, role: "EDITOR" } });
    }
    // Jamie (news director) on today stories they're overseeing
    if ([4, 5].includes(i)) {
      await prisma.storyAssignment.create({ data: { storyId: story.id, personId: jamie.id, role: "EDITOR" } });
    }

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
    // Jamie oversees FIRE STATION TOUR (index 2, enterprise video)
    if (i === 2) {
      await prisma.videoAssignment.create({ data: { videoId: video.id, personId: jamie.id, role: "EDITOR" } });
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
        printPubDate:     nextEnterpriseEdition(d(t.offsetDays, 9)),
        printPubDateTBD:  false,
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

    // Jamie (news director) overseeing select enterprise pieces
    if ([0, 5, 10].includes(i)) {
      await prisma.storyAssignment.create({ data: { storyId: story.id, personId: jamie.id, role: "EDITOR" } });
    }

    // Enterprise pieces get graphics
    if (i % 2 === 0) {
      await prisma.visual.create({ data: { storyId: story.id, type: "GRAPHIC", description: "Enterprise graphic", personId: elena.id } });
    }
  }

  // ─── Teams ──────────────────────────────────────────────────────────────

  const metroTeam = await prisma.team.create({
    data: {
      name: "Metro",
      description: "City government, public safety, and local news",
    },
  });

  const enterpriseTeam = await prisma.team.create({
    data: {
      name: "Investigations",
      description: "Long-form enterprise and accountability reporting",
    },
  });

  const videoTeam = await prisma.team.create({
    data: {
      name: "Video",
      description: "Video production and multimedia",
    },
  });

  // Metro team: Sam (editor), Alice + Carol (reporters), David (photographer)
  await prisma.teamMember.createMany({
    data: [
      { teamId: metroTeam.id, personId: sam.id, role: "EDITOR" },
      { teamId: metroTeam.id, personId: bob.id, role: "EDITOR" },
      { teamId: metroTeam.id, personId: alice.id, role: "MEMBER" },
      { teamId: metroTeam.id, personId: carol.id, role: "MEMBER" },
      { teamId: metroTeam.id, personId: david.id, role: "MEMBER" },
    ],
  });

  // Investigations: Jamie (editor), Alice + Carol (reporters), Elena (graphics)
  await prisma.teamMember.createMany({
    data: [
      { teamId: enterpriseTeam.id, personId: jamie.id, role: "EDITOR" },
      { teamId: enterpriseTeam.id, personId: frank.id, role: "EDITOR" },
      { teamId: enterpriseTeam.id, personId: alice.id, role: "MEMBER" },
      { teamId: enterpriseTeam.id, personId: carol.id, role: "MEMBER" },
      { teamId: enterpriseTeam.id, personId: elena.id, role: "MEMBER" },
    ],
  });

  // Video team: Jamie (editor), Maya (videographer)
  await prisma.teamMember.createMany({
    data: [
      { teamId: videoTeam.id, personId: jamie.id, role: "EDITOR" },
      { teamId: videoTeam.id, personId: maya.id, role: "MEMBER" },
    ],
  });

  // ─── Admin user ───────────────────────────────────────────────────────────

  const adminHash = await bcrypt.hash("newsbudget2026", 12);
  await prisma.user.create({
    data: { email: "admin@newsroom.com",    name: "Sam Okafor",   passwordHash: adminHash, appRole: "ADMIN", personId: sam.id   },
  });
  await prisma.user.create({
    data: { email: "director@newsroom.com", name: "Jamie Rivera", passwordHash: adminHash, appRole: "ADMIN", personId: jamie.id },
  });
  const staffHash = await bcrypt.hash("newsbudget2026", 12);
  await prisma.user.create({
    data: { email: "mp@newsroom.com",           name: "Managing Producer", passwordHash: staffHash, appRole: "MANAGING_PRODUCER" },
  });
  await prisma.user.create({
    data: { email: "supervisor@newsroom.com",   name: "Supervisor",        passwordHash: staffHash, appRole: "SUPERVISOR" },
  });
  await prisma.user.create({
    data: { email: "reporter@newsroom.com",     name: "Reporter",          passwordHash: staffHash, appRole: "PRODUCER" },
  });
  await prisma.user.create({
    data: { email: "videographer@newsroom.com", name: "Videographer",      passwordHash: staffHash, appRole: "PRODUCER" },
  });
  await prisma.user.create({
    data: { email: "photographer@newsroom.com", name: "Photographer",      passwordHash: staffHash, appRole: "PRODUCER" },
  });
  await prisma.user.create({
    data: { email: "designer@newsroom.com",     name: "Designer",          passwordHash: staffHash, appRole: "PRODUCER" },
  });
  await prisma.user.create({
    data: { email: "social@newsroom.com",       name: "Social",            passwordHash: staffHash, appRole: "PRODUCER" },
  });

  const totalStories  = pastStories.length + todayStoryRecords.length + enterpriseRecords.length;
  const totalVideos   = pastVideos.length  + todayVideoRecords.length;

  console.log(
    `Seed complete: 9 users (2 leadership, 1 managing producer, 1 supervisor, 5 producer), 9 people (2 linked to admin accounts),\n` +
    `  ${pastStories.length} past stories (14 days × 10/day)\n` +
    `  ${todayStoryRecords.length} today stories (mixed statuses)\n` +
    `  ${enterpriseRecords.length} enterprise stories (next 180 days)\n` +
    `  ${totalStories} stories total\n` +
    `  ${pastVideos.length} past videos + ${todayVideoRecords.length} today videos = ${totalVideos} videos total\n` +
    `  3 teams (Metro, Investigations, Video)`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
