import Anthropic from '@anthropic-ai/sdk';
import { LLMResponse, PlayerId, FogState, TileType, ActionType } from '../../shared/types.js';
import { Unit } from '../game/Unit.js';
import { Base } from '../game/Combat.js';
import { buildPrompt } from './PromptBuilder.js';
import { validateActions } from './ActionValidator.js';

//
// LLM Command Parser — uses tool_use for reliable structured output
//

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    let apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    // Remove leading = if present (Railway sometimes adds this)
    if (apiKey.startsWith('=')) {
      apiKey = apiKey.substring(1).trim();
    }
    if (!apiKey || apiKey === 'your-api-key-here') {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// Tool definition — model fills this schema instead of writing free-form JSON
const ISSUE_ORDERS_TOOL: Anthropic.Tool = {
  name: 'issue_orders',
  description: 'Issue movement and combat orders to your units. Always call this tool, even if actions is empty.',
  input_schema: {
    type: 'object' as const,
    properties: {
      actions: {
        type: 'array',
        description: 'List of orders. Populate for every unit that should act. Empty only if command is uninterpretable.',
        items: {
          type: 'object',
          properties: {
            unitId: {
              type: 'string',
              description: 'Exact unit ID from YOUR UNITS list (e.g. "1_archer_1")',
            },
            type: {
              type: 'string',
              enum: ['move', 'attack_move', 'hold', 'retreat'],
              description: 'Order type',
            },
            target: {
              type: 'object',
              description: 'Target tile for move/attack_move',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
              },
              required: ['x', 'y'],
            },
          },
          required: ['unitId', 'type'],
        },
      },
      response: {
        type: 'string',
        description: 'Brief natural language description of what you are doing.',
      },
      needsClarification: {
        type: 'boolean',
        description: 'True only if the command is genuinely impossible to interpret.',
      },
    },
    required: ['actions', 'response', 'needsClarification'],
  },
};

// Map UI model selector values → actual Claude model IDs
const MODEL_MAP: Record<string, string> = {
  'haiku':    'claude-haiku-4-5-20251001',
  'sonnet':   'claude-sonnet-4-6',
  'sonnet-4': 'claude-sonnet-4-6',
};
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Parse a natural language command into game actions using Claude tool_use.
 */
export async function parseCommand(
  player: PlayerId,
  command: string,
  units: Unit[],
  bases: Base[],
  fogMap: FogState[][],
  mapTiles: TileType[][],
  scroll?: string,
  modelKey?: string,
): Promise<LLMResponse> {
  const { system, user } = buildPrompt(player, units, bases, fogMap, mapTiles, command, scroll);

  const selectedModel = MODEL_MAP[modelKey || ''] || process.env.LLM_MODEL || DEFAULT_MODEL;

  try {
    const client = getClient();

    console.log(`[LLM] model=${selectedModel} player=${player} cmd="${command}"`);

    const message = await client.messages.create({
      model: selectedModel,
      max_tokens: 4096,
      system,
      tools: [ISSUE_ORDERS_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: user }],
      temperature: 0,
    });

    console.log(`[LLM] stop_reason=${message.stop_reason} blocks=${message.content.length}`);

    // With tool_choice: 'any', the model MUST call a tool
    const toolUseBlock = message.content.find(b => b.type === 'tool_use');

    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      const textBlock = message.content.find(b => b.type === 'text');
      const fallback = textBlock && textBlock.type === 'text' ? textBlock.text : 'No orders issued.';
      console.warn('[LLM] No tool_use block in response');
      return { actions: [], response: fallback, needsClarification: false };
    }

    const input = toolUseBlock.input as {
      actions: Array<{ unitId: string; type: string; target?: { x: number; y: number } }>;
      response: string;
      needsClarification: boolean;
    };

    console.log(`[LLM] actions from model: ${JSON.stringify(input.actions)}`);

    const rawActions = (input.actions || []).map(a => ({
      unitId: a.unitId,
      type: a.type as ActionType,
      target: a.target,
    }));

    const playerUnits = units.filter(u => u.owner === player && u.alive);
    const validatedActions = validateActions(rawActions, playerUnits, mapTiles);

    console.log(`[LLM] validated ${validatedActions.length}/${rawActions.length} actions`);

    return {
      actions: validatedActions,
      response: input.response || 'Orders received.',
      needsClarification: input.needsClarification || false,
    };
  } catch (error) {
    console.error('LLM command parse error:', error);

    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('api_key') || errMsg.includes('authentication') || errMsg.includes('401')) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      console.error(`API key debug: ${apiKey ? `present (${apiKey.length} chars)` : 'MISSING'}`);
      return {
        actions: [],
        response: 'Authentication failed. Check ANTHROPIC_API_KEY in Railway environment.',
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
