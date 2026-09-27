import { useMemo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { getIconEndpoint, getEntity, getModelSpec } from '~/utils';
import { useLocalize, useSubmitMessage } from '~/hooks';

const ConversationStarters = () => {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (modelSpec?.conversation_starters?.length) {
      return modelSpec.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity, modelSpec]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  const isYaiEmbedded = import.meta.env.VITE_YAI_EMBEDDED === 'true';
  const starterTexts = isYaiEmbedded
    ? (
        [
          'com_yai_chat_write_content',
          'com_yai_chat_brainstorm',
          'com_yai_chat_write_code',
          'com_yai_chat_research',
          'com_yai_chat_surprise_me',
        ] as const
      ).map((key) => localize(key))
    : conversation_starters.slice(0, Constants.MAX_CONVO_STARTERS);

  if (isYaiEmbedded) {
    const renderStarter = (text: string) => (
      <button
        key={text}
        onClick={() => sendConversationStarter(text)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-light bg-surface-primary px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary focus-visible:ring-offset-2"
      >
        <Sparkles className="size-3.5 shrink-0 text-link" aria-hidden="true" />
        <span>{text}</span>
      </button>
    );

    return (
      <div className="mt-3 flex w-full flex-col items-center gap-2">
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {starterTexts.slice(0, 4).map(renderStarter)}
        </div>
        <div className="flex items-center justify-center">
          {starterTexts.slice(4).map(renderStarter)}
        </div>
      </div>
    );
  }

  if (!starterTexts.length) {
    return null;
  }

  return (
    <div className="mb-8 mt-2 flex w-full flex-wrap items-stretch justify-center gap-2 px-4">
      {starterTexts.map((text: string, index: number) => (
        <button
          key={index}
          onClick={() => sendConversationStarter(text)}
          style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
          className="flex max-w-[16rem] cursor-pointer items-center justify-center rounded-2xl border border-border-medium bg-surface-secondary px-4 py-2.5 text-center text-sm text-text-secondary shadow-sm transition-colors duration-200 fade-in hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <span className="line-clamp-2 text-balance break-words">{text}</span>
        </button>
      ))}
    </div>
  );
};

export default ConversationStarters;
