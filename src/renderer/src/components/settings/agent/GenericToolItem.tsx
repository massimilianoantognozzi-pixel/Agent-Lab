import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';
import { AgentProfile, GenericTool, ToolApprovalState } from '@common/types';
import { POWER_TOOL_BASH_INPUT, POWER_TOOL_GROUP_NAME, TOOL_GROUP_NAME_SEPARATOR } from '@common/tools';

import { Select } from '@/components/common/Select';
import { InfoIcon } from '@/components/common/InfoIcon';

type Props = {
  tool: GenericTool;
  profile: AgentProfile;
  onApprovalChange?: (toolId: string, approval: ToolApprovalState) => void;
  renderToolSettings?: () => ReactNode;
};

export const GenericToolItem = ({ tool, profile, onApprovalChange, renderToolSettings }: Props) => {
  const { t } = useTranslation();
  const fullToolId = `${tool.groupName}${TOOL_GROUP_NAME_SEPARATOR}${tool.name}`;

  const defaultApproval = tool.groupName === POWER_TOOL_GROUP_NAME && tool.name === POWER_TOOL_BASH_INPUT ? ToolApprovalState.Never : ToolApprovalState.Always;
  const currentApproval = profile.toolApprovals?.[fullToolId] ?? defaultApproval;

  const approvalOptions = [
    { value: ToolApprovalState.Always, label: t('tool.approval.always') },
    { value: ToolApprovalState.Never, label: t('tool.approval.never') },
    { value: ToolApprovalState.Ask, label: t('tool.approval.ask') },
  ];

  const handleApprovalChange = (value: string) => {
    if (onApprovalChange) {
      onApprovalChange(fullToolId, value as ToolApprovalState);
    }
  };

  return (
    <>
      <div className="flex items-center">
        <div className="flex-1 text-xs ml-2 mr-2">{tool.name}</div>
        <InfoIcon className="mr-4" tooltip={tool.description?.trim() || t('tool.noDescription')} />
        {/* Conditionally render the approval select only if onApprovalChange is provided */}
        {onApprovalChange && profile.toolApprovals && (
          <div>
            <Select options={approvalOptions} size="sm" value={currentApproval} onChange={handleApprovalChange} />
          </div>
        )}
      </div>
      {renderToolSettings && <div className="pb-4">{renderToolSettings()}</div>}
    </>
  );
};
