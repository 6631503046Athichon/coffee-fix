import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { User, UserRole } from '../../types';
import { getAllUsers } from '../../services/auth/userService';
import ActivityTypeManagement from './ActivityTypeManagement';
import CoffeeGradeManagement from './CoffeeGradeManagement';
import CoffeeVarietiesManager from './CoffeeVarietiesManager';
import UserManagement from './UserManagement';
import { CreateUserModal, EditUserModal, TransferOwnershipModal } from './modals';

// Hand-rolled `fixed inset-0` popups rendered inside a page's space-y-6 took a
// 24px top margin from it, leaving an undimmed strip across the top of the
// screen. Each popup is portalled to <body>; these check it lands there.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/reference/activityTypeService', () => ({
  addActivityType: vi.fn(),
  updateActivityType: vi.fn(),
  deleteActivityType: vi.fn(),
}));
vi.mock('../../services/reference/coffeeGradeService', () => ({
  addCoffeeGrade: vi.fn(),
  updateCoffeeGrade: vi.fn(),
  deleteCoffeeGrade: vi.fn(),
}));
vi.mock('../../services/reference/coffeeVarietyService', () => ({
  getAllCoffeeVarieties: vi.fn(async () => []),
  addCoffeeVariety: vi.fn(),
  updateCoffeeVariety: vi.fn(),
  deleteCoffeeVariety: vi.fn(),
}));

const owner: User = { id: 'u-owner', name: 'Olive Owner', username: 'olive', roles: [UserRole.Admin], isSuperAdmin: true };
const admin: User = { id: 'u-admin', name: 'Adam Admin', username: 'adam', roles: [UserRole.Admin], isActive: true };
const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] };

vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}));

/** The popup's backdrops that sit directly on <body>. */
const bodyOverlays = () => Array.from(document.body.children).filter(el => el.matches('.fixed.inset-0'));

/** Exactly one popup is open, it sits directly on <body> and nothing of it is left inside the page. */
const expectPortalled = (container: HTMLElement, title: string | RegExp) => {
  const overlays = bodyOverlays();
  expect(overlays).toHaveLength(1);
  expect(overlays[0]).toHaveTextContent(title);
  expect(container.contains(overlays[0])).toBe(false);
  expect(container.querySelector('.fixed.inset-0')).toBeNull();
};

beforeEach(() => {
  auth.currentUser = owner;
  vi.mocked(getAllUsers).mockResolvedValue([owner, admin, farmer]);
});

describe('Admin reference-data popups render on <body>', { timeout: 20000 }, () => {
  it('Activity Type Management: the add popup, and closing it removes it', () => {
    const { container } = render(<ActivityTypeManagement />);
    expect(container.firstElementChild).toHaveClass('space-y-6');
    fireEvent.click(screen.getByRole('button', { name: /Add Activity Type/ }));
    expectPortalled(container, 'Add Activity Type');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bodyOverlays()).toHaveLength(0);
  });

  it('Coffee Grade Management: the add popup, and closing it removes it', () => {
    const { container } = render(<CoffeeGradeManagement />);
    expect(container.firstElementChild).toHaveClass('space-y-6');
    fireEvent.click(screen.getByRole('button', { name: /Add Grade/ }));
    expectPortalled(container, 'Add Grade');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bodyOverlays()).toHaveLength(0);
  });

  it('Coffee Varieties: the add popup', async () => {
    const { container } = render(<CoffeeVarietiesManager />);
    fireEvent.click(await screen.findByRole('button', { name: /Add Variety/ }));
    expectPortalled(container, 'Add New Variety');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bodyOverlays()).toHaveLength(0);
  });
});

describe('User Management popups render on <body>', { timeout: 20000 }, () => {
  const renderPage = async () => {
    const view = render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    );
    await screen.findByText('Fern Farmer');
    return view;
  };

  it('the create user popup', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Create User/ }));
    expectPortalled(container, 'Create New User');
  });

  it('the edit user popup', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getAllByTitle('Edit user')[0]);
    expectPortalled(container, 'Edit User');
  });

  it('the transfer ownership popup', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Transfer Ownership/ }));
    // Wait for its admin list so the load settles inside the test.
    await screen.findByText(/Adam Admin/, { selector: '.fixed.inset-0 *' });
    expectPortalled(container, 'Transfer Super Admin Ownership');
  });

  it('the reset password popup, and closing it removes it', async () => {
    const { container } = await renderPage();
    fireEvent.click(within(screen.getByText('Fern Farmer').closest('tr')!).getByTitle('Reset password'));
    expectPortalled(container, 'Reset Password for Fern Farmer');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bodyOverlays()).toHaveLength(0);
  });
});

describe('User modals render on <body> wherever they are mounted', { timeout: 20000 }, () => {
  // Mounted inside a spaced page container, as the admin pages are laid out.
  const inSpacedPage = (popup: React.ReactNode) =>
    render(
      <div className="space-y-6">
        <p>Page content</p>
        {popup}
      </div>,
    );

  it('CreateUserModal', () => {
    const { container } = inSpacedPage(<CreateUserModal isOpen onClose={() => {}} onUserCreated={() => {}} />);
    expectPortalled(container, 'Create New User');
  });

  it('EditUserModal', () => {
    const { container } = inSpacedPage(<EditUserModal isOpen user={farmer} onClose={() => {}} onUserUpdated={() => {}} />);
    expectPortalled(container, 'Edit User');
  });

  it('TransferOwnershipModal', async () => {
    const { container } = inSpacedPage(
      <TransferOwnershipModal isOpen currentSuperAdmin={owner} onClose={() => {}} onTransferComplete={() => {}} />,
    );
    await screen.findByText(/Adam Admin/);
    expectPortalled(container, 'Transfer Super Admin Ownership');
  });

  it('renders nothing on <body> while closed', () => {
    inSpacedPage(
      <>
        <CreateUserModal isOpen={false} onClose={() => {}} onUserCreated={() => {}} />
        <EditUserModal isOpen={false} user={farmer} onClose={() => {}} onUserUpdated={() => {}} />
        <TransferOwnershipModal isOpen={false} currentSuperAdmin={owner} onClose={() => {}} onTransferComplete={() => {}} />
      </>,
    );
    expect(bodyOverlays()).toHaveLength(0);
  });
});
