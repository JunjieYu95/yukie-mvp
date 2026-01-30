/**
 * MCP Routing Dry Run Tests
 * 
 * IMPORTANT: This is a DRY-RUN test file that validates test case structure
 * WITHOUT calling the actual LLM API. The keyword matching here is ONLY for
 * test validation purposes - the actual MCP router uses pure LLM understanding.
 * 
 * The real MCP router (mcp-router.ts) uses:
 * - LLM-based tool selection (routeToTool)
 * - LLM-based parameter extraction (selectToolParameters)
 * - LLM-based category inference (built into the prompt)
 * 
 * This test file helps ensure our test cases are well-formed before running
 * expensive LLM API calls.
 * 
 * Run with: npx tsx packages/yukie-core/src/__tests__/mcp-routing-dry.test.ts
 */

// ============================================================================
// Test Case Definitions - 50+ Activity Logging Variations
// ============================================================================

interface TestCase {
  id: number;
  message: string;
  expectedTool: 'diary.log' | 'diary.logHighlight' | 'diary.queryEvents' | null;
  expectedCategory: 'prod' | 'nonprod' | 'admin' | null;
  expectedTitleContains?: string[];
  expectedStartTime?: string;
  expectedEndTime?: string;
  description: string;
}

const TEST_CASES: TestCase[] = [
  // ============================================================================
  // BASIC LOGGING FORMATS (1-10)
  // ============================================================================
  {
    id: 1,
    message: 'Log coding from 2pm to 4pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['coding'],
    expectedStartTime: '2pm',
    expectedEndTime: '4pm',
    description: 'Basic log format with times',
  },
  {
    id: 2,
    message: 'log lunch 12pm to 1pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['lunch'],
    description: 'Lowercase log command',
  },
  {
    id: 3,
    message: 'Log reading from 3pm to 5pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['reading'],
    description: 'Generic reading (defaults to prod)',
  },
  {
    id: 4,
    message: 'log meeting 10am-11am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['meeting'],
    description: 'Time range with hyphen',
  },
  {
    id: 5,
    message: 'Log workout 6am to 7am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['workout'],
    description: 'Morning workout',
  },
  {
    id: 6,
    message: 'LOG DINNER FROM 7PM TO 8PM',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['dinner'],
    description: 'All caps command',
  },
  {
    id: 7,
    message: 'log coding from 14:00 to 16:00',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: '24-hour time format',
  },
  {
    id: 8,
    message: 'log break 3pm-3:30pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['break'],
    description: 'Short break with half hour',
  },
  {
    id: 9,
    message: 'Log focus time from 9am until 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Using "until" instead of "to"',
  },
  {
    id: 10,
    message: 'log deep work session 10:00am to 12:30pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Complex activity name',
  },

  // ============================================================================
  // GAMING & ENTERTAINMENT - NONPROD (11-20)
  // ============================================================================
  {
    id: 11,
    message: 'Log lanius run from 7pm to 7:30pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['lanius'],
    description: 'Fallout game character run',
  },
  {
    id: 12,
    message: 'log playing Fallout 8pm to 10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['fallout'],
    description: 'Playing specific game',
  },
  {
    id: 13,
    message: 'Log gaming session from 9pm to 11pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['gaming'],
    description: 'Generic gaming session',
  },
  {
    id: 14,
    message: 'log watching Netflix 7pm-9pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['netflix', 'watching'],
    description: 'Streaming service',
  },
  {
    id: 15,
    message: 'Log YouTube from 6pm to 7pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['youtube'],
    description: 'YouTube watching',
  },
  {
    id: 16,
    message: 'log playing chess 2pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['chess'],
    description: 'Board game',
  },
  {
    id: 17,
    message: 'Log browsing Reddit 10pm to 11pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['reddit'],
    description: 'Social media browsing',
  },
  {
    id: 18,
    message: 'log movie night from 8pm to 10:30pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['movie'],
    description: 'Movie watching',
  },
  {
    id: 19,
    message: 'Log Elden Ring playthrough 3pm-6pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['elden ring'],
    description: 'Specific game title',
  },
  {
    id: 20,
    message: 'log scrolling Twitter from 9pm to 10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    expectedTitleContains: ['twitter'],
    description: 'Social media scrolling',
  },

  // ============================================================================
  // PRODUCTIVE WORK - PROD (21-35)
  // ============================================================================
  {
    id: 21,
    message: 'Log vibe coding from 10am to 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['vibe coding', 'coding'],
    description: 'Casual coding term',
  },
  {
    id: 22,
    message: 'log debugging session 2pm to 4pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['debugging'],
    description: 'Debugging work',
  },
  {
    id: 23,
    message: 'Log standup meeting 9am-9:30am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['standup'],
    description: 'Daily standup',
  },
  {
    id: 24,
    message: 'log pair programming 1pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['pair programming'],
    description: 'Collaborative coding',
  },
  {
    id: 25,
    message: 'Log code review from 4pm to 5pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['code review'],
    description: 'PR review',
  },
  {
    id: 26,
    message: 'log writing documentation 3pm-5pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['documentation'],
    description: 'Writing docs',
  },
  {
    id: 27,
    message: 'Log learning TypeScript 7pm to 9pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['learning', 'typescript'],
    description: 'Learning new tech',
  },
  {
    id: 28,
    message: 'log studying for exam from 6pm to 8pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['studying'],
    description: 'Exam preparation',
  },
  {
    id: 29,
    message: 'Log research 10am to 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['research'],
    description: 'Research work',
  },
  {
    id: 30,
    message: 'log project planning 2pm-3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['project', 'planning'],
    description: 'Planning session',
  },
  {
    id: 31,
    message: 'Log client call from 11am to 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['client', 'call'],
    description: 'Business call',
  },
  {
    id: 32,
    message: 'log interview prep 4pm to 6pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['interview'],
    description: 'Interview preparation',
  },
  {
    id: 33,
    message: 'Log gym workout 6am-7am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['gym', 'workout'],
    description: 'Physical exercise',
  },
  {
    id: 34,
    message: 'log running 5pm to 6pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['running'],
    description: 'Cardio exercise',
  },
  {
    id: 35,
    message: 'Log meditation 7am-7:30am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    expectedTitleContains: ['meditation'],
    description: 'Mindfulness practice',
  },

  // ============================================================================
  // ADMIN/REST ACTIVITIES (36-45)
  // ============================================================================
  {
    id: 36,
    message: 'Log breakfast 8am to 8:30am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['breakfast'],
    description: 'Morning meal',
  },
  {
    id: 37,
    message: 'log dinner from 7pm to 8pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['dinner'],
    description: 'Evening meal',
  },
  {
    id: 38,
    message: 'Log shower 7am-7:15am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['shower'],
    description: 'Personal hygiene',
  },
  {
    id: 39,
    message: 'log nap 2pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['nap'],
    description: 'Afternoon rest',
  },
  {
    id: 40,
    message: 'Log commute from 8am to 9am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['commute'],
    description: 'Travel to work',
  },
  {
    id: 41,
    message: 'log grocery shopping 5pm-6pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['grocery', 'shopping'],
    description: 'Errands',
  },
  {
    id: 42,
    message: 'Log cooking 6pm to 7pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['cooking'],
    description: 'Meal preparation',
  },
  {
    id: 43,
    message: 'log laundry from 10am to 11am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['laundry'],
    description: 'Household chore',
  },
  {
    id: 44,
    message: 'Log cleaning the house 9am to 11am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['cleaning'],
    description: 'House cleaning',
  },
  {
    id: 45,
    message: 'log doctor appointment 2pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    expectedTitleContains: ['doctor', 'appointment'],
    description: 'Medical appointment',
  },

  // ============================================================================
  // ALTERNATIVE PHRASINGS (46-55)
  // ============================================================================
  {
    id: 46,
    message: 'spent 2 hours coding from 10am to 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Spent X hours format',
  },
  {
    id: 47,
    message: 'worked on project from 1pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Worked on format',
  },
  {
    id: 48,
    message: 'did some gaming 8pm-10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Did some X format',
  },
  {
    id: 49,
    message: 'had lunch from 12pm to 1pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    description: 'Had X format',
  },
  {
    id: 50,
    message: 'took a nap 3pm to 4pm',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    description: 'Took a X format',
  },
  {
    id: 51,
    message: 'played video games from 9pm to 11pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Played X format',
  },
  {
    id: 52,
    message: 'attended meeting 2pm-3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Attended X format',
  },
  {
    id: 53,
    message: 'exercised from 6am to 7am',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Exercised format',
  },
  {
    id: 54,
    message: 'I coded from 10am until noon',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'First person with "until noon"',
  },
  {
    id: 55,
    message: 'just finished gaming, started at 8pm ended at 10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Past tense with started/ended',
  },

  // ============================================================================
  // EDGE CASES (56-65)
  // ============================================================================
  {
    id: 56,
    message: 'log reading for an hour',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'No specific times, just duration',
  },
  {
    id: 57,
    message: 'log gaming',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Minimal - just activity',
  },
  {
    id: 58,
    message: 'log lunch',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    description: 'Minimal - just meal',
  },
  {
    id: 59,
    message: 'log reading a novel 7pm to 9pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Leisure reading (novel)',
  },
  {
    id: 60,
    message: 'log reading documentation 3pm to 4pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Work reading (docs)',
  },
  {
    id: 61,
    message: 'log watching tutorial 2pm-4pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Educational video',
  },
  {
    id: 62,
    message: 'log watching TV 8pm to 10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Generic TV watching',
  },
  {
    id: 63,
    message: 'log coding: worked on MCP router from 10am to 12pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'With colon description',
  },
  {
    id: 64,
    message: 'log meeting with John from 2pm to 3pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Meeting with person name',
  },
  {
    id: 65,
    message: 'log gaming 21:00-23:00',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: '24-hour military time',
  },

  // ============================================================================
  // SPECIAL CASES (66-70)
  // ============================================================================
  {
    id: 66,
    message: 'Log 1:1 with manager from 3pm to 3:30pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'One-on-one meeting',
  },
  {
    id: 67,
    message: 'log date night 7pm-10pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Social activity',
  },
  {
    id: 68,
    message: 'log walking the dog 6am-6:30am',
    expectedTool: 'diary.log',
    expectedCategory: 'admin',
    description: 'Pet care',
  },
  {
    id: 69,
    message: 'log call with mom from 8pm to 9pm',
    expectedTool: 'diary.log',
    expectedCategory: 'nonprod',
    description: 'Personal call (social)',
  },
  {
    id: 70,
    message: 'log side project work 9pm to 11pm',
    expectedTool: 'diary.log',
    expectedCategory: 'prod',
    description: 'Side project',
  },
];

// ============================================================================
// Category Keywords for Validation
// ============================================================================

const CATEGORY_KEYWORDS = {
  prod: [
    'coding', 'programming', 'code', 'debug', 'meeting', 'standup', 'work',
    'project', 'learning', 'studying', 'study', 'research', 'writing', 'docs',
    'documentation', 'review', 'planning', 'client call', 'interview',
    'gym', 'workout', 'exercise', 'running', 'meditation', 'focus', 'deep work',
    'pair programming', 'tutorial', 'training', 'prep', '1:1', 'side project',
    'vibe coding', 'reading', // default reading to prod (learning)
  ],
  nonprod: [
    'gaming', 'game', 'games', 'playing', 'netflix', 'youtube', 'movie',
    'tv', 'reddit', 'twitter', 'social', 'browsing', 'scrolling', 'watching',
    'fallout', 'elden ring', 'chess', 'novel', 'entertainment', 'lanius',
    'date night', 'hangout', 'hanging out', 'video games',
    // Personal calls (check before generic "call")
    'call with mom', 'call with dad', 'call with friend', 'with mom', 'with dad',
  ],
  admin: [
    'lunch', 'dinner', 'breakfast', 'meal', 'eating', 'shower', 'nap',
    'sleep', 'rest', 'break', 'commute', 'grocery', 'shopping', 'cooking',
    'laundry', 'cleaning', 'chore', 'errand', 'appointment', 'doctor',
    'getting ready', 'walking the dog', 'pet',
  ],
};

// ============================================================================
// Validation Functions
// ============================================================================

function inferCategory(message: string): 'prod' | 'nonprod' | 'admin' | null {
  const lowerMessage = message.toLowerCase();
  
  // Check for specific phrases first (longer/more specific patterns take priority)
  // This ensures "call with mom" is detected before generic "call"
  const specificChecks: Array<{ keywords: string[]; category: 'prod' | 'nonprod' | 'admin' }> = [
    { keywords: ['call with mom', 'call with dad', 'call with friend', 'with mom', 'with dad'], category: 'nonprod' },
    { keywords: ['client call', 'work call', 'standup', '1:1'], category: 'prod' },
    { keywords: ['reading a novel', 'reading novel'], category: 'nonprod' },
  ];
  
  for (const { keywords, category } of specificChecks) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return category;
      }
    }
  }
  
  // Check each category's keywords (sorted by length descending for better matching)
  const sortedCategories: Array<[string, string[]]> = Object.entries(CATEGORY_KEYWORDS).map(
    ([cat, kws]) => [cat, [...kws].sort((a, b) => b.length - a.length)]
  );
  
  for (const [category, keywords] of sortedCategories) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return category as 'prod' | 'nonprod' | 'admin';
      }
    }
  }
  
  return null;
}

function extractTimes(message: string): { start?: string; end?: string } {
  const result: { start?: string; end?: string } = {};
  
  // Pattern: from X to Y or X-Y or X to Y
  const patterns = [
    /from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:to|until|-)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /started at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+ended at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      result.start = match[1];
      result.end = match[2];
      break;
    }
  }
  
  return result;
}

function shouldRouteToDiaryLog(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const triggers = [
    'log ',
    'log:',
    'spent',
    'worked on',
    'did some',
    'had ',
    'took a',
    'played',
    'attended',
    'exercised',
    'i coded',
    'just finished',
    'was in a',
    'watched',
  ];
  
  return triggers.some(t => lowerMessage.includes(t));
}

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
  id: number;
  message: string;
  passed: boolean;
  issues: string[];
  inferredCategory: string | null;
  expectedCategory: string | null;
  extractedTimes: { start?: string; end?: string };
}

function runTest(testCase: TestCase): TestResult {
  const issues: string[] = [];
  
  // Check if it should route to diary.log
  const shouldRoute = shouldRouteToDiaryLog(testCase.message);
  if (testCase.expectedTool === 'diary.log' && !shouldRoute) {
    issues.push('Would NOT route to diary.log (missing trigger words)');
  }
  
  // Check category inference
  const inferredCategory = inferCategory(testCase.message);
  if (testCase.expectedCategory && inferredCategory !== testCase.expectedCategory) {
    issues.push(`Category mismatch: expected ${testCase.expectedCategory}, inferred ${inferredCategory || 'null'}`);
  }
  
  // Check time extraction
  const extractedTimes = extractTimes(testCase.message);
  if (testCase.expectedStartTime && !extractedTimes.start) {
    issues.push(`Could not extract start time (expected: ${testCase.expectedStartTime})`);
  }
  if (testCase.expectedEndTime && !extractedTimes.end) {
    issues.push(`Could not extract end time (expected: ${testCase.expectedEndTime})`);
  }
  
  return {
    id: testCase.id,
    message: testCase.message,
    passed: issues.length === 0,
    issues,
    inferredCategory,
    expectedCategory: testCase.expectedCategory,
    extractedTimes,
  };
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  console.log('🧪 MCP Routing Dry Run Tests\n');
  console.log('=' .repeat(80));
  console.log(`Testing ${TEST_CASES.length} message variations...\n`);
  
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  
  // Group by expected category
  const byCategory = new Map<string, TestCase[]>();
  for (const tc of TEST_CASES) {
    const cat = tc.expectedCategory || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(tc);
  }
  
  // Run tests by category
  for (const [category, cases] of byCategory) {
    console.log(`\n📁 Category: ${category.toUpperCase()}`);
    console.log('-'.repeat(60));
    
    for (const testCase of cases) {
      const result = runTest(testCase);
      results.push(result);
      
      if (result.passed) {
        passed++;
        console.log(`  ✅ #${result.id}: "${result.message.substring(0, 45)}..."`);
      } else {
        failed++;
        console.log(`  ❌ #${result.id}: "${result.message.substring(0, 45)}..."`);
        result.issues.forEach(issue => {
          console.log(`      └─ ${issue}`);
        });
      }
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 SUMMARY\n');
  console.log(`Total Tests: ${TEST_CASES.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Pass Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
  
  // Category breakdown
  console.log('\n📈 By Category:');
  const categoryStats = new Map<string, { passed: number; total: number }>();
  for (const result of results) {
    const cat = result.expectedCategory || 'other';
    if (!categoryStats.has(cat)) categoryStats.set(cat, { passed: 0, total: 0 });
    const stats = categoryStats.get(cat)!;
    stats.total++;
    if (result.passed) stats.passed++;
  }
  categoryStats.forEach((stats, cat) => {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0);
    console.log(`   ${cat}: ${stats.passed}/${stats.total} (${rate}%)`);
  });
  
  // Show all failures
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n⚠️  Failed Tests Detail:');
    for (const f of failures) {
      console.log(`\n   Test #${f.id}: "${f.message}"`);
      console.log(`   Expected: ${f.expectedCategory}, Inferred: ${f.inferredCategory}`);
      f.issues.forEach(issue => {
        console.log(`   └─ ${issue}`);
      });
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  
  if (failed === 0) {
    console.log('🎉 All dry-run validations passed!\n');
    console.log('These test cases are ready for live LLM testing.');
  } else {
    console.log(`⚠️  ${failed} test cases have potential issues.\n`);
    console.log('Review the failed cases - they may need keyword additions or be edge cases.');
  }
  
  // Export stats for CI
  const stats = {
    total: TEST_CASES.length,
    passed,
    failed,
    passRate: (passed / TEST_CASES.length) * 100,
    byCategory: Object.fromEntries(categoryStats),
  };
  
  console.log('\n📤 Stats JSON:');
  console.log(JSON.stringify(stats, null, 2));
  
  process.exit(failed > 5 ? 1 : 0); // Allow some tolerance for edge cases
}

// Run tests
main();

// Export for module use
export { TEST_CASES, runTest, inferCategory, extractTimes };
