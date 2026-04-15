import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function checkModel(modelId) {
  try {
    const msg = await anthropic.messages.create({
      model: modelId,
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }]
    });
    console.log(`✅ ${modelId} works!`);
  } catch (e) {
    console.log(`❌ ${modelId} failed: ${e.message}`);
  }
}

async function run() {
  await checkModel('claude-3-haiku-20240307');
  await checkModel('claude-3-5-haiku-20241022');
  await checkModel('claude-3-5-sonnet-20241022');
  await checkModel('claude-3-opus-20240229');
  await checkModel('claude-3-7-sonnet-latest');
}
run();
