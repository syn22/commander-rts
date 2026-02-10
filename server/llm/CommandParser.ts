import Anthropic from '@anthropic-ai/sdk';
import { LLMResponse, PlayerId, FogState, TileType } from '../../shared/types.js';
import { Unit } from '../game/Unit.js';
import { Base } from '../game/Combat.js';
import { buildPrompt } from './PromptBuilder.js';
import { validateActions } from './ActionValidator.js';

// ============================================================
// LLM Command Parser — sends commands to Claude API
// ============================================================

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    // Trim whitespace and remove any leading = or spaces from API key
    let apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    // Remove leading = if present (Railway sometimes adds this)
    if (apiKey.startsWith('=')) {
      apiKey = apiKey.substring(1).trim();
    }
    if (!apiKey || apiKey === 'your-api-key-here') {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({
      apiKey,
    });
  }
  return anthropicClient;
}

/**
 * Parse a natural language command into game actions using Claude.
 */
export async function parseCommand(
  player: PlayerId,
  command: string,
  units: Unit[],
  bases: Base[],
  fogMap: FogState[][],
  mapTiles: TileType[][],
  scroll?: string,
): Promise<LLMResponse> {
  const { system, user } = buildPrompt(player, units, bases, fogMap, mapTiles, command, scroll);

  try {
    const client = getClient();

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514', // More reliable JSON formatting
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
      temperature: 0, // Deterministic for consistent JSON formatting
    });

    // Extract text content
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return {
        actions: [],
        response: 'Failed to get a response from the AI commander.',
        needsClarification: false,
      };
    }

    const rawText = textBlock.text.trim();
    console.log('Raw LLM response (first 500 chars):', rawText.substring(0, 500));

    // Try to parse JSON (handle potential markdown wrapping and malformed JSON)
    let jsonText = rawText;

    // Remove markdown code blocks
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Try to extract JSON if there's other text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Clean up common JSON formatting issues
    jsonText = jsonText
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
      .trim();

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(jsonText) as LLMResponse;
    } catch (parseError) {
      console.error('JSON parse failed, raw text:', rawText);
      console.error('Cleaned JSON text:', jsonText);
      console.error('Parse error:', parseError);

      return {
        actions: [],
        response: 'Failed to parse AI response. The command format may be too complex.',
        needsClarification: false,
      };
    }

    // Validate actions
    const playerUnits = units.filter(u => u.owner === player && u.alive);
    const validatedActions = validateActions(parsed.actions, playerUnits, mapTiles);

    return {
      actions: validatedActions,
      response: parsed.response || 'Orders received.',
      needsClarification: parsed.needsClarification || false,
    };
  } catch (error) {
    console.error('LLM command parse error:', error);

    // Check if it's an API key issue
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('api_key') || errMsg.includes('authentication') || errMsg.includes('401')) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const keyInfo = apiKey
        ? `Key present (${apiKey.length} chars, starts: "${apiKey.substring(0, 15)}...")`
        : 'Key missing';
      console.error(`API Key Debug: ${keyInfo}`);

      return {
        actions: [],
        response: 'Authentication failed. API key may be invalid or expired.',
        needsClarification: false,
      };
    }

    return {
      actions: [],
      response: `Command failed: ${errMsg}`,
      needsClarification: false,
    };
  }
}
