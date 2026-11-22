import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompactToolMessage } from '../CompactToolMessage';
import { ToolMessageBlock } from '../ToolMessageBlock';

import type { ToolMessage } from '@common/types';

import { render } from '@/__tests__/render';

vi.mock('@/contexts/ApiContext', () => ({ useApi: () => ({ writeToClipboard: vi.fn() }), useIsReadonlyView: () => false }));

const output = 'assets/sfondi/notte.png';
const thumb = { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X+ikAAAAASUVORK5CYII=' };
const receipt = { state: 'completed', jobId: 'fixture', output };
const result: ToolMessage = {
  type: 'tool',
  id: 'img-1',
  serverName: 'images',
  toolName: 'result',
  args: { jobId: 'fixture' },
  finished: true,
  content: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(receipt) }, thumb] }),
};

describe('generated PNG result in chat', () => {
  it.each(['normal', 'compact summary', 'compact tool'] as const)('shows a single clickable thumbnail and its saved path in the collapsed %s view', (mode) => {
    const toggle = vi.fn();
    const { container } = render(
      mode === 'compact tool' ? (
        <CompactToolMessage message={result} isExpanded={false} onToggle={toggle} />
      ) : (
        <ToolMessageBlock message={result} compact={mode === 'compact summary'} hideMessageBar />
      ),
    );
    expect(screen.getByText(output)).toBeVisible();
    const image = screen.getByRole('img', { name: output + ' 1' });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,' + thumb.data);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    fireEvent.click(image);
    expect(screen.getAllByRole('img', { name: output + ' 1' })).toHaveLength(2);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('keeps the compact details and their toggle without duplicating the image', () => {
    const toggle = vi.fn();
    const { rerender, container } = render(<CompactToolMessage message={result} isExpanded={false} onToggle={toggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggle).toHaveBeenCalledOnce();
    rerender(<CompactToolMessage message={result} isExpanded={true} onToggle={toggle} />);
    expect(screen.getByText('toolMessage.arguments')).toBeVisible();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows the document previews with the delivery directory in the collapsed chat', () => {
    const documentResult = {
      ...result,
      serverName: 'documents',
      toolName: 'generate',
      content: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ output: 'consegne/prova' }) }, thumb, thumb] }),
    };
    render(<CompactToolMessage message={documentResult} isExpanded={false} onToggle={vi.fn()} />);
    expect(screen.getByText('consegne/prova')).toBeVisible();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('preserves the collapsed behavior of unrelated tools and receipts without thumbnails', () => {
    const other = { ...result, serverName: 'another-server' };
    const { rerender } = render(<ToolMessageBlock message={other} hideMessageBar />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<CompactToolMessage message={other} isExpanded={false} onToggle={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<CompactToolMessage message={other} isExpanded={true} onToggle={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Tool result image 1' })).toBeVisible();
    rerender(
      <ToolMessageBlock message={{ ...result, content: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(receipt) }] }) }} hideMessageBar />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
