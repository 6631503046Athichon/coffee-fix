import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Customer, UserRole } from '@/types';
import { Users as UsersIcon, UserPlus, Search, X, Building2, Mail, Phone, MapPin, Pencil, Trash2, Receipt, ShoppingBag, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDataContext } from '@/hooks/useDataContext';
import { getAllCustomers, deleteCustomer } from '@/services/sales/customerService';
import CreateCustomerModal from '@/components/sales/modals/CreateCustomerModal';
import SaleOrderModal from '@/components/sales/modals/SaleOrderModal';
import {
  DANGER_BTN,
  ICON_BTN,
  ICON_BTN_DANGER,
  OUTLINE_BTN,
  PRIMARY_BTN,
  formatSaleDate,
} from '@/components/sales/saleDisplay';
import { Modal } from '@/components/common/Modal';
import { isAdminUser } from '@/utils/farmAccess';
import { isApiError } from '@/services/apiError';

// Badge colour and the card's left stripe for each customer type.
const TYPE_STYLE: Record<string, { badge: string; stripe: string }> = {
  Roaster: { badge: 'bg-amber-50 text-amber-700', stripe: 'border-l-amber-400' },
  Distributor: { badge: 'bg-blue-50 text-blue-700', stripe: 'border-l-blue-400' },
  Retailer: { badge: 'bg-green-50 text-green-700', stripe: 'border-l-green-500' },
  Other: { badge: 'bg-gray-100 text-gray-700', stripe: 'border-l-gray-300' },
};
const typeStyle = (type: string) => TYPE_STYLE[type] ?? TYPE_STYLE.Other;

const upsertCustomer = (list: Customer[], customer: Customer): Customer[] =>
  list.some((c) => c.id === customer.id)
    ? list.map((c) => (c.id === customer.id ? customer : c))
    : [customer, ...list];

// Header and popup buttons and the row icons use the sales pages' shared look
// (saleDisplay). Row actions: Sell is the one coloured button; the rest are icons.
const smallBtnShape =
  'inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold';
const sellButton = `${smallBtnShape} bg-blue-600 text-white hover:bg-blue-700`;
const salesButton = `${smallBtnShape} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const headCell = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider';

const CustomerManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const { data, setData } = useDataContext();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [sellTo, setSellTo] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  // The server refused the delete (409): sales the viewer cannot see, such as
  // another roaster's, keep the customer. Delete stays off for this popup.
  const [deleteRefused, setDeleteRefused] = useState(false);

  // Check if user has Admin or Roaster role. A super admin counts as an
  // Admin whatever roles the account lists (isAdminUser).
  const hasAccess =
    isAdminUser(currentUser) || !!currentUser?.roles?.includes(UserRole.Roaster);

  // Only the first load shows the spinner; later refetches keep the table.
  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    getAllCustomers().then(
      (list) => {
        if (cancelled) return;
        setCustomers(list);
        // The shared address book changes under other roasters too. The Sell
        // popup picks from the app data, which otherwise only catches up on the
        // 2-minute refresh, so a row could open it with no matching customer.
        setData((prev) => ({ ...prev, customers: list }));
        setError('');
        setLoaded(true);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error('Error fetching customers:', err);
        setError(err instanceof Error && err.message ? err.message : 'Failed to load customers. Please check if the backend is running.');
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasAccess, reloadKey, setData]);

  const fetchCustomers = () => setReloadKey((k) => k + 1);

  // Non-cancelled sales per customer from the viewer's own sales log.
  // `recorded` also counts cancelled ones: the server keeps a customer with
  // any sale on record, cancelled or not.
  const salesByCustomer = useMemo(() => {
    const stats = new Map<string, { count: number; last: string; recorded: number }>();
    for (const order of data.saleOrders) {
      const s = stats.get(order.customerId) ?? { count: 0, last: '', recorded: 0 };
      s.recorded += 1;
      if (order.status !== 'Cancelled') {
        s.count += 1;
        if (order.orderDate > s.last) s.last = order.orderDate;
      }
      stats.set(order.customerId, s);
    }
    return stats;
  }, [data.saleOrders]);

  // '2 sales' and 'last 5 Oct 2026', or null with no sale on record.
  const salesSummary = (customerId: string) => {
    const s = salesByCustomer.get(customerId);
    if (!s || s.count === 0) return null;
    return {
      count: `${s.count} ${s.count === 1 ? 'sale' : 'sales'}`,
      last: `last ${formatSaleDate(s.last)}`,
    };
  };

  // The sales that keep the customer in the popup being shown, said up front
  // so Delete is never offered for a customer the server will refuse.
  const deletingSales = deleting ? salesByCustomer.get(deleting.id) : undefined;
  const deletingSalesText = !deletingSales || deletingSales.recorded === 0
    ? ''
    : deletingSales.count > 0
      ? `${deletingSales.count} ${deletingSales.count === 1 ? 'sale' : 'sales'}`
      : `${deletingSales.recorded} cancelled ${deletingSales.recorded === 1 ? 'sale' : 'sales'}`;
  const cannotDelete = deletingSalesText !== '' || deleteRefused;

  const handleCustomerSaved = (customer: Customer) => {
    setCustomers((prev) => upsertCustomer(prev, customer));
    // The sale popup and the processor's customer list read the app data.
    setData((prev) => ({ ...prev, customers: upsertCustomer(prev.customers, customer) }));
    fetchCustomers();
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowCreateModal(true);
  };

  const askDelete = (customer: Customer) => {
    setDeleteError('');
    setDeleteRefused(false);
    setDeleting(customer);
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy || cannotDelete) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteCustomer(deleting.id);
      const removedId = deleting.id;
      setCustomers((prev) => prev.filter((c) => c.id !== removedId));
      setData((prev) => ({ ...prev, customers: prev.customers.filter((c) => c.id !== removedId) }));
      setDeleting(null);
      fetchCustomers();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error && err.message ? err.message : 'Failed to delete customer');
      // Refused for its sales: pressing Delete again would only be refused again.
      if (isApiError(err) && err.status === 409) setDeleteRefused(true);
    } finally {
      setDeleteBusy(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchLower) ||
      customer.type.toLowerCase().includes(searchLower) ||
      customer.contactEmail?.toLowerCase().includes(searchLower) ||
      customer.contactPhone?.toLowerCase().includes(searchLower) ||
      customer.address?.toLowerCase().includes(searchLower)
    );
  });

  if (!hasAccess) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-red-800 mb-1">Access Denied</h3>
            <p className="text-sm text-red-700">
              You need Admin or Roaster role to access customer management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const typeBadge = (type: string) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${typeStyle(type).badge}`}>
      {type}
    </span>
  );

  const openSalesLog = (customer: Customer) =>
    navigate(`/sales?customer=${encodeURIComponent(customer.id)}`);

  // One line of contact detail: never wraps, the full text is on hover.
  const contactLine = (Icon: typeof Mail, text: string) => (
    <p className="flex min-w-0 items-center gap-1.5" title={text}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </p>
  );

  const editDeleteButtons = (customer: Customer) => (
    <>
      <button
        type="button"
        onClick={() => handleEditCustomer(customer)}
        aria-label={`Edit customer ${customer.name}`}
        title="Edit"
        className={ICON_BTN}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => askDelete(customer)}
        aria-label={`Delete customer ${customer.name}`}
        title="Delete"
        className={ICON_BTN_DANGER}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  const sellButtonFor = (customer: Customer) => (
    <button
      type="button"
      onClick={() => setSellTo(customer)}
      aria-label={`Sell to ${customer.name}`}
      title="Sell coffee to this customer"
      className={sellButton}
    >
      <ShoppingBag className="h-3.5 w-3.5" />
      Sell
    </button>
  );

  const countText = !loaded || error
    ? ''
    : searchTerm && filteredCustomers.length !== customers.length
      ? `${filteredCustomers.length} of ${customers.length} customers`
      : `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex-shrink-0 rounded-lg bg-blue-600 p-2">
              <UsersIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Customer Management</h1>
              <p className="mt-0.5 text-xs text-gray-500">Customers you sell coffee to</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/sales')} className={`${OUTLINE_BTN} flex-1 sm:flex-none`}>
              <Receipt className="h-4 w-4" />
              Sales log
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)} className={`${PRIMARY_BTN} flex-1 sm:flex-none`}>
              <UserPlus className="h-4 w-4" />
              Create Customer
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="min-w-0 flex-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchCustomers}
            className="flex-shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search customers"
            placeholder="Search name, type, email, phone or address"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {countText && (
          <p className="flex-shrink-0 whitespace-nowrap text-xs font-medium text-gray-500" aria-live="polite">
            {countText}
          </p>
        )}
      </div>

      {/* Customers */}
      {!loaded ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-10 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Loading customers...
        </div>
      ) : error && customers.length === 0 ? null : filteredCustomers.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <h3 className="font-semibold text-gray-800">
            {searchTerm ? 'No customers found' : 'No customers yet'}
          </h3>
          <p className="mb-3 text-sm text-gray-500">
            {searchTerm
              ? 'Try adjusting your search criteria'
              : 'Create your first customer to get started'}
          </p>
          {!searchTerm && (
            <button type="button" onClick={() => setShowCreateModal(true)} className={PRIMARY_BTN}>
              <UserPlus className="h-4 w-4" />
              Create Customer
            </button>
          )}
        </div>
      ) : (
        <>
          {/* md and wider: a fixed-layout table. Every column keeps its share
              of the width and long text is cut with an ellipsis (full text on
              hover), so nothing wraps word by word or scrolls sideways. */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-gray-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className={headCell}>Customer</th>
                  <th scope="col" className={headCell}>Contact</th>
                  <th scope="col" className={`${headCell} hidden xl:table-cell`}>Address</th>
                  <th scope="col" className={`${headCell} w-36`}>Sales</th>
                  <th scope="col" className={`${headCell} w-[12.5rem] text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => {
                  const sales = salesSummary(customer.id);
                  const hasContact = !!(customer.contactPhone || customer.contactEmail);
                  return (
                    <tr key={customer.id} className="align-top hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="truncate font-semibold text-gray-900" title={customer.name}>{customer.name}</p>
                        <div className="mt-1">{typeBadge(customer.type)}</div>
                      </td>
                      <td className="space-y-0.5 px-3 py-2.5 text-gray-700">
                        {customer.contactPhone && contactLine(Phone, customer.contactPhone)}
                        {customer.contactEmail && contactLine(Mail, customer.contactEmail)}
                        {/* Below xl the address shares this column. */}
                        {customer.address && <div className="xl:hidden">{contactLine(MapPin, customer.address)}</div>}
                        {!hasContact && !customer.address && <span className="text-gray-400">—</span>}
                        {!hasContact && customer.address && <span className="hidden text-gray-400 xl:inline">—</span>}
                      </td>
                      <td className="hidden px-3 py-2.5 text-gray-700 xl:table-cell">
                        {customer.address ? (
                          <p className="flex min-w-0 items-start gap-1.5" title={customer.address}>
                            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            <span className="line-clamp-2 break-words">{customer.address}</span>
                          </p>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {sales ? (
                          <>
                            <p className="font-medium text-gray-900">{sales.count}</p>
                            <p className="text-xs text-gray-500">{sales.last}</p>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {sellButtonFor(customer)}
                          <button
                            type="button"
                            onClick={() => openSalesLog(customer)}
                            aria-label={`Sales to ${customer.name}`}
                            title="Sales log"
                            className={ICON_BTN}
                          >
                            <Receipt className="h-4 w-4" />
                          </button>
                          {editDeleteButtons(customer)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones and small tablets: stacked cards */}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:hidden" aria-label="Customers">
            {filteredCustomers.map((customer) => {
              const sales = salesSummary(customer.id);
              return (
                <li
                  key={customer.id}
                  className={`min-w-0 rounded-lg border border-l-4 border-gray-200 ${typeStyle(customer.type).stripe} bg-white p-3 text-sm`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900" title={customer.name}>{customer.name}</p>
                      <div className="mt-1">{typeBadge(customer.type)}</div>
                    </div>
                    <div className="-mr-1 -mt-1 flex flex-shrink-0">{editDeleteButtons(customer)}</div>
                  </div>
                  {(customer.contactPhone || customer.contactEmail || customer.address) && (
                    <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                      {customer.contactPhone && contactLine(Phone, customer.contactPhone)}
                      {customer.contactEmail && contactLine(Mail, customer.contactEmail)}
                      {customer.address && contactLine(MapPin, customer.address)}
                    </div>
                  )}
                  <div className="mt-2.5 flex items-center gap-2 border-t border-gray-100 pt-2.5">
                    <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                      {sales ? `${sales.count} · ${sales.last}` : 'No sales yet'}
                    </p>
                    <button
                      type="button"
                      onClick={() => openSalesLog(customer)}
                      aria-label={`Sales to ${customer.name}`}
                      className={salesButton}
                    >
                      <Receipt className="h-3.5 w-3.5" />
                      Sales
                    </button>
                    {sellButtonFor(customer)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Create / Edit Customer Modal */}
      <CreateCustomerModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingCustomer(null); }}
        onCustomerCreated={handleCustomerSaved}
        editCustomer={editingCustomer}
      />

      {/* Sell to this customer; its details open in the sales log afterwards */}
      <SaleOrderModal
        isOpen={!!sellTo}
        initialCustomerId={sellTo?.id}
        // Reload the table: a customer added with the popup's New customer is
        // only in the app data until then.
        onClose={() => { setSellTo(null); fetchCustomers(); }}
        onSaved={(saved) =>
          navigate(`/sales?customer=${encodeURIComponent(saved.customerId)}&sale=${encodeURIComponent(saved.id)}`)
        }
      />

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleting}
        onClose={() => { if (!deleteBusy) setDeleting(null); }}
        maxWidth="sm"
        showCloseButton={false}
        ariaLabelledBy="delete-customer-title"
        className="!p-5 !rounded-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg bg-red-50 p-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="delete-customer-title" className="text-base font-semibold text-gray-900">
              {cannotDelete ? 'Customer cannot be deleted' : 'Delete customer?'}
            </h2>
            <p className="mt-1 break-words text-sm text-gray-600">
              {deletingSalesText
                ? `${deleting?.name} has ${deletingSalesText}, so it cannot be deleted. A customer with sales stays in the address book.`
                : deleteRefused
                  ? `${deleting?.name} cannot be deleted.`
                  : `Delete ${deleting?.name}? This cannot be undone.`}
            </p>
          </div>
        </div>
        {deleteError && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {deleteError}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            disabled={deleteBusy}
            className={OUTLINE_BTN}
          >
            {cannotDelete ? 'Close' : 'Keep customer'}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteBusy || cannotDelete}
            className={DANGER_BTN}
          >
            {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete customer
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerManagement;
