import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Customer, UserRole } from '@/types';
import { Users as UsersIcon, UserPlus, Search, X, Building2, Mail, Phone, MapPin, Pencil, Trash2, Receipt, ShoppingBag, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDataContext } from '@/hooks/useDataContext';
import { getAllCustomers, deleteCustomer } from '@/services/sales/customerService';
import CreateCustomerModal from '@/components/sales/modals/CreateCustomerModal';
import SaleOrderModal from '@/components/sales/modals/SaleOrderModal';
import { formatSaleDate } from '@/components/sales/saleDisplay';
import { Modal } from '@/components/common/Modal';
import { isAdminUser } from '@/utils/farmAccess';
import { isApiError } from '@/services/apiError';

const TYPE_BADGE: Record<string, string> = {
  Roaster: 'bg-amber-50 text-amber-700',
  Distributor: 'bg-blue-50 text-blue-700',
  Retailer: 'bg-green-50 text-green-700',
  Other: 'bg-gray-100 text-gray-700',
};

const upsertCustomer = (list: Customer[], customer: Customer): Customer[] =>
  list.some((c) => c.id === customer.id)
    ? list.map((c) => (c.id === customer.id ? customer : c))
    : [customer, ...list];

const outlineButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50';
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700';
const rowButton = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors';
const sellButton = `${rowButton} bg-blue-600 text-white hover:bg-blue-700`;
const salesButton = `${rowButton} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const editButton = `${rowButton} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const deleteButton = `${rowButton} border border-red-200 bg-white text-red-600 hover:bg-red-50`;

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

  const salesText = (customerId: string) => {
    const s = salesByCustomer.get(customerId);
    if (!s || s.count === 0) return '—';
    return `${s.count} ${s.count === 1 ? 'sale' : 'sales'} · last ${formatSaleDate(s.last)}`;
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[type] ?? TYPE_BADGE.Other}`}>
      {type}
    </span>
  );

  const rowActions = (customer: Customer) => (
    <>
      <button type="button" onClick={() => setSellTo(customer)} className={sellButton}>
        <ShoppingBag className="h-3 w-3" />
        Sell
      </button>
      <button
        type="button"
        onClick={() => navigate(`/sales?customer=${encodeURIComponent(customer.id)}`)}
        className={salesButton}
      >
        <Receipt className="h-3 w-3" />
        Sales
      </button>
      <button type="button" onClick={() => handleEditCustomer(customer)} className={editButton}>
        <Pencil className="h-3 w-3" />
        Edit
      </button>
      <button type="button" onClick={() => askDelete(customer)} className={deleteButton}>
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Header */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <UsersIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Customer Management</h1>
              <p className="text-sm text-gray-500">Customers you sell coffee to</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/sales')} className={outlineButton}>
              <Receipt className="h-4 w-4" />
              Sales log
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)} className={primaryButton}>
              <UserPlus className="h-4 w-4" />
              Create Customer
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <div className="flex items-start gap-2">
            <X className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search customers"
            placeholder="Search customers by name, type, email, phone, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Customers */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {!loaded ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Loading customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Building2 className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <h3 className="font-semibold text-gray-800">
              {searchTerm ? 'No customers found' : 'No customers yet'}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              {searchTerm
                ? 'Try adjusting your search criteria'
                : 'Create your first customer to get started'}
            </p>
            {!searchTerm && (
              <button type="button" onClick={() => setShowCreateModal(true)} className={primaryButton}>
                <UserPlus className="h-4 w-4" />
                Create Customer
              </button>
            )}
          </div>
        ) : (
          <>
            {/* md and wider: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sales</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50 align-top">
                      <td className="px-3 py-2 font-semibold text-gray-900">{customer.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{typeBadge(customer.type)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {customer.contactEmail && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <span>{customer.contactEmail}</span>
                          </div>
                        )}
                        {customer.contactPhone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            <span>{customer.contactPhone}</span>
                          </div>
                        )}
                        {!customer.contactEmail && !customer.contactPhone && (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {customer.address ? (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{customer.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{salesText(customer.id)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">{rowActions(customer)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: compact cards */}
            <ul className="md:hidden divide-y divide-gray-100" aria-label="Customers">
              {filteredCustomers.map((customer) => (
                <li key={customer.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{customer.name}</span>
                    {typeBadge(customer.type)}
                  </div>
                  {customer.contactPhone && <p className="text-xs text-gray-600">{customer.contactPhone}</p>}
                  <p className="text-xs text-gray-500">{salesText(customer.id)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{rowActions(customer)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

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
        <div>
          <p id="delete-customer-title" className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            {cannotDelete ? 'Customer cannot be deleted' : 'Delete customer?'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {deletingSalesText
              ? `${deleting?.name} has ${deletingSalesText}, so it cannot be deleted. A customer with sales stays in the address book.`
              : deleteRefused
                ? `${deleting?.name} cannot be deleted.`
                : `Delete ${deleting?.name}? This cannot be undone.`}
          </p>
          {deleteError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {deleteError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cannotDelete ? 'Close' : 'Keep customer'}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteBusy || cannotDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete customer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerManagement;
