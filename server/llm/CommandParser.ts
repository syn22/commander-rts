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
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here',
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

    const model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
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

    // Try to parse JSON (handle potential markdown wrapping)
    let jsonText = rawText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText) as LLMResponse;

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
      return {
        actions: [],
        response: 'API key not configured. Please set ANTHROPIC_API_KEY in .env file.',
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
