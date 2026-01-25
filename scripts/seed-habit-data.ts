#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

const HABIT_TRACKER_URL = process.env.HABIT_TRACKER_URL || 'http://localhost:3001';
const USER_ID = process.argv[2] || 'dev-user';

// Generate a token for the user
async function generateToken() {
  const { generateDevToken } = await import('../packages/shared/auth/src/auth');
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'dev-secret-do-not-use-in-production';
  }
  return generateDevToken(USER_ID);
}

async function seedTestData() {
  console.log(`🌱 Seeding test data for user: ${USER_ID}\n`);

  const token = await generateToken();
  const today = new Date();
  
  // Create check-ins for the last 5 days (to simulate a 5-day streak)
  const checkins = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    checkins.push({
      date: dateStr,
      checked: true,
      note: i === 0 ? 'Early wake-up!' : undefined,
    });
  }

  console.log('Creating check-ins:');
  for (const checkin of checkins) {
    try {
      const response = await fetch(`${HABIT_TRACKER_URL}/api/v1/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Yukie-User-Id': USER_ID,
          'X-Yukie-Scopes': 'habit:read,habit:write',
        },
        body: JSON.stringify({
          action: 'habit.checkin',
          params: checkin,
        }),
      });

      const result = await response.json();
      if (result.success) {
        console.log(`  ✓ ${checkin.date}: Checked in`);
      } else {
        console.log(`  ✗ ${checkin.date}: ${result.error?.message || 'Failed'}`);
      }
    } catch (error) {
      console.log(`  ✗ ${checkin.date}: ${error instanceof Error ? error.message : 'Failed'}`);
    }
  }

  console.log('\n📊 Checking stats...');
  try {
    const response = await fetch(`${HABIT_TRACKER_URL}/api/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yukie-User-Id': USER_ID,
        'X-Yukie-Scopes': 'habit:read',
      },
      body: JSON.stringify({
        action: 'habit.stats',
      }),
    });

    const result = await response.json();
    if (result.success) {
      console.log('\n✅ Stats:');
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log('✗ Failed to get stats:', result.error);
    }
  } catch (error) {
    console.log('✗ Error:', error);
  }
}

seedTestData().catch(console.error);
