import { getChatModelOption, type ChatModelId } from '@shared/chat-models';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { getChatModelPickerOptions } from './chat-home-helpers';

interface ChatModelPickerProps {
  value: ChatModelId;
  onValueChange: (value: ChatModelId) => void;
}

export function ChatModelPicker({ value, onValueChange }: ChatModelPickerProps) {
  const options = getChatModelPickerOptions();
  const selectedOption = getChatModelOption(value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as ChatModelId)}
    >
      <SelectTrigger
        aria-label="Chat model"
        className="h-8 gap-1 rounded-md border-none bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors hover:bg-sidebar hover:text-foreground focus:ring-0 [&>svg]:opacity-60"
      >
        <span className="truncate font-serif text-[13px]">
          {selectedOption?.label ?? 'Select model'}
        </span>
      </SelectTrigger>
      <SelectContent
        align="end"
        className="w-[320px] rounded-2xl border-none bg-card-elevated p-1 shadow-card"
      >
        {options.map((option) => (
          <SelectItem
            key={option.id}
            value={option.id}
            className="rounded-xl px-3 py-2.5"
          >
            <div className="flex flex-col gap-1 pr-4">
              <span className="font-serif text-[14px] leading-[1.25] text-foreground">
                {option.label}
              </span>
              <span className="text-[11px] leading-[1.5] text-muted-foreground">
                {option.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
