import { getYaiTitleFallback } from './title';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { ChatPromptTemplate } from '@langchain/core/prompts';

describe('YAI title fallback', () => {
  it('includes the conversation in the configured completion prompt', async () => {
    const config = load(
      readFileSync(path.resolve(__dirname, '../../../../librechat.yai.yaml'), 'utf8'),
    ) as { endpoints: { custom: { titlePrompt: string }[] } };
    const template = ChatPromptTemplate.fromTemplate(config.endpoints.custom[0].titlePrompt);
    const messages = await template.formatMessages({
      convo: 'User: Help me plan a balcony garden.',
    });
    expect(messages[0].content).toContain('User: Help me plan a balcony garden.');
  });
  it('uses a readable first message and preserves its language', () => {
    expect(getYaiTitleFallback('  תכנון\n  גינה  ')).toBe('תכנון גינה');
    expect(getYaiTitleFallback('')).toBe('Attachment discussion');
  });
  it('bounds long titles without splitting a Unicode character', () => {
    const title = getYaiTitleFallback('🌱'.repeat(100));
    expect(Array.from(title)).toHaveLength(80);
    expect(title).toBe(`${'🌱'.repeat(79)}…`);
  });
});
