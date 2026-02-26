import { useMemo } from 'react';
import { Thread, ThreadConfigProvider, makeMarkdownText } from '@assistant-ui/react-ui';
import remarkGfm from 'remark-gfm';
import { ImportAgentComposer } from './ImportAgentComposer';

import bg1 from '@/assets/textures/import_agent_bg_1.webp';
import bg2 from '@/assets/textures/import_agent_bg_2.webp';
import bg3 from '@/assets/textures/import_agent_bg_3.webp';

const backgrounds = [bg1, bg2, bg3];

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
import { ConfirmAndGradeUI } from '@/components/import-agent/tool-cards/ConfirmAndGradeCard';

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
  ConfirmAndGradeUI,
];

/**
 * Chat panel — just ThreadConfigProvider + Thread.
 * AssistantRuntimeProvider lives in ImportAgentLayout (parent).
 */
export function ImportAgentChat() {
  const bg = useMemo(() => backgrounds[Math.floor(Math.random() * backgrounds.length)], []);

  return (
    <ThreadConfigProvider
      config={{
        welcome: {
          message: 'Import Agent ready. Click the button below to start.',
          suggestions: [{ text: "Let's get started.", prompt: "Let's get started." }],
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
      <div className="import-agent-chat relative flex flex-col h-full bg-background">
        <div
          className="absolute inset-0 opacity-[0.09] bg-no-repeat bg-center bg-contain pointer-events-none"
          style={{ backgroundImage: `url(${bg})` }}
        />
        <Thread />
      </div>
    </ThreadConfigProvider>
  );
}
