import { Thread, ThreadConfigProvider, makeMarkdownText } from '@assistant-ui/react-ui';
import remarkGfm from 'remark-gfm';
import { ImportAgentComposer } from './ImportAgentComposer';

import {
  BashToolUI,
  RunSourceExtractionUI,
  RunDOK1ExtractionUI,
  RunDOK2ExtractionUI,
  RunDOK3ExtractionUI,
  GetSavedDOK1sUI,
  GetSavedDOK2sUI,
  GetSavedDOK3sUI,
} from '@/components/import-agent/tool-cards/ExtractionStatusCard';
import { PhaseTransitionUI } from '@/components/import-agent/tool-cards/PhaseTransitionCard';
import { SourcesSavedUI } from '@/components/import-agent/tool-cards/SourcesSavedCard';
import { DOK1sSavedUI } from '@/components/import-agent/tool-cards/DOK1sSavedCard';
import { DOK2sSavedUI } from '@/components/import-agent/tool-cards/DOK2sSavedCard';
import { DOK3sSavedUI } from '@/components/import-agent/tool-cards/DOK3sSavedCard';
import { DOK3LinkUI } from '@/components/import-agent/tool-cards/DOK3LinkCard';
import { DOK3ScratchpadUI } from '@/components/import-agent/tool-cards/DOK3ScratchpadCard';
import { CanvasUpdateUI } from '@/components/import-agent/tool-cards/CanvasUpdateCard';

const MarkdownText = makeMarkdownText({ remarkPlugins: [remarkGfm] });

const importAgentTools = [
  BashToolUI,
  RunSourceExtractionUI,
  RunDOK1ExtractionUI,
  RunDOK2ExtractionUI,
  RunDOK3ExtractionUI,
  PhaseTransitionUI,
  SourcesSavedUI,
  DOK1sSavedUI,
  DOK2sSavedUI,
  DOK3sSavedUI,
  DOK3LinkUI,
  DOK3ScratchpadUI,
  CanvasUpdateUI,
  GetSavedDOK1sUI,
  GetSavedDOK2sUI,
  GetSavedDOK3sUI,
];

/**
 * Chat panel — just ThreadConfigProvider + Thread.
 * AssistantRuntimeProvider lives in ImportAgentLayout (parent).
 */
export function ImportAgentChat() {
  return (
    <ThreadConfigProvider
      config={{
        welcome: {
          message: 'Import Agent ready. Send a message to start.',
        },
        userMessage: {
          allowEdit: false,
        },
        assistantMessage: {
          components: {
            Text: MarkdownText,
          },
        },
        tools: importAgentTools,
        components: {
          Composer: ImportAgentComposer,
        },
      }}
    >
      <div className="flex flex-col h-full">
        <Thread />
      </div>
    </ThreadConfigProvider>
  );
}
