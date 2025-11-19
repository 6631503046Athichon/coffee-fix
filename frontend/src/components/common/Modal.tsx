import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl';
  showCloseButton?: boolean;
  className?: string;
  overlayClassName?: string;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '5xl': 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  showCloseButton = true,
  className = '',
  overlayClassName = '',
}) => {
  if (!isOpen) return null;

  // Check if document.body exists (for SSR)
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const modalContent = (
    <div
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 ${overlayClassName}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        className={`bg-white rounded-3xl p-8 shadow-2xl w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] overflow-y-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{ margin: '1rem' }}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between mb-6">
            {title && (
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
