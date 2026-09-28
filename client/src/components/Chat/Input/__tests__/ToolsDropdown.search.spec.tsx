import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { AuthType, SearchCategories } from 'librechat-data-provider';
import type { VerifyToolAuthResponse } from 'librechat-data-provider';
import ToolsDropdown from '../ToolsDropdown';

const mockToggle = jest.fn();
const mockOpenDialog = jest.fn();
let mockEnabled = false;
let mockAuth: VerifyToolAuthResponse | undefined;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
  useAuthContext: () => ({ user: { role: 'USER' } }),
  useHasMemoryAccess: () => false,
  useAgentCapabilities: () => ({ webSearchEnabled: true }),
}));
jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    webSearch: {
      isPinned: true,
      isToolEnabled: mockEnabled,
      toggleState: mockEnabled,
      authData: mockAuth,
      debouncedChange: mockToggle,
    },
    searchApiKeyForm: { setIsDialogOpen: mockOpenDialog },
  }),
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: {} }) }));
jest.mock('../ArtifactsSubMenu', () => () => null);
jest.mock('../MCPSubMenu', () => () => null);

describe('web search menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnabled = false;
    mockAuth = { authenticated: true, authTypes: [] };
  });

  it.each([false, true])(
    'toggles managed search from enabled=%s without offering API keys',
    async (enabled) => {
      mockEnabled = enabled;
      const user = userEvent.setup();
      render(
        <main>
          <ToolsDropdown />
        </main>,
      );
      await user.click(screen.getByRole('button', { name: 'Tools Options' }));

      const search = await screen.findByRole('menuitemcheckbox', { name: /com_ui_web_search/ });
      expect(search).toHaveAttribute('aria-checked', String(enabled));
      expect(
        screen.queryByRole('button', { name: 'Configure web search' }),
      ).not.toBeInTheDocument();
      await user.click(search);
      expect(mockToggle).toHaveBeenCalledWith({ value: !enabled });
      expect(mockOpenDialog).not.toHaveBeenCalled();
    },
  );

  it('keeps configuration available when the provider requires a user key', async () => {
    mockAuth = {
      authenticated: false,
      authTypes: [[SearchCategories.PROVIDERS, AuthType.USER_PROVIDED]],
    };
    const user = userEvent.setup();
    render(
      <main>
        <ToolsDropdown />
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Tools Options' }));
    await user.click(await screen.findByRole('button', { name: 'Configure web search' }));
    expect(mockOpenDialog).toHaveBeenCalledWith(true);
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('does not offer a key dialog before authentication finishes', async () => {
    mockAuth = undefined;
    const user = userEvent.setup();
    render(
      <main>
        <ToolsDropdown />
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Tools Options' }));
    await screen.findByRole('menuitemcheckbox', { name: /com_ui_web_search/ });
    expect(screen.queryByRole('button', { name: 'Configure web search' })).not.toBeInTheDocument();
  });
});
