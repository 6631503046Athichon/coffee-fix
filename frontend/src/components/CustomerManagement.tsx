import React, { useState, useEffect } from 'react';
import { Customer, UserRole } from '../types';
import { Users as UsersIcon, UserPlus, Search, X, Building2, Mail, Phone, MapPin, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAllCustomers, deleteCustomer } from '../services/customerService';
import CreateCustomerModal from './modals/CreateCustomerModal';
import { Button } from './common/Button';
import { Input } from './common/Input';

const CustomerManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check if user has Admin or Roaster role
  const hasAccess = currentUser?.roles?.some(role => 
    role === UserRole.Admin || role === UserRole.Roaster
  ) ?? false;

  useEffect(() => {
    if (hasAccess) {
      fetchCustomers();
    }
  }, [hasAccess]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError('');
      const customersList = await getAllCustomers();
      setCustomers(customersList);
    } catch (err: any) {
      console.error('Error fetching customers:', err);
      setError(err.message || 'Failed to load customers. Please check if the backend is running.');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${customer.name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteCustomer(customer.id);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    }
  };

  const handleCustomerCreated = (customer: Customer) => {
    fetchCustomers();
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      'Roaster': 'bg-orange-100 text-orange-700 border-orange-200',
      'Distributor': 'bg-blue-100 text-blue-700 border-blue-200',
      'Retailer': 'bg-green-100 text-green-700 border-green-200',
      'Other': 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return colors[type] || 'bg-gray-100 text-gray-700 border-gray-200';
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
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-800 mb-1">Access Denied</h3>
            <p className="text-sm text-red-700">
              You need Admin or Roaster role to access customer management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-xl">
                <UsersIcon className="h-6 w-6 text-indigo-600" />
              </div>
              Customer Management
            </h1>
            <p className="text-gray-600 mt-2">Manage customer profiles for sales and invoicing</p>
          </div>
          <Button
            variant="primary"
            icon={<UserPlus className="h-5 w-5" />}
            onClick={() => setShowCreateModal(true)}
          >
            Create Customer
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            placeholder="Search customers by name, type, email, phone, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12"
            fullWidth
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {searchTerm ? 'No customers found' : 'No customers yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchTerm
                ? 'Try adjusting your search criteria'
                : 'Create your first customer to get started'}
            </p>
            {!searchTerm && (
              <Button
                variant="primary"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => setShowCreateModal(true)}
              >
                Create Customer
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Address</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{customer.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getTypeBadgeColor(customer.type)}`}>
                        {customer.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700 space-y-1">
                        {customer.contactEmail && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <span>{customer.contactEmail}</span>
                          </div>
                        )}
                        {customer.contactPhone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            <span>{customer.contactPhone}</span>
                          </div>
                        )}
                        {!customer.contactEmail && !customer.contactPhone && (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">
                        {customer.address ? (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{customer.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleDeleteCustomer(customer)}
                        className="text-red-600 hover:text-red-800 font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      <CreateCustomerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
};

export default CustomerManagement;
