#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

const API_KEY = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.LLM_MODEL || 'claude-sonnet-3-7-20241022';

async function testAnthropicAPI() {
  console.log('🧪 Testing Anthropic API...\n');
  console.log(`Model: ${MODEL}`);
  console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 20) + '...' : 'NOT SET'}\n`);

  if (!API_KEY) {
    console.error('❌ Error: LLM_API_KEY or ANTHROPIC_API_KEY not found in .env');
    process.exit(1);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello, API test successful!" if you can read this.',
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ API call successful!\n');
    console.log('Response:');
    console.log('─'.repeat(50));
    console.log(data.content[0].text);
    console.log('─'.repeat(50));
    console.log('\n📊 Usage:');
    console.log(`  Input tokens: ${data.usage.input_tokens}`);
    console.log(`  Output tokens: ${data.usage.output_tokens}`);
    console.log(`\n✅ Your API key is working correctly!`);
  } catch (error) {
    console.error('❌ Request failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

testAnthropicAPI();
