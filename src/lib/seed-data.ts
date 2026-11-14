import type {
  ActionItem,
  Conversation,
  ConversationMemoryRef,
  ConversationMessage,
  ConversationSummaryRecord,
  DailySummary,
  Goal,
  Insight,
  Memory,
  MemoryRelationship,
  Recording,
  Transcript,
} from "./types";
import { isoAt } from "./util";

const USER = "demo-user";
const D = (date: string, time: string) => isoAt(date, time);

interface SeedMem {
  id: string;
  date: string;
  time: string;
  category: Memory["category"];
  title: string;
  summary: string;
  transcript: string;
  topics: string[];
  people?: string[];
  entities?: string[];
  tone?: string | null;
  goals?: string[];
  commitments?: string[];
  problems?: string[];
  decisions?: string[];
  followUps?: string[];
  confidence?: number;
}

const M = (m: SeedMem): Memory => ({
  id: m.id,
  userId: USER,
  sessionId: null,
  createdAt: D(m.date, m.time),
  date: m.date,
  time: m.time,
  category: m.category,
  title: m.title,
  summary: m.summary,
  transcript: m.transcript,
  topics: m.topics,
  people: m.people || [],
  entities: m.entities || [],
  tone: m.tone ?? null,
  goals: m.goals || [],
  commitments: m.commitments || [],
  problems: m.problems || [],
  decisions: m.decisions || [],
  followUps: m.followUps || [],
  confidence: m.confidence ?? 0.86,
  source: "seed",
  transcriptProvider: "seed",
  isDemo: true,
  extractionStatus: "analyzed" as const,
  extractionError: null,
});

export const SEED_DATES = {
  d9: "2026-11-09",
  d10: "2026-11-10",
  d11: "2026-11-11",
  d12: "2026-11-12",
  d13: "2026-11-13",
  d14: "2026-11-14",
};

const memories: Memory[] = [
  M({
    id: "dm-1109-1",
    date: SEED_DATES.d9,
    time: "07:40",
    category: "memory",
    title: "Morning run with Jordan",
    summary:
      "Ran 5K with Jordan before work. Talked about signing up for a real race to keep the training honest.",
    transcript:
      "Just got back from a 5K run with Jordan. It felt good, easy pace. We talked about how we keep saying we'll run but never sign up for anything. Jordan thinks we should register for a real race so it actually happens. I told him I'd look up the community 10K in December.",
    topics: ["running", "fitness"],
    people: ["Jordan"],
    tone: "positive",
    followUps: ["Look up the community 10K in December"],
  }),
  M({
    id: "dm-1109-2",
    date: SEED_DATES.d9,
    time: "09:15",
    category: "goal",
    title: "Run a 10K by end of December",
    summary:
      "Set a concrete goal after the morning run: run the community 10K in December. Registering this week is the first commitment.",
    transcript:
      "Okay, committing out loud: I want to run the community 10K in December. That means registering this week and keeping three runs a week. If I sign up, I won't back out.",
    topics: ["running", "fitness"],
    commitments: ["Register for the community 10K this week"],
    goals: ["Run a 10K in December"],
    followUps: ["Register for the community 10K"],
  }),
  M({
    id: "dm-1109-3",
    date: SEED_DATES.d9,
    time: "11:30",
    category: "learning",
    title: "Started the dynamic programming module",
    summary:
      "Began the DP section of the interview course. The recurrences still don't click — base cases feel arbitrary.",
    transcript:
      "Started the dynamic programming module today. I read the intro and watched two videos but the recurrences still don't click. I keep not understanding how people come up with the base cases. It feels like magic. I need more worked examples before I try problems myself.",
    topics: ["dynamic programming", "data structures", "interview prep"],
    problems: ["Dynamic programming recurrences still don't click"],
  }),
  M({
    id: "dm-1109-4",
    date: SEED_DATES.d9,
    time: "14:00",
    category: "memory",
    title: "Sprint planning with Sam",
    summary:
      "Sam outlined the sprint for Northwind Labs. I own the notifications module and need a plan drafted by Wednesday.",
    transcript:
      "Had sprint planning with Sam at Northwind. He outlined the sprint and I'm owning the notifications module. He wants a draft plan for the module by Wednesday. It's the biggest chunk of work I've owned so far, which is a little scary but good.",
    topics: ["work", "notifications"],
    people: ["Sam"],
    entities: ["Northwind Labs", "notifications module"],
    commitments: ["Draft the notifications module plan by Wednesday"],
  }),
  M({
    id: "dm-1109-5",
    date: SEED_DATES.d9,
    time: "21:30",
    category: "problem",
    title: "Stayed up scrolling past midnight again",
    summary:
      "Ended up doomscrolling after work and stayed up past midnight. This is the second late night in a row.",
    transcript:
      "I did it again. Started scrolling after work around nine and suddenly it was past midnight. This is the second night in a row I've stayed up way too late. I feel tired and a bit annoyed at myself. The phone is eating my evenings.",
    topics: ["sleep", "habits"],
    tone: "negative",
    problems: ["Staying up past midnight scrolling"],
  }),
  M({
    id: "dm-1109-6",
    date: SEED_DATES.d9,
    time: "22:15",
    category: "problem",
    title: "Kept putting off job applications",
    summary:
      "Avoided the job applications for the third day in a row. The blank page and fear of rejection make me procrastinate.",
    transcript:
      "I meant to work on job applications tonight and I avoided it again. Third day in a row now. Every time I open the page I feel this low anxiety, like the blank resume is judging me. I keep finding other things to do instead. I know I'm procrastinating and I still do it.",
    topics: ["job applications", "career"],
    tone: "negative",
    problems: ["Avoiding job applications three days in a row"],
  }),
  M({
    id: "dm-1109-7",
    date: SEED_DATES.d9,
    time: "16:45",
    category: "memory",
    title: "Career chat with Nina",
    summary:
      "Nina is also interviewing for new roles. We agreed to be accountability partners for prep and applications.",
    transcript:
      "Grabbed coffee with Nina and found out she's interviewing for new roles too. We agreed to be accountability partners for interview prep and applications. She said naming it out loud makes it harder to skip. Maybe that's what I need.",
    topics: ["career", "interview prep"],
    people: ["Nina"],
    tone: "positive",
  }),

  M({
    id: "dm-1110-1",
    date: SEED_DATES.d10,
    time: "08:05",
    category: "memory",
    title: "Run with Jordan — talked Pulse onboarding",
    summary:
      "Second run of the week. Jordan uses a habit app with a clunky onboarding, which sparked a conversation about Pulse's first-run experience.",
    transcript:
      "Ran with Jordan again this morning. He was complaining about the onboarding in the habit app he uses, so many screens before you can do anything. It made me think Pulse should let you log a habit in under ten seconds on first open. I should ask Maya to sketch a simpler onboarding flow.",
    topics: ["running", "pulse", "onboarding"],
    people: ["Jordan"],
    entities: ["Pulse"],
    followUps: ["Ask Maya to sketch a simpler onboarding flow"],
  }),
  M({
    id: "dm-1110-2",
    date: SEED_DATES.d10,
    time: "10:30",
    category: "problem",
    title: "Pulse feature list is overwhelming",
    summary:
      "Wrote down fourteen possible features for Pulse and immediately felt paralyzed. Can't tell what actually matters.",
    transcript:
      "I sat down to work on Pulse and wrote out every feature I could think of. Fourteen of them. Now I'm completely overwhelmed and I don't know where to start. The scope is ballooning and I haven't shipped anything. I think the problem is I'm treating it like a big product instead of a small one.",
    topics: ["pulse", "scope"],
    entities: ["Pulse"],
    tone: "negative",
    problems: ["Pulse feature list too big to start", "Scope creep on Pulse"],
  }),
  M({
    id: "dm-1110-3",
    date: SEED_DATES.d10,
    time: "12:45",
    category: "memory",
    title: "Lunch with Maya — onboarding napkin sketch",
    summary:
      "Maya sketched a three-step onboarding for Pulse on a napkin: name one habit, set a time, done. Much lighter than what I had in mind.",
    transcript:
      "Lunch with Maya. I told her about the Pulse onboarding idea and she grabbed a napkin and sketched a three step flow. Name one habit, pick a time, done. No account creation until later. It's so much lighter than what I had in my head. She said if the first minute feels heavy nobody comes back.",
    topics: ["pulse", "design", "onboarding"],
    people: ["Maya"],
    entities: ["Pulse"],
    tone: "positive",
    followUps: ["Prototype the three-step onboarding"],
  }),
  M({
    id: "dm-1110-4",
    date: SEED_DATES.d10,
    time: "18:20",
    category: "learning",
    title: "DP study — memoization clicked a little",
    summary:
      "Nina and I did a short DP session. Two easy memoization problems solved together. Starting to see the shape of it.",
    transcript:
      "Study session with Nina tonight. We did two easy dynamic programming problems together and for the first time memoization kind of clicked. I still couldn't solve one from scratch but I can follow the logic now. Small progress but it feels different from yesterday.",
    topics: ["dynamic programming", "memoization", "data structures"],
    people: ["Nina"],
    tone: "positive",
  }),
  M({
    id: "dm-1110-5",
    date: SEED_DATES.d10,
    time: "21:00",
    category: "decision",
    title: "Promised myself to finish the resume tonight",
    summary:
      "Decided out loud: tonight is the night the resume gets finished, before bed, no excuses.",
    transcript:
      "Alright. I'm making this a real promise to myself: I will finish the resume tonight before I go to bed. No more pushing it to tomorrow. If I just open the file and fix the experience section, the rest will follow.",
    topics: ["resume", "job applications"],
    tone: "positive",
    commitments: ["Finish the resume tonight"],
    decisions: ["Finish the resume tonight before bed"],
  }),
  M({
    id: "dm-1110-6",
    date: SEED_DATES.d10,
    time: "23:50",
    category: "problem",
    title: "Broke the resume promise — gamed until 2am",
    summary:
      "Never opened the resume. Ended up gaming until 2am. Broke the promise I made two hours earlier.",
    transcript:
      "Well. I did not touch the resume tonight. I told myself I would and then I opened the game 'just for a bit' and it's almost 2am. I broke the promise I made literally two hours ago. I feel guilty and tired. The resume keeps losing to whatever is easier right now.",
    topics: ["resume", "gaming", "sleep"],
    tone: "negative",
    problems: ["Broke promise to finish the resume", "Gaming until 2am"],
  }),
  M({
    id: "dm-1110-7",
    date: SEED_DATES.d10,
    time: "15:30",
    category: "learning",
    title: "Read an article on MVP framing",
    summary:
      "Read a piece about cutting scope: an MVP is the smallest thing that proves the core loop works, not a small version of everything.",
    transcript:
      "Read an article about scope control. The main point was that an MVP isn't a small version of everything, it's the smallest thing that proves the core loop works. For a habit app the core loop is just logging a habit and seeing the streak. Everything else can wait.",
    topics: ["scope", "pulse", "learning"],
  }),

  M({
    id: "dm-1111-1",
    date: SEED_DATES.d11,
    time: "07:30",
    category: "memory",
    title: "Registered for the December 10K",
    summary:
      "Signed up for the community 10K this morning. Money down, so backing out now costs something.",
    transcript:
      "Done. I registered for the community 10K in December this morning. Paid the fee and everything. Now it's real and I can't quietly forget about it. Jordan is signing up too.",
    topics: ["running", "fitness"],
    tone: "positive",
    followUps: ["Keep three runs a week until the race"],
  }),
  M({
    id: "dm-1111-2",
    date: SEED_DATES.d11,
    time: "10:00",
    category: "decision",
    title: "Cut Pulse down to a real MVP",
    summary:
      "Decided the Pulse MVP is only: auth, habit list, streak counter. Social, AI coach, analytics all postponed. Core loop only.",
    transcript:
      "I made the call. Pulse MVP is only three things: sign in, a habit list, and a streak counter. No social features, no AI coach, no analytics dashboard. All of that is postponed until after the core loop works. Yesterday's article plus Maya's napkin sketch made it obvious. I need to ship something small instead of planning something big.",
    topics: ["pulse", "scope"],
    entities: ["Pulse", "Pulse MVP"],
    tone: "positive",
    decisions: ["Ship MVP with only auth, habit list and streaks", "Postpone social, AI coach and analytics features"],
  }),
  M({
    id: "dm-1111-3",
    date: SEED_DATES.d11,
    time: "14:30",
    category: "memory",
    title: "Sprint review with Sam — plan approved",
    summary:
      "Sam approved the notifications module plan and asked for unit tests to come with it by Friday.",
    transcript:
      "Sprint review with Sam went well. He approved my plan for the notifications module and said the quality bar this time is unit tests coming with the code, by Friday. It's the first module I've fully owned end to end.",
    topics: ["work", "testing", "notifications"],
    people: ["Sam"],
    entities: ["Northwind Labs", "notifications module"],
    commitments: ["Add unit tests to the notifications module by Friday"],
    followUps: ["Write unit tests for the notifications module"],
  }),
  M({
    id: "dm-1111-4",
    date: SEED_DATES.d11,
    time: "19:00",
    category: "problem",
    title: "Resume still untouched — fourth day",
    summary:
      "Noticed the avoidance pattern again: the resume has now survived four days of intentions without one edit.",
    transcript:
      "Checking in honestly: the resume is still untouched. That's four days of intending to do it and not doing it. I notice the pattern now — every night something easier wins. It's not that I don't have time, it's that I avoid the feeling of doing it.",
    topics: ["resume", "job applications", "habits"],
    tone: "negative",
    problems: ["Avoiding job applications for the fourth day"],
  }),
  M({
    id: "dm-1111-5",
    date: SEED_DATES.d11,
    time: "21:30",
    category: "idea",
    title: "Streak heatmap idea for Pulse",
    summary:
      "Idea: a GitHub-style heatmap of habit streaks as Pulse's signature visual. Small, motivating, and fits the MVP scope.",
    transcript:
      "Had a fun idea for Pulse while brushing my teeth: a GitHub-style heatmap for habit streaks. One row per habit, one cell per day. It's small enough to fit the MVP and it makes the streak visible, which is the whole point of the app. I should sketch it for Maya.",
    topics: ["pulse", "visualization", "ideas"],
    entities: ["Pulse"],
    tone: "positive",
    followUps: ["Sketch the streak heatmap and email it to Maya"],
  }),
  M({
    id: "dm-1111-6",
    date: SEED_DATES.d11,
    time: "22:30",
    category: "problem",
    title: "Skipped today's run — too tired",
    summary:
      "Skipped the run after work because of low energy. Third run this week did not happen.",
    transcript:
      "Skipped today's run. I was too tired after the sprint review day and just went home instead. That breaks the three runs a week plan for this week unless I make it up tomorrow.",
    topics: ["running", "sleep"],
    tone: "negative",
    problems: ["Skipped today's run"],
  }),

  M({
    id: "dm-1112-1",
    date: SEED_DATES.d12,
    time: "08:30",
    category: "memory",
    title: "Dragged through standup — Sam noticed",
    summary:
      "Slept about five hours and it showed. Sam asked if I was okay during standup. Sleep debt is affecting work now.",
    transcript:
      "Standup was rough today. I slept maybe five hours after last night and Sam actually asked if I was okay, I sounded that flat. Sleep debt is starting to affect my work, not just my evenings. I don't like that.",
    topics: ["sleep", "work"],
    people: ["Sam"],
    tone: "negative",
    problems: ["Sleep debt affecting work"],
  }),
  M({
    id: "dm-1112-2",
    date: SEED_DATES.d12,
    time: "11:00",
    category: "learning",
    title: "Nina suggested spaced repetition for DP",
    summary:
      "Nina recommended spaced repetition with a flashcard deck of DP patterns instead of grinding random problems. Thirty minutes daily.",
    transcript:
      "Nina suggested I stop grinding random dynamic programming problems and switch to spaced repetition instead. Make a flashcard deck of the classic DP patterns and review it thirty minutes every day. She said recognizing the pattern is ninety percent of the battle. It made a lot of sense to me.",
    topics: ["spaced repetition", "dynamic programming", "data structures"],
    people: ["Nina"],
    tone: "positive",
    followUps: ["Set up a spaced repetition deck for DP patterns"],
  }),
  M({
    id: "dm-1112-3",
    date: SEED_DATES.d12,
    time: "12:30",
    category: "habit",
    title: "Adopted a 30-minute daily DP habit",
    summary:
      "Committed to a daily habit: thirty minutes of DP patterns every day, anchored right after lunch.",
    transcript:
      "New rule I'm adopting: thirty minutes of dynamic programming patterns every day, right after lunch so it doesn't depend on motivation in the evening. I want this to become automatic, like brushing teeth. Fifty problems by January is the target.",
    topics: ["habits", "dynamic programming", "data structures"],
    commitments: ["Do 30 minutes of DP patterns every day"],
    goals: ["Solve 50 DP problems by January"],
  }),
  M({
    id: "dm-1112-4",
    date: SEED_DATES.d12,
    time: "13:15",
    category: "problem",
    title: "Pulse auth bug — session drops on refresh",
    summary:
      "Spent two hours on a Pulse bug where the session drops every time the page refreshes. Couldn't isolate it.",
    transcript:
      "Hit an annoying bug in Pulse today. Every time I refresh the page the session drops and kicks me back to login. Spent two hours on it and still can't isolate whether it's the token or the client wrapper. This auth stuff is harder than I expected.",
    topics: ["pulse", "auth", "debugging"],
    entities: ["Pulse"],
    tone: "negative",
    problems: ["Pulse session drops on page refresh"],
  }),
  M({
    id: "dm-1112-5",
    date: SEED_DATES.d12,
    time: "21:45",
    category: "decision",
    title: "New rule: screens off by 11pm",
    summary:
      "Set a hard rule for weekdays: screens off by 11pm. Sleep debt is costing more than the scrolling is worth.",
    transcript:
      "I'm setting a rule from tonight: screens off by eleven pm on weekdays. The sleep debt is now affecting my work and my runs. Late night scrolling is just borrowing energy from tomorrow. Charging the phone outside the bedroom tonight.",
    topics: ["sleep", "habits"],
    tone: "positive",
    commitments: ["Screens off by 11pm on weekdays"],
    decisions: ["Screens off by 11pm on weekdays"],
  }),
  M({
    id: "dm-1112-6",
    date: SEED_DATES.d12,
    time: "23:40",
    category: "problem",
    title: "Broke the 11pm rule on day one",
    summary:
      "Scrolled until 12:40am. The screens-off rule survived about fifty minutes.",
    transcript:
      "The eleven pm rule lasted about fifty minutes. I picked up the phone 'just to check one thing' and it was 12:40 before I knew it. Ugh. Day one and I already broke it. I clearly can't rely on willpower at midnight.",
    topics: ["sleep", "habits"],
    tone: "negative",
    problems: ["Broke the screens-off rule on day one"],
  }),
  M({
    id: "dm-1112-7",
    date: SEED_DATES.d12,
    time: "18:00",
    category: "learning",
    title: "Fixed the Pulse auth bug with a refresh wrapper",
    summary:
      "Learned how to wrap fetch with a token refresh retry. The session-drop bug is fixed and I actually understand the fix.",
    transcript:
      "Cracked it. I learned how to write a wrapper around fetch that retries the request once after refreshing the token. The session drop bug in Pulse is fixed and this time I actually understand why, not just that it works. Auth finally makes a bit more sense to me.",
    topics: ["auth", "debugging", "pulse"],
    entities: ["Pulse"],
    tone: "positive",
  }),

  M({
    id: "dm-1113-1",
    date: SEED_DATES.d13,
    time: "07:15",
    category: "memory",
    title: "Morning run before work — 6K",
    summary:
      "Ran 6K before work, the longest this week. Waking up early felt easier after a better night.",
    transcript:
      "Went for a six K run before work this morning, the longest one this week. It felt comfortable the whole way. Waking up early was much easier after a decent night's sleep. Running before work might actually be the move.",
    topics: ["running", "fitness", "sleep"],
    tone: "positive",
  }),
  M({
    id: "dm-1113-2",
    date: SEED_DATES.d13,
    time: "09:40",
    category: "memory",
    title: "Sent two job applications",
    summary:
      "Broke the five-day avoidance streak and actually sent two applications: one product team, one platform team.",
    transcript:
      "I did it. I sent two job applications this morning before I could talk myself out of it. One to a product team, one to a platform team. After five days of avoiding this it feels surprisingly good. Not as scary as the blank page made it seem.",
    topics: ["job applications", "career"],
    tone: "positive",
    followUps: ["Prepare for possible recruiter replies"],
  }),
  M({
    id: "dm-1113-3",
    date: SEED_DATES.d13,
    time: "11:30",
    category: "learning",
    title: "Spaced repetition session one — 12 cards",
    summary:
      "First DP flashcard session: 12 cards on climbing stairs and house robber patterns. Recognizing the pattern felt good.",
    transcript:
      "First spaced repetition session for dynamic programming. Twelve cards, mostly climbing stairs and house robber type patterns. I could recognize which pattern to use on most of them, which honestly felt good. Nina was right, recognizing is most of it.",
    topics: ["spaced repetition", "dynamic programming", "data structures"],
    tone: "positive",
  }),
  M({
    id: "dm-1113-4",
    date: SEED_DATES.d13,
    time: "15:00",
    category: "memory",
    title: "Design sync with Maya — MVP screens approved",
    summary:
      "Maya approved the three MVP screens for Pulse. She wants the habit list built first so she can react to something real.",
    transcript:
      "Quick design sync with Maya over a call. She approved the three MVP screens: onboarding, habit list, streak view. Her advice was to build the habit list screen first so she can react to something real instead of mocks. She also liked the heatmap sketch I sent.",
    topics: ["pulse", "design", "scope"],
    people: ["Maya"],
    entities: ["Pulse"],
    tone: "positive",
    followUps: ["Build the habit list screen first"],
  }),
  M({
    id: "dm-1113-5",
    date: SEED_DATES.d13,
    time: "16:30",
    category: "memory",
    title: "Unit tests done for notifications module",
    summary:
      "Wrote and passed the unit tests for the notifications module ahead of the Friday deadline. Closed out the commitment to Sam.",
    transcript:
      "Unit tests for the notifications module are written and passing. Done a day early, so Friday's commitment to Sam is handled. First time I've shipped tests alongside a feature instead of after, and it caught two edge cases already.",
    topics: ["work", "testing"],
    tone: "positive",
  }),
  M({
    id: "dm-1113-6",
    date: SEED_DATES.d13,
    time: "22:50",
    category: "memory",
    title: "In bed at 11:15 — close to target",
    summary:
      "Went to bed at 11:15, fifteen minutes past the rule but a huge improvement from 2am.",
    transcript:
      "It's 11:15 and I'm already in bed. Technically fifteen minutes past my screens off rule, but coming from 2am nights this feels like a win. Phone is charging in the kitchen. Tomorrow I'll try to actually hit eleven.",
    topics: ["sleep", "habits"],
    tone: "positive",
  }),
  M({
    id: "dm-1113-7",
    date: SEED_DATES.d13,
    time: "13:10",
    category: "learning",
    title: "Second flashcard session — 18 cards",
    summary:
      "Second spaced repetition session right after lunch as planned. Eighteen cards including knapsack-lite patterns.",
    transcript:
      "Second flashcard session, right after lunch like I planned. Eighteen cards this time, added a few knapsack lite patterns. Doing it right after lunch is much easier than trying in the evening. The habit anchor seems to work.",
    topics: ["spaced repetition", "dynamic programming", "habits"],
    tone: "positive",
  }),

  M({
    id: "dm-1114-1",
    date: SEED_DATES.d14,
    time: "08:00",
    category: "memory",
    title: "Long run — 8K with Jordan",
    summary:
      "Longest run ever this morning: 8K with Jordan at a comfortable pace. The 10K in December suddenly looks doable.",
    transcript:
      "Eight K with Jordan this morning, the longest run I've ever done. Comfortable pace the whole way and we chatted for most of it. The 10K in December honestly feels doable now. Two weeks ago five K felt like a lot.",
    topics: ["running", "fitness"],
    people: ["Jordan"],
    tone: "positive",
  }),
  M({
    id: "dm-1114-2",
    date: SEED_DATES.d14,
    time: "10:20",
    category: "memory",
    title: "Pulse MVP progress — habit list works",
    summary:
      "Built the habit list screen end to end this morning: add a habit, see it listed, streak counted. First real feature shipped.",
    transcript:
      "Spent the morning on Pulse and the habit list screen works end to end now. You can add a habit, see it in the list, and the streak counter updates. First real feature of the MVP. Cutting scope was the right call, this took a morning instead of a month.",
    topics: ["pulse", "scope"],
    entities: ["Pulse", "Pulse MVP"],
    tone: "positive",
  }),
  M({
    id: "dm-1114-3",
    date: SEED_DATES.d14,
    time: "12:30",
    category: "learning",
    title: "Solved house robber unaided",
    summary:
      "Third flashcard session, then solved a house robber variant without help. First DP problem solved fully alone.",
    transcript:
      "Flashcard session number three, and then something nice happened: I solved a house robber variant completely unaided. First dynamic programming problem I've solved from scratch. Two weeks ago I didn't understand base cases at all. The daily habit is working.",
    topics: ["dynamic programming", "data structures", "spaced repetition"],
    tone: "positive",
  }),
  M({
    id: "dm-1114-4",
    date: SEED_DATES.d14,
    time: "14:00",
    category: "idea",
    title: "Voice journaling inside Pulse",
    summary:
      "Idea: let Pulse users log a habit check-in by voice, like a tiny daily journal entry. Voice feels easier than typing at night.",
    transcript:
      "New idea for Pulse while thinking about my own week: let people log habit check-ins by voice, like a tiny daily journal. Typing at night is annoying, but talking is easy. It also connects to how much I got out of just speaking my thoughts today. Could be the thing that makes Pulse different.",
    topics: ["pulse", "ideas", "reflection"],
    entities: ["Pulse"],
    tone: "positive",
  }),
  M({
    id: "dm-1114-5",
    date: SEED_DATES.d14,
    time: "17:30",
    category: "memory",
    title: "Planned Monday's checkpoints with Sam",
    summary:
      "Agreed with Sam over chat on Monday's sprint checkpoints. I need to send him my notes by Sunday evening.",
    transcript:
      "Chatted with Sam about Monday. We agreed on the sprint checkpoints for the notifications module and I said I'd send him my notes by Sunday evening so he can look at them before standup.",
    topics: ["work", "notifications"],
    people: ["Sam"],
    commitments: ["Send Sam the sprint checkpoint notes by Sunday evening"],
    followUps: ["Send Sam the sprint checkpoint notes by Sunday evening"],
  }),
  M({
    id: "dm-1114-6",
    date: SEED_DATES.d14,
    time: "20:00",
    category: "memory",
    title: "Evening reflection — energy is back",
    summary:
      "Reflecting on the day: slept properly, ran 8K, shipped a feature, solved a DP problem alone. Sleep was the keystone.",
    transcript:
      "Sitting with how today felt: genuinely good. Slept properly, ran eight K, shipped the habit list, solved a DP problem on my own. Looking back at the week the biggest difference is sleep. When I sleep, everything else follows. When I don't, everything decays. That's the pattern I want to remember.",
    topics: ["reflection", "sleep", "running"],
    tone: "positive",
  }),
];

const relationshipSpec: [string, string, MemoryRelationship["kind"], string[]][] = [
  ["dm-1109-1", "dm-1109-2", "related_to", []],
  ["dm-1109-7", "dm-1109-6", "related_to", []],
  ["dm-1110-6", "dm-1110-5", "contradicts", []],
  ["dm-1111-2", "dm-1110-2", "caused_by", []],
  ["dm-1111-2", "dm-1110-7", "supports", []],
  ["dm-1111-4", "dm-1110-5", "contradicts", []],
  ["dm-1112-1", "dm-1112-6", "caused_by", []],
  ["dm-1112-7", "dm-1112-4", "supports", []],
  ["dm-1112-6", "dm-1112-5", "contradicts", []],
  ["dm-1113-2", "dm-1111-4", "followed_by", []],
  ["dm-1113-2", "dm-1110-5", "supports", []],
  ["dm-1113-3", "dm-1112-2", "followed_by", []],
  ["dm-1113-7", "dm-1112-3", "followed_by", []],
  ["dm-1114-3", "dm-1113-3", "followed_by", []],
  ["dm-1113-1", "dm-1111-6", "followed_by", []],
  ["dm-1111-1", "dm-1109-2", "supports", []],
  ["dm-1114-1", "dm-1109-2", "supports", []],
  ["dm-1113-4", "dm-1111-2", "supports", []],
  ["dm-1114-2", "dm-1113-4", "followed_by", []],
  ["dm-1113-6", "dm-1112-5", "supports", []],
  ["dm-1114-6", "dm-1113-6", "followed_by", []],
  ["dm-1114-2", "dm-1111-2", "supports", []],
  ["dm-1113-5", "dm-1111-3", "supports", []],
  ["dm-1111-5", "dm-1113-4", "related_to", []],
];

const relationships: MemoryRelationship[] = relationshipSpec.map(([fromId, toId, kind, shared], i) => ({
  id: `dm-rel-${i + 1}`,
  userId: USER,
  fromId,
  toId,
  kind,
  sharedTopics: shared,
  createdAt: D("2026-11-14", "12:00"),
}));

const recordings: Recording[] = [
  { id: "rec-d9", userId: USER, startedAt: D(SEED_DATES.d9, "21:15"), durationSec: 680, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d9" },
  { id: "rec-d10", userId: USER, startedAt: D(SEED_DATES.d10, "21:40"), durationSec: 465, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d10" },
  { id: "rec-d11", userId: USER, startedAt: D(SEED_DATES.d11, "21:20"), durationSec: 550, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d11" },
  { id: "rec-d12", userId: USER, startedAt: D(SEED_DATES.d12, "20:50"), durationSec: 390, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d12" },
  { id: "rec-d13", userId: USER, startedAt: D(SEED_DATES.d13, "21:00"), durationSec: 725, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d13" },
  { id: "rec-d14", userId: USER, startedAt: D(SEED_DATES.d14, "19:40"), durationSec: 520, mimeType: null, sizeBytes: null, status: "saved", transcriptId: "tr-d14" },
];

const dayTranscripts: Record<string, string> = {
  "rec-d9": memories.filter((m) => m.date === SEED_DATES.d9).map((m) => m.transcript).join(" "),
  "rec-d10": memories.filter((m) => m.date === SEED_DATES.d10).map((m) => m.transcript).join(" "),
  "rec-d11": memories.filter((m) => m.date === SEED_DATES.d11).map((m) => m.transcript).join(" "),
  "rec-d12": memories.filter((m) => m.date === SEED_DATES.d12).map((m) => m.transcript).join(" "),
  "rec-d13": memories.filter((m) => m.date === SEED_DATES.d13).map((m) => m.transcript).join(" "),
  "rec-d14": memories.filter((m) => m.date === SEED_DATES.d14).map((m) => m.transcript).join(" "),
};

const transcripts: Transcript[] = recordings.map((r) => ({
  id: r.transcriptId!,
  userId: USER,
  recordingId: r.id,
  text: dayTranscripts[r.id],
  provider: "seed",
  createdAt: r.startedAt,
}));

const memoriesWithSession = memories.map((m) => {
  const rec = recordings.find((r) => r.startedAt.slice(0, 10) === m.date);
  return { ...m, sessionId: rec ? rec.id : null };
});

const actionItems: Omit<ActionItem, "isDemo">[] = [
  {
    id: "act-1",
    userId: USER,
    memoryId: "dm-1110-5",
    title: "Finish the resume",
    detail: "From your promise on Nov 10 — still waiting.",
    dueDate: "2026-11-10",
    status: "open",
    source: "memory",
    createdAt: D("2026-11-10", "21:05"),
    completedAt: null,
  },
  {
    id: "act-2",
    userId: USER,
    memoryId: "dm-1109-2",
    title: "Register for the community 10K",
    detail: null,
    dueDate: "2026-11-11",
    status: "done",
    source: "memory",
    createdAt: D("2026-11-09", "09:20"),
    completedAt: D("2026-11-11", "07:32"),
  },
  {
    id: "act-3",
    userId: USER,
    memoryId: "dm-1111-3",
    title: "Write unit tests for notifications module",
    detail: null,
    dueDate: "2026-11-13",
    status: "done",
    source: "memory",
    createdAt: D("2026-11-11", "14:35"),
    completedAt: D("2026-11-13", "16:35"),
  },
  {
    id: "act-4",
    userId: USER,
    memoryId: "dm-1112-2",
    title: "Set up spaced repetition deck for DP",
    detail: "Nina's suggestion — flashcards of classic DP patterns.",
    dueDate: "2026-11-13",
    status: "open",
    source: "memory",
    createdAt: D("2026-11-12", "11:05"),
    completedAt: null,
  },
  {
    id: "act-5",
    userId: USER,
    memoryId: "dm-1111-5",
    title: "Email Maya the streak heatmap sketch",
    detail: null,
    dueDate: "2026-11-12",
    status: "open",
    source: "memory",
    createdAt: D("2026-11-11", "21:35"),
    completedAt: null,
  },
  {
    id: "act-6",
    userId: USER,
    memoryId: "dm-1110-3",
    title: "Prototype the 3-step onboarding",
    detail: "Maya's napkin sketch: name one habit, set a time, done.",
    dueDate: "2026-11-16",
    status: "open",
    source: "memory",
    createdAt: D("2026-11-10", "12:50"),
    completedAt: null,
  },
  {
    id: "act-7",
    userId: USER,
    memoryId: "dm-1114-5",
    title: "Send Sam the sprint checkpoint notes",
    detail: null,
    dueDate: "2026-11-15",
    status: "open",
    source: "memory",
    createdAt: D("2026-11-14", "17:35"),
    completedAt: null,
  },
  {
    id: "act-8",
    userId: USER,
    memoryId: "dm-1111-2",
    title: "Draft the Pulse MVP launch checklist",
    detail: "Suggested from your MVP decision — define what done looks like.",
    dueDate: "2026-11-18",
    status: "suggested",
    source: "ai",
    createdAt: D("2026-11-12", "09:00"),
    completedAt: null,
  },
  {
    id: "act-9",
    userId: USER,
    memoryId: "dm-1112-3",
    title: "Block a daily 30-minute DP slot on your calendar",
    detail: "Suggested to protect the habit you committed to.",
    dueDate: null,
    status: "suggested",
    source: "ai",
    createdAt: D("2026-11-12", "09:00"),
    completedAt: null,
  },
];

const goals: Omit<Goal, "isDemo">[] = [
  { id: "goal-1", userId: USER, title: "Run the community 10K in December", status: "active", sourceMemoryId: "dm-1109-2", createdAt: D(SEED_DATES.d9, "09:15") },
  { id: "goal-2", userId: USER, title: "Ship the Pulse MVP by end of November", status: "active", sourceMemoryId: "dm-1111-2", createdAt: D(SEED_DATES.d11, "10:00") },
  { id: "goal-3", userId: USER, title: "Sleep before 11pm on weekdays", status: "active", sourceMemoryId: "dm-1112-5", createdAt: D(SEED_DATES.d12, "21:45") },
  { id: "goal-4", userId: USER, title: "Solve 50 DP problems by January", status: "active", sourceMemoryId: "dm-1112-3", createdAt: D(SEED_DATES.d12, "12:30") },
  { id: "goal-5", userId: USER, title: "Apply to five roles by end of November", status: "active", sourceMemoryId: "dm-1110-5", createdAt: D(SEED_DATES.d10, "21:00") },
];

const dailySummaries: Omit<DailySummary, "isDemo">[] = [
  { id: "sum-2026-11-09", userId: USER, date: SEED_DATES.d9, summary: "First day of intentional capture. Set the 10K goal with Jordan, started DP and got lost in it, avoided the resume for the third day, stayed up past midnight. Learning score 42/100.", learningScore: 42, metrics: { memories: 7, learning: 1, decisions: 0, problems: 2, captureMin: 11 }, createdAt: D(SEED_DATES.d9, "23:59") },
  { id: "sum-2026-11-10", userId: USER, date: SEED_DATES.d10, summary: "Pulse scope felt overwhelming until Maya's napkin sketch. DP memoization started to click. Promised to finish the resume, then gamed until 2am instead. Learning score 48/100.", learningScore: 48, metrics: { memories: 7, learning: 2, decisions: 1, problems: 2, captureMin: 8 }, createdAt: D(SEED_DATES.d10, "23:59") },
  { id: "sum-2026-11-11", userId: USER, date: SEED_DATES.d11, summary: "Registered for the 10K. Made the MVP decision and cut Pulse to three screens. Resume avoidance hit day four. Skipped the run, low energy. Learning score 55/100.", learningScore: 55, metrics: { memories: 6, learning: 0, decisions: 1, problems: 2, captureMin: 9 }, createdAt: D(SEED_DATES.d11, "23:59") },
  { id: "sum-2026-11-12", userId: USER, date: SEED_DATES.d12, summary: "Sleep debt showed up at work. Adopted spaced repetition on Nina's advice and the daily DP habit. Fixed the Pulse auth bug. Broke the 11pm rule on day one. Learning score 50/100.", learningScore: 50, metrics: { memories: 7, learning: 2, decisions: 1, problems: 3, captureMin: 7 }, createdAt: D(SEED_DATES.d12, "23:59") },
  { id: "sum-2026-11-13", userId: USER, date: SEED_DATES.d13, summary: "Breakthrough day: sent two job applications after five days of avoidance, ran 6K, did two flashcard sessions, shipped unit tests early, nearly hit the 11pm target. Learning score 72/100.", learningScore: 72, metrics: { memories: 7, learning: 2, decisions: 0, problems: 0, captureMin: 12 }, createdAt: D(SEED_DATES.d13, "23:59") },
  { id: "sum-2026-11-14", userId: USER, date: SEED_DATES.d14, summary: "Strong close to the week: 8K long run, habit list shipped, first DP problem solved unaided, good energy all day. Sleep is the keystone habit. Learning score 78/100.", learningScore: 78, metrics: { memories: 6, learning: 1, decisions: 0, problems: 0, captureMin: 9 }, createdAt: D(SEED_DATES.d14, "23:59") },
];

const insights: Omit<Insight, "isDemo">[] = [
  {
    id: "ins-seed-1",
    userId: USER,
    kind: "weekly",
    date: "2026-11-12",
    title: "Weekly reflection — avoidance has a shape",
    body:
      "This week's data shows one clear pattern: when something feels judgmental (the blank resume), I swap it for something easy (gaming, scrolling) and the cost shows up two days later as tiredness. The 10K goal is progressing well because it has a date and money attached. The resume has neither. Sleep went from bad to worse to a rule that got broken on day one — but the rule existing is still new.",
    evidenceIds: ["dm-1109-6", "dm-1110-5", "dm-1110-6", "dm-1111-4", "dm-1112-5", "dm-1112-6"],
    metrics: { avoidDays: 4, lateNights: 3, runsPerWeek: 3 },
    createdAt: D("2026-11-12", "22:00"),
  },
  {
    id: "ins-seed-2",
    userId: USER,
    kind: "daily",
    date: "2026-11-13",
    title: "Daily reflection — the wall was smaller than it looked",
    body:
      "Five days of avoidance ended in twenty minutes this morning: two applications sent. The difference was doing it before opening anything else. Running before work worked well. The flashcard habit anchored after lunch survived twice. Nearly hit the 11pm target.",
    evidenceIds: ["dm-1113-2", "dm-1113-1", "dm-1113-3", "dm-1113-6"],
    metrics: { applications: 2, flashcardSessions: 2, bedtime: "23:15" },
    createdAt: D("2026-11-13", "22:30"),
  },
];

export interface SeedBundle {
  memories: Memory[];
  relationships: MemoryRelationship[];
  recordings: Recording[];
  transcripts: Transcript[];
  actionItems: ActionItem[];
  goals: Goal[];
  dailySummaries: DailySummary[];
  insights: Insight[];
  conversations?: Conversation[];
  conversationMessages?: ConversationMessage[];
  conversationSummaries?: ConversationSummaryRecord[];
  conversationMemoryRefs?: ConversationMemoryRef[];
}

function demoConversation(): {
  conversations: Conversation[];
  conversationMessages: ConversationMessage[];
  conversationSummaries: ConversationSummaryRecord[];
  conversationMemoryRefs: ConversationMemoryRef[];
} {
  const convId = "dc-seed-1";
  const base = D("2026-11-14", "08:30");
  const t = (offset: number) => new Date(new Date(base).getTime() + offset * 60000).toISOString();
  const conversation: Conversation = {
    id: convId,
    userId: USER,
    title: "Sample: progress check on my week",
    createdAt: base,
    updatedAt: t(4),
    summary:
      "Sample demo conversation: reviewed the user's week — running improved (3 runs), the resume avoidance cycle broke on Nov 13, and sleep remains the weak spot. Cited demo memories only.",
    isDemo: true,
  };
  const messages: ConversationMessage[] = [
    {
      id: "dcm-1",
      userId: USER,
      conversationId: convId,
      role: "user",
      content: "How did my week go overall?",
      citations: [],
      proposedActions: [],
      createdAt: t(0),
    },
    {
      id: "dcm-2",
      userId: USER,
      conversationId: convId,
      role: "assistant",
      content:
        "Solid week with one clear win and one sore spot.\n\nThe win: the resume avoidance cycle broke. You had put off applications four days straight [1], gamed until 2am instead of finishing it [2], and then sent two applications on Nov 13 morning [3]. That's the wall-looking-smaller pattern.\n\nAlso going well: three runs this week, including a 6K before work on Nov 13 [4], after registering for the December 10K earlier in the week.\n\nThe sore spot: sleep. You set a screens-off-by-11pm rule and broke it on day one [5].\n\nThis is sample demo data from a fictional journal (Alex's week, Nov 9–14) — not your real history.",
      citations: [
        { memoryId: "dm-1109-6", title: "Kept putting off job applications", date: "2026-11-09", time: "22:10" },
        { memoryId: "dm-1110-6", title: "Broke the resume promise — gamed until 2am", date: "2026-11-10", time: "23:55" },
        { memoryId: "dm-1113-2", title: "Sent two job applications", date: "2026-11-13", time: "09:05" },
        { memoryId: "dm-1113-1", title: "Morning run before work — 6K", date: "2026-11-13", time: "06:40" },
        { memoryId: "dm-1112-6", title: "Broke the 11pm rule on day one", date: "2026-11-12", time: "23:40" },
      ],
      proposedActions: [],
      createdAt: t(2),
    },
    {
      id: "dcm-3",
      userId: USER,
      conversationId: convId,
      role: "user",
      content: "What should I keep doing next week?",
      citations: [],
      proposedActions: [],
      createdAt: t(3),
    },
    {
      id: "dcm-4",
      userId: USER,
      conversationId: convId,
      role: "assistant",
      content:
        "From the sample week's evidence, two things worked and are worth keeping:\n\n1. Morning slots beat evening willpower — the 6K run before work [1] and the applications sent before opening anything else [2] both happened because nothing else got there first.\n\n2. Anchoring small habits to existing routines — the spaced-repetition flashcards after lunch survived twice [3].\n\nAnd one thing to fix: the 11pm screens-off rule needs a trigger, not willpower [4].\n\n(Sample demo conversation — the citations point to the fictional demo journal.)",
      citations: [
        { memoryId: "dm-1113-1", title: "Morning run before work — 6K", date: "2026-11-13", time: "06:40" },
        { memoryId: "dm-1113-2", title: "Sent two job applications", date: "2026-11-13", time: "09:05" },
        { memoryId: "dm-1113-3", title: "Spaced repetition session one — 12 cards", date: "2026-11-13", time: "13:10" },
        { memoryId: "dm-1112-6", title: "Broke the 11pm rule on day one", date: "2026-11-12", time: "23:40" },
      ],
      proposedActions: [],
      createdAt: t(4),
    },
  ];
  const summaries: ConversationSummaryRecord[] = [
    {
      id: "dcs-1",
      userId: USER,
      conversationId: convId,
      summary:
        "Sample demo conversation (fictional journal): weekly progress review. Win — resume avoidance broke Nov 13 (2 applications sent). Progress — 3 runs incl. 6K. Weak spot — sleep rule broken on day one. Advice: keep morning slots and habit anchoring.",
      createdAt: t(5),
    },
  ];
  const refs: ConversationMemoryRef[] = [
    ...new Map(
      [...messages[1].citations, ...messages[3].citations].map((c) => [c.memoryId, c])
    ).values(),
  ].map((c) => ({
    id: `dmr-${c.memoryId}`,
    userId: USER,
    conversationId: convId,
    memoryId: c.memoryId,
    createdAt: t(5),
  }));
  return {
    conversations: [conversation],
    conversationMessages: messages,
    conversationSummaries: summaries,
    conversationMemoryRefs: refs,
  };
}

export function buildSeedBundle(): SeedBundle {
  const conv = demoConversation();
  return {
    memories: memoriesWithSession,
    relationships,
    recordings,
    transcripts,
    actionItems: actionItems.map((a) => ({ ...a, isDemo: true })),
    goals: goals.map((g) => ({ ...g, isDemo: true })),
    dailySummaries: dailySummaries.map((s) => ({ ...s, isDemo: true })),
    insights: insights.map((i) => ({ ...i, isDemo: true })),
    conversations: conv.conversations,
    conversationMessages: conv.conversationMessages,
    conversationSummaries: conv.conversationSummaries,
    conversationMemoryRefs: conv.conversationMemoryRefs,
  };
}
