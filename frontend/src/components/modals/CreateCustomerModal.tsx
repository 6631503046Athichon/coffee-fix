import React, { useState, useEffect } from 'react';
import { Customer } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import Select from '../common/Select';
import { addCustomer, updateCustomer } from '../../services/customerService';

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated?: (customer: Customer) => void;
  /** Pass a customer to switch to edit mode */
  editCustomer?: Customer | null;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
  editCustomer,
}) => {
  const isEditMode = !!editCustomer;

  const [name, setName] = useState('');
  const [type, setType] = useState<'Roaster' | 'Distributor' | 'Retailer' | 'Other'>('Roaster');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const customerTypes = ['Roaster', 'Distributor', 'Retailer', 'Other'];

  useEffect(() => {
    if (isOpen) {
      if (editCustomer) {
        // Pre-fill form with existing customer data
        setName(editCustomer.name);
        setType(editCustomer.type as typeof type);
        setContactEmail(editCustomer.contactEmail || '');
        setContactPhone(editCustomer.contactPhone || '');
        setAddress(editCustomer.address || '');
        setNotes(editCustomer.notes || '');
      } else {
        setName('');
        setType('Roaster');
        setContactEmail('');
        setContactPhone('');
        setAddress('');
        setNotes('');
      }
      setError('');
      setSuccessMessage('');
    }
  }, [isOpen, editCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!name.trim()) {
      setError('Customer name is required');
      return;
    }

    if (!type) {
      setError('Customer type is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const customerData: Partial<Customer> = {
        name: name.trim(),
        type,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      let savedCustomer: Customer;
      if (isEditMode && editCustomer) {
        savedCustomer = await updateCustomer(editCustomer.id, customerData);
        setSuccessMessage(`Customer "${savedCustomer.name}" updated successfully!`);
      } else {
        savedCustomer = await addCustomer(customerData);
        setSuccessMessage(`Customer "${savedCustomer.name}" created successfully!`);
      }

      if (onCustomerCreated) {
        onCustomerCreated(savedCustomer);
      }

      setTimeout(() => {
        setSuccessMessage('');
        setIsSubmitting(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} customer.`);
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? `Edit Customer — ${editCustomer?.name}` : 'Create New Customer'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-2">
            <span className="text-green-600 font-semibold">✓</span>
            <p className="text-sm text-green-800 flex-1">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
            <span className="text-red-600 font-semibold">⚠️</span>
            <p className="text-sm text-red-800 flex-1">{error}</p>
          </div>
        )}

        <div>
          <Input
            label="Customer Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Roaster ABC"
            required
            fullWidth
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Customer Type *
          </label>
          <Select
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={customerTypes}
            placeholder="Select customer type..."
            colorTheme="emerald"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Contact Email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="customer@example.com"
              fullWidth
            />
          </div>
          <div>
            <Input
              label="Contact Phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+66 123 456 7890"
              fullWidth
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, Country"
            rows={3}
            className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes about this customer..."
            rows={3}
            className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} type="button" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting || !name.trim()}>
            {isSubmitting
              ? isEditMode ? 'Saving...' : 'Creating...'
              : isEditMode ? 'Save Changes' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateCustomerModal;
