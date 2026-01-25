import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

import { generateDevToken } from '../packages/shared/auth/src/auth';

async function main() {
  // Set a default JWT_SECRET for development
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'dev-secret-do-not-use-in-production';
  }

  const userId = process.argv[2] || 'dev-user';
  const token = await generateDevToken(userId);

  console.log('\n=== Development Token Generated ===\n');
  console.log('User ID:', userId);
  console.log('\nToken:');
  console.log(token);
  console.log('\n=== Usage ===\n');
  console.log('Set this token in your Authorization header:');
  console.log(`  Authorization: Bearer ${token.substring(0, 50)}...`);
  console.log('\nOr use curl:');
  console.log(`  curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/chat -d '{"message":"Hello"}'`);
  console.log('');
}

main().catch(console.error);
