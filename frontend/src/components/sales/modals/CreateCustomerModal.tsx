import React, { useState, useEffect, useId } from 'react';
import { Customer } from '../../../types';
import { Modal } from '../../common/Modal';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Save, UserPlus, X } from 'lucide-react';
import { addCustomer, updateCustomer } from '../../../services/sales/customerService';
import { BLUE_FOCUS, FIELD, FIELD_LABEL, OUTLINE_BTN, PRIMARY_BTN } from '../saleDisplay';

// The sale popups' field skin (saleDisplay): 42px tall, 1px border, rounded-lg.
const field = `${FIELD} border-gray-300 ${BLUE_FOCUS}`;

const Required: React.FC = () => <span className="text-red-500"> *</span>;

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
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    name: `${uid}-name`,
    type: `${uid}-type`,
    email: `${uid}-email`,
    phone: `${uid}-phone`,
    address: `${uid}-address`,
    notes: `${uid}-notes`,
  };

  const [name, setName] = useState('');
  const [type, setType] = useState<'Roaster' | 'Distributor' | 'Retailer' | 'Other'>('Roaster');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const customerTypes = ['Roaster', 'Distributor', 'Retailer', 'Other'] as const;

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

    const trimmedEmail = contactEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    const trimmedPhone = contactPhone.trim();
    if (trimmedPhone && !/^[0-9+\-\s()]{8,20}$/.test(trimmedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsSubmitting(true);

    try {
      const customerData: Partial<Customer> = {
        name: name.trim(),
        type,
        contactEmail: trimmedEmail || undefined,
        contactPhone: trimmedPhone || undefined,
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

  const title = isEditMode ? `Edit Customer: ${editCustomer?.name}` : 'Create New Customer';
  const HeaderIcon = isEditMode ? Pencil : UserPlus;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      showCloseButton={false}
      ariaLabelledBy={ids.title}
      className="!p-5 !rounded-xl"
      mobileFullScreen
    >
      {/* On phones the popup is a full-screen sheet: the form fills it so the
          footer sits at the bottom even when the form is short. */}
      <form onSubmit={handleSubmit} className="flex flex-col max-sm:min-h-[calc(100dvh-2rem)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex-shrink-0 rounded-lg bg-blue-600 p-2">
              <HeaderIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 id={ids.title} className="truncate text-lg font-bold text-gray-900" title={title}>
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {isEditMode ? 'Update the details of this customer' : 'Someone you sell coffee to'}
              </p>
            </div>
          </div>
          {/* Same name as the Modal's own close button, which this replaces. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <label htmlFor={ids.name} className={FIELD_LABEL}>
              Customer Name<Required />
            </label>
            <input
              id={ids.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Roaster ABC"
              required
              className={field}
            />
          </div>

          <div role="radiogroup" aria-labelledby={`${ids.type}-label`}>
            <span id={`${ids.type}-label`} className={FIELD_LABEL}>
              Customer Type<Required />
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {customerTypes.map((t) => (
                <label key={t} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name={ids.type}
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex h-10 items-center justify-center whitespace-nowrap rounded-lg border px-2 text-sm font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                      type === t
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <div className="min-w-0">
              <label htmlFor={ids.email} className={FIELD_LABEL}>
                Contact Email
              </label>
              <input
                id={ids.email}
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="customer@example.com"
                className={field}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.phone} className={FIELD_LABEL}>
                Contact Phone
              </label>
              <input
                id={ids.phone}
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+66 123 456 7890"
                className={field}
              />
            </div>
          </div>

          <div>
            <label htmlFor={ids.address} className={FIELD_LABEL}>
              Address
            </label>
            <textarea
              id={ids.address}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, Country"
              rows={2}
              className={`${field} resize-none`}
            />
          </div>

          <div>
            <label htmlFor={ids.notes} className={FIELD_LABEL}>
              Notes
            </label>
            <textarea
              id={ids.notes}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this customer..."
              rows={2}
              className={`${field} resize-none`}
            />
          </div>
        </div>

        {/* Stays in view while the form scrolls, with what happened to the save. */}
        <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-5 rounded-b-xl border-t border-gray-200 bg-gray-50 px-5 py-3 max-sm:-bottom-4 max-sm:-mx-4 max-sm:-mb-4 max-sm:rounded-none max-sm:px-4">
          {successMessage && (
            <div role="status" className="mb-2 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <p className="min-w-0 flex-1 break-words text-xs font-medium text-green-800">{successMessage}</p>
            </div>
          )}
          {error && (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <p className="min-w-0 flex-1 break-words text-xs font-medium text-red-700">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`${OUTLINE_BTN} flex-1 sm:flex-none`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className={`${PRIMARY_BTN} flex-1 sm:flex-none`}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditMode ? (
                <Save className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {isSubmitting
                ? isEditMode ? 'Saving...' : 'Creating...'
                : isEditMode ? 'Save Changes' : 'Create Customer'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default CreateCustomerModal;
